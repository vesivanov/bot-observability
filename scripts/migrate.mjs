import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error("Usage: node scripts/migrate.mjs <DATABASE_URL>");
  console.error("(or set the DATABASE_URL environment variable)");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "db", "migrations");

// Pin the session to UTC: 001_init.sql's DATE()/day-related columns and
// 002_rollups.sql's one-time backfill (DATE(created_at)) must bucket on the
// same UTC calendar day that the app's query layer assumes (see db.ts
// createDbClient), regardless of the server's configured default timezone.
const sql = postgres(url, { max: 1, connection: { timezone: "UTC" } });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  const appliedRows = await sql`SELECT name FROM schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skipped (already applied): ${file}`);
      continue;
    }

    // 001_init.sql is idempotent `IF NOT EXISTS` DDL, but on a pre-existing
    // database (bot_hits already present) we don't want to re-run it — just
    // record it as applied so future runs treat it consistently.
    if (file === "001_init.sql") {
      const [{ exists }] = await sql`SELECT to_regclass('public.bot_hits') IS NOT NULL AS exists`;
      if (exists) {
        await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
        console.log(`skipped (bot_hits already exists, recorded only): ${file}`);
        continue;
      }
    }

    const script = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(script);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`applied: ${file}`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
