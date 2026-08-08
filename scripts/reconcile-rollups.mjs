import postgres from "postgres";

// Rebuilds the retained bot_hits_daily window and reconciles bot_first_seen
// from the raw bot_hits table. Rollups older than the retained raw window are
// deliberately preserved so raw-event retention cannot erase long-range
// aggregate history.
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
  const [window] = await sql`
    SELECT MIN(created_at)::date AS min_day, MAX(created_at)::date AS max_day
    FROM bot_hits
    WHERE heartbeat = FALSE
  `;

  if (!window.min_day || !window.max_day) {
    console.log("no retained raw events; rollups were left unchanged");
    return;
  }

  const [before] = await sql`
    SELECT
      (SELECT COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate,0))), 0)
       FROM bot_hits
       WHERE heartbeat = FALSE
         AND created_at::date BETWEEN ${window.min_day} AND ${window.max_day})::int AS raw,
      (SELECT COALESCE(SUM(hits), 0)
       FROM bot_hits_daily
       WHERE day BETWEEN ${window.min_day} AND ${window.max_day})::int AS rollup
  `;
  console.log(`window: ${window.min_day} through ${window.max_day}`);
  console.log(`before: raw=${before.raw} rollup=${before.rollup} gap=${before.raw - before.rollup}`);

  await sql.begin(async (tx) => {
    // Rebuild only the date window still represented by raw events. Older
    // rollups may outlive raw retention and must not be deleted here.
    await tx`
      DELETE FROM bot_hits_daily
      WHERE day BETWEEN ${window.min_day} AND ${window.max_day}
    `;
    await tx`
      INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
      SELECT DATE(created_at), project_name, bot_name, bot_category,
             CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
                  WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
                  WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
                  WHEN status_code >= 500 THEN '5xx' ELSE 'unknown' END,
             ROUND(SUM(1.0/NULLIF(sample_rate,0))),
             -- COALESCE guards a bucket with zero verified rows: SUM(...)
             -- FILTER (WHERE ...) returns NULL (not 0) when nothing matches
             -- the filter, and verified_hits is NOT NULL — without this,
             -- rebuilding any all-ua_only bucket (a common case, e.g. most
             -- error-status buckets) crashes the whole reconcile.
             COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate,0)) FILTER (WHERE confidence = 'verified')), 0)
      FROM bot_hits
      WHERE heartbeat = FALSE
        AND created_at::date BETWEEN ${window.min_day} AND ${window.max_day}
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
      (SELECT COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate,0))), 0)
       FROM bot_hits
       WHERE heartbeat = FALSE
         AND created_at::date BETWEEN ${window.min_day} AND ${window.max_day})::int AS raw,
      (SELECT COALESCE(SUM(hits), 0)
       FROM bot_hits_daily
       WHERE day BETWEEN ${window.min_day} AND ${window.max_day})::int AS rollup
  `;
  console.log(`after:  raw=${after.raw} rollup=${after.rollup} gap=${after.raw - after.rollup}`);
  console.log(after.raw === after.rollup ? "reconciled: retained rollup window matches raw" : "WARNING: retained rollup window has a gap (concurrent writes?) — re-run");
}

try {
  await main();
} finally {
  await sql.end();
}
