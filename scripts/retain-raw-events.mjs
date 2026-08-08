import postgres from "postgres";

// Optional scheduled cleanup for the append-only raw table. Daily rollups,
// first/last-seen data, and project health are intentionally untouched.
//
// Usage:
//   node scripts/retain-raw-events.mjs [DATABASE_URL] [RETENTION_DAYS]
//   RAW_EVENT_RETENTION_DAYS=90 npm run retain-raw

const url = process.argv[2] || process.env.DATABASE_URL;
const rawDays = process.argv[3] || process.env.RAW_EVENT_RETENTION_DAYS || "90";
const retentionDays = Number(rawDays);

if (!url || !Number.isInteger(retentionDays) || retentionDays < 1) {
  console.error("Usage: node scripts/retain-raw-events.mjs <DATABASE_URL> [RETENTION_DAYS]");
  console.error("(or set DATABASE_URL and RAW_EVENT_RETENTION_DAYS; retention must be a positive integer)");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connection: { timezone: "UTC" } });

try {
  const result = await sql`
    DELETE FROM bot_hits
    WHERE created_at < now() - (${retentionDays} * INTERVAL '1 day')
    RETURNING id
  `;
  console.log(`removed ${result.count ?? 0} raw event(s) older than ${retentionDays} day(s)`);
} finally {
  await sql.end();
}
