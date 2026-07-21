import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

// Integration tests only run when TEST_DATABASE_URL is set — they need a
// real Postgres database. `npm test` (unit only) never sets it, so these are
// skipped by default; CI provides a postgres:16 service and sets it before
// running `npm run test:integration`.
const url = process.env.TEST_DATABASE_URL;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrateScript = join(__dirname, "..", "..", "scripts", "migrate.mjs");

function runMigrate(): string {
  return execFileSync("node", [migrateScript, url as string], { encoding: "utf8" });
}

describe.skipIf(!url)("migrations", () => {
  it("applies db/migrations/*.sql and re-running is a no-op", async () => {
    // First run: applies whatever isn't yet recorded in schema_migrations
    // (idempotent — safe against a DB that's already migrated by an earlier
    // test run or the app itself).
    runMigrate();

    const sql = postgres(url as string, { max: 1 });
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('bot_hits', 'bot_hits_daily', 'bot_first_seen', 'schema_migrations')
      `;
      const names = tables.map((t) => t.table_name).sort();
      expect(names).toEqual(["bot_first_seen", "bot_hits", "bot_hits_daily", "schema_migrations"]);

      const appliedBefore = await sql`SELECT name FROM schema_migrations ORDER BY name`;
      expect(appliedBefore.length).toBeGreaterThanOrEqual(2);

      // Second run should be a total no-op: same applied set, no errors.
      const secondOutput = runMigrate();
      expect(secondOutput).toContain("skipped");

      const appliedAfter = await sql`SELECT name FROM schema_migrations ORDER BY name`;
      expect(appliedAfter.map((r) => r.name)).toEqual(appliedBefore.map((r) => r.name));
    } finally {
      await sql.end();
    }
  });
});
