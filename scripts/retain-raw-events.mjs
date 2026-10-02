import postgres from "postgres";
import { loadEnv } from "./env.mjs";

loadEnv();

// Optional scheduled cleanup for the append-only raw table. Daily rollups,
// first/last-seen data, and project health are intentionally untouched.
//
// Usage:
//   node scripts/retain-raw-events.mjs [DATABASE_URL] [RETENTION_DAYS]
//   RAW_EVENT_RETENTION_DAYS=90 npm run retain-raw

const url = process.argv[2] || process.env.DATABASE_URL;
const rawDays = process.argv[3] || process.env.RAW_EVENT_RETENTION_DAYS || "90";
const retentionDays = Number(rawDays);
const rawBatchSize = process.env.RAW_EVENT_RETENTION_BATCH_SIZE || "5000";
const batchSize = Number(rawBatchSize);

if (!url || !Number.isInteger(retentionDays) || retentionDays < 1 || !Number.isInteger(batchSize) || batchSize < 1) {
  console.error("Usage: node scripts/retain-raw-events.mjs <DATABASE_URL> [RETENTION_DAYS]");
  console.error("(or set DATABASE_URL, RAW_EVENT_RETENTION_DAYS, and RAW_EVENT_RETENTION_BATCH_SIZE; all values must be positive integers)");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connection: { timezone: "UTC" } });

try {
  // Record the boundary before the first batch: even a partially completed
  // cleanup must never let reconciliation replace the pruned interval.
  const [boundary] = await sql`SELECT (date_trunc('day', now() AT TIME ZONE 'UTC') - (${retentionDays} * INTERVAL '1 day'))::date::text AS cutoff`;
  await sql`UPDATE raw_retention_state SET complete_from = GREATEST(complete_from, ${boundary.cutoff}::date), pruned_before = GREATEST(pruned_before, ${boundary.cutoff}::date), updated_at = now() WHERE singleton = TRUE`;
  let removed = 0;
  while (true) {
    const result = await sql`
      DELETE FROM bot_hits
      WHERE id IN (
        SELECT id
        FROM bot_hits
        WHERE created_at < ${boundary.cutoff}::date
        ORDER BY created_at, id
        LIMIT ${batchSize}
      )
    `;
    const count = result.count ?? 0;
    removed += count;
    if (count < batchSize) break;
  }
  console.log(`removed ${removed} raw event(s) before ${boundary.cutoff} 00:00 UTC in batches of ${batchSize}; daily history preserved`);
} finally {
  await sql.end();
}
