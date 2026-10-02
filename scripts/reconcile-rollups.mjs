import postgres from "postgres";
import { loadEnv } from "./env.mjs";

loadEnv();
const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error("Usage: BOT_INGESTION_PAUSED=true node scripts/reconcile-rollups.mjs [DATABASE_URL]");
  process.exit(1);
}
// Operator attestation: stop the collector before running maintenance. This
// offline policy avoids losing concurrent ingestion during a rebuild.
if (process.env.BOT_INGESTION_PAUSED !== "true") {
  console.error("Stop ingestion, then set BOT_INGESTION_PAUSED=true to acknowledge the maintenance pause.");
  process.exit(1);
}
const assertedFrom = process.env.RAW_COMPLETE_FROM;
if (assertedFrom && (!/^\d{4}-\d{2}-\d{2}$/.test(assertedFrom) || (Number.isNaN(new Date(`${assertedFrom}T00:00:00Z`).getTime()) || new Date(`${assertedFrom}T00:00:00Z`).toISOString().slice(0, 10) !== assertedFrom))) {
  console.error("RAW_COMPLETE_FROM must be a valid UTC date (YYYY-MM-DD) for an interval you know is complete.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, connection: { timezone: "UTC" } });
try {
  await sql.begin(async (tx) => {
    const [state] = await tx`SELECT complete_from::text, pruned_before::text FROM raw_retention_state WHERE singleton = TRUE FOR UPDATE`;
    const from = assertedFrom || state?.complete_from;
    if (assertedFrom && state?.pruned_before && assertedFrom < state.pruned_before) throw new Error("RAW_COMPLETE_FROM cannot precede the recorded pruning boundary.");
    const [{ until }] = await tx`SELECT ((now() AT TIME ZONE 'UTC')::date + 1)::text AS until`;
    if (!from || from >= until) {
      console.log("No complete raw interval to rebuild; uncertain and aggregate-only history left unchanged.");
      return;
    }
    console.log(`rebuild interval: [${from} 00:00 UTC, ${until} 00:00 UTC); earlier/uncertain history left unchanged`);
    await tx`DELETE FROM bot_hits_daily WHERE day >= ${from}::date AND day < ${until}::date`;
    await tx`
      INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
      SELECT created_at::date, project_name, bot_name, bot_category,
        CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
             WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
             WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
             WHEN status_code >= 500 AND status_code < 600 THEN '5xx' ELSE 'unknown' END,
        COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate::text::numeric,0))), 0),
        COALESCE(ROUND(SUM(1.0/NULLIF(sample_rate::text::numeric,0)) FILTER (WHERE confidence = 'verified')), 0)
      FROM bot_hits
      WHERE heartbeat = FALSE AND created_at >= ${from}::date AND created_at < ${until}::date
      GROUP BY 1, 2, 3, 4, 5
    `;
    await tx`
      INSERT INTO bot_first_seen (bot_name, first_seen, last_seen)
      SELECT bot_name, MIN(created_at), MAX(created_at) FROM bot_hits
      WHERE heartbeat = FALSE AND bot_name != '' AND created_at >= ${from}::date AND created_at < ${until}::date
      GROUP BY bot_name
      ON CONFLICT (bot_name) DO UPDATE SET
        first_seen = LEAST(bot_first_seen.first_seen, EXCLUDED.first_seen),
        last_seen = GREATEST(bot_first_seen.last_seen, EXCLUDED.last_seen)
    `;
    if (assertedFrom) await tx`UPDATE raw_retention_state SET complete_from = ${from}::date, updated_at = now() WHERE singleton = TRUE`;
    console.log("reconciled: complete rollup interval matches weighted raw events");
  });
} finally {
  await sql.end();
}
