import postgres from "postgres";

// Rebuilds the bot_hits_daily rollup and reconciles bot_first_seen from the
// raw bot_hits table. Safe to run any time and as often as you like.
//
// Why this exists: the rollup and first_seen tables are maintained
// incrementally by insertHit at ingest time. The one-time backfill in
// db/migrations/002_rollups.sql seeds them from history, but any raw rows
// written by an OLDER build that didn't do the rollup upsert (e.g. traffic
// ingested between applying the migration and deploying the rollup-aware
// code) leave the rollup behind. Re-running the migration can't fix that
// (its backfill is ON CONFLICT DO NOTHING). Run this once after deploying,
// and any time you suspect drift, to restore exact rollup==raw parity.
//
// Usage: node scripts/reconcile-rollups.mjs <DATABASE_URL>
//        (or set the DATABASE_URL environment variable)

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error("Usage: node scripts/reconcile-rollups.mjs <DATABASE_URL>");
  console.error("(or set the DATABASE_URL environment variable)");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connection: { timezone: "UTC" } });

async function main() {
  // "raw" is weighted the same way the rollup rebuild below weights it
  // (SUM(1/sample_rate), not COUNT(*)) so this comparison stays meaningful
  // once sampled traffic is involved — an unweighted COUNT(*) would never
  // match the weighted rollup total for any sampled row.
  const [before] = await sql`
    SELECT
      (SELECT COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate,0))), 0) FROM bot_hits WHERE heartbeat = FALSE)::int AS raw,
      (SELECT COALESCE(SUM(hits), 0) FROM bot_hits_daily)::int AS rollup
  `;
  console.log(`before:  raw=${before.raw}  rollup=${before.rollup}  gap=${before.raw - before.rollup}`);

  await sql.begin(async (tx) => {
    // Rollup is fully derived from raw, so rebuild it wholesale. DELETE (not
    // TRUNCATE) keeps the operation MVCC-friendly against concurrent inserts.
    // ON CONFLICT DO UPDATE (rather than assuming the table is empty after
    // DELETE) keeps this idempotent against a concurrent insertHit landing a
    // new (day, project, bot, category, status_class) row between the
    // DELETE and this INSERT — without it, that race aborts the whole
    // transaction and "safe to run any time" would be false.
    await tx`DELETE FROM bot_hits_daily`;
    await tx`
      INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
      SELECT DATE(created_at), project_name, bot_name, bot_category,
             CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
                  WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
                  WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
                  WHEN status_code >= 500 THEN '5xx' ELSE 'unknown' END,
             ROUND(SUM(1.0/NULLIF(sample_rate,0))),
             ROUND(SUM(1.0/NULLIF(sample_rate,0)) FILTER (WHERE confidence = 'verified'))
      FROM bot_hits WHERE heartbeat = FALSE
      GROUP BY 1, 2, 3, 4, 5
      ON CONFLICT (day, project_name, bot_name, bot_category, status_class)
      DO UPDATE SET
        hits = EXCLUDED.hits,
        verified_hits = EXCLUDED.verified_hits
    `;

    // first_seen is a running min/max — reconcile without dropping existing
    // rows so a name that no longer appears in a pruned raw window is kept.
    await tx`
      INSERT INTO bot_first_seen (bot_name, first_seen, last_seen)
      SELECT bot_name, MIN(created_at), MAX(created_at) FROM bot_hits
      WHERE heartbeat = FALSE AND bot_name != '' GROUP BY bot_name
      ON CONFLICT (bot_name) DO UPDATE SET
        first_seen = LEAST(bot_first_seen.first_seen, EXCLUDED.first_seen),
        last_seen = GREATEST(bot_first_seen.last_seen, EXCLUDED.last_seen)
    `;
  });

  const [after] = await sql`
    SELECT
      (SELECT COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate,0))), 0) FROM bot_hits WHERE heartbeat = FALSE)::int AS raw,
      (SELECT COALESCE(SUM(hits), 0) FROM bot_hits_daily)::int AS rollup
  `;
  console.log(`after:   raw=${after.raw}  rollup=${after.rollup}  gap=${after.raw - after.rollup}`);
  console.log(after.raw === after.rollup ? "reconciled: rollup matches raw" : "WARNING: gap remains (concurrent writes?) — re-run");
}

try {
  await main();
} finally {
  await sql.end();
}
