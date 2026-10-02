import { describe, expect, it } from "vitest";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

// Integration tests only run when TEST_DATABASE_URL is set — they need a
// real Postgres database. Set TEST_DATABASE_URL to a disposable database,
// apply migrations first, then run `npm run test:integration`. Without it,
// these tests skip and do not verify database behavior.
const execFileAsync = promisify(execFile);
const url = process.env.TEST_DATABASE_URL;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrateScript = join(__dirname, "..", "..", "scripts", "migrate.mjs");
const migrationsDir = join(__dirname, "..", "..", "db", "migrations");

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
          AND table_name IN ('bot_hits', 'bot_hits_daily', 'bot_first_seen', 'project_health', 'schema_migrations')
      `;
      const names = tables.map((t) => t.table_name).sort();
      expect(names).toEqual(["bot_first_seen", "bot_hits", "bot_hits_daily", "project_health", "schema_migrations"]);

      const appliedBefore = await sql`SELECT name FROM schema_migrations ORDER BY name`;
      expect(appliedBefore.length).toBeGreaterThanOrEqual(4);

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

// The test above proves bookkeeping is idempotent, but a fresh installation
// normally applies 002 against an empty raw table. That does not exercise
// aggregation of pre-existing rows. Recorded migrations are never rerun.
//
// This suite runs the migration SQL directly (not via migrate.mjs, and not
// against "public") inside a scratch schema created fresh for this test and
// dropped afterward, so it's isolated from whatever "public" already has —
// including from other integration test files that may run concurrently
// against the same database.
describe.skipIf(!url)("002_rollups.sql backfill", () => {
  const schema = `vitest_backfill_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  it("aggregates existing bot_hits into bot_hits_daily and bot_first_seen, excluding heartbeats", async () => {
    const sql = postgres(url as string, { max: 1, connection: { timezone: "UTC" } });
    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}"`);

      const init = readFileSync(join(migrationsDir, "001_init.sql"), "utf8");
      await sql.unsafe(init);

      // Pre-existing raw rows a real backfill would run against: two bots,
      // two days, a mix of status classes/confidence, plus a heartbeat that
      // must be excluded from both the rollup and first_seen backfill.
      const day1 = "2026-01-01T12:00:00Z";
      const day2 = "2026-01-02T12:00:00Z";
      await sql.unsafe(`
        INSERT INTO bot_hits (created_at, project_name, bot_name, bot_category, status_code, confidence, heartbeat)
        VALUES
          ('${day1}', 'proj', 'GPTBot', 'ai_training', 200, 'verified', FALSE),
          ('${day1}', 'proj', 'GPTBot', 'ai_training', 200, 'ua_only', FALSE),
          ('${day1}', 'proj', 'GPTBot', 'ai_training', 404, 'ua_only', FALSE),
          ('${day2}', 'proj', 'GPTBot', 'ai_training', 200, 'verified', FALSE),
          ('${day1}', 'proj', 'AhrefsBot', 'seo_crawler', 500, 'ua_only', FALSE),
          ('${day1}', 'proj', 'GPTBot', 'ai_training', 200, 'verified', TRUE)
      `);

      const rollups = readFileSync(join(migrationsDir, "002_rollups.sql"), "utf8");
      await sql.unsafe(rollups);

      const daily = await sql<{ day: string; bot_name: string; status_class: string; hits: number; verified_hits: number }[]>`
        SELECT day::text, bot_name, status_class, hits, verified_hits FROM bot_hits_daily ORDER BY day, bot_name, status_class
      `;
      expect(daily).toEqual([
        { day: "2026-01-01", bot_name: "AhrefsBot", status_class: "5xx", hits: 1, verified_hits: 0 },
        { day: "2026-01-01", bot_name: "GPTBot", status_class: "2xx", hits: 2, verified_hits: 1 },
        { day: "2026-01-01", bot_name: "GPTBot", status_class: "4xx", hits: 1, verified_hits: 0 },
        { day: "2026-01-02", bot_name: "GPTBot", status_class: "2xx", hits: 1, verified_hits: 1 },
      ]);
      // The heartbeat row's own hit must not appear anywhere — in particular
      // not folded into day1's GPTBot 2xx bucket (which would make hits: 3).

      const firstSeen = await sql<{ bot_name: string; first_seen: Date; last_seen: Date }[]>`
        SELECT bot_name, first_seen, last_seen FROM bot_first_seen ORDER BY bot_name
      `;
      expect(firstSeen).toHaveLength(2);
      const gptbot = firstSeen.find((r) => r.bot_name === "GPTBot")!;
      expect(gptbot.first_seen.toISOString()).toBe(new Date(day1).toISOString());
      expect(gptbot.last_seen.toISOString()).toBe(new Date(day2).toISOString());
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });
});


describe.skipIf(!url)("already-pruned upgrade and rebuild", () => {
  it("preserves aggregate-only and partial days through pending 004, rebuilds only an attested interval and remains stable", async () => {
    const schema = `vitest_preserve_${Date.now()}`;
    const admin = postgres(url as string, { max: 1 });
    const scoped = postgres(url as string, { max: 1, connection: { search_path: schema, timezone: "UTC" } });
    const target = new URL(url as string);
    target.searchParams.set("search_path", schema);
    const reconcileScript = join(__dirname, "..", "..", "scripts", "reconcile-rollups.mjs");
    try {
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      for (const file of ["001_init.sql", "002_rollups.sql", "003_project_health.sql"]) await scoped.unsafe(readFileSync(join(migrationsDir, file), "utf8"));
      await scoped`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`;
      for (const file of ["001_init.sql", "002_rollups.sql", "003_project_health.sql"]) await scoped`INSERT INTO schema_migrations (name) VALUES (${file})`;
      await scoped`INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits) VALUES
        ('2026-01-01', 'preserve', 'OlderBot', 'generic', '2xx', 90, 0),
        ('2026-02-01', 'preserve', 'BoundaryBot', 'generic', '2xx', 100, 0),
        ('2026-02-02', 'preserve', 'CompleteBot', 'generic', '2xx', 999, 0)`;
      await scoped`INSERT INTO bot_hits (created_at, project_name, bot_name, bot_category, status_code, sample_rate) VALUES
        ('2026-02-01T12:00:00Z', 'preserve', 'BoundaryBot', 'generic', 200, 1),
        ('2026-02-02T12:00:00Z', 'preserve', 'CompleteBot', 'generic', 200, 0.25)`;
      await execFileAsync("node", [migrateScript, target.toString()]);
      const totals = async () => (await scoped`SELECT hits FROM bot_hits_daily ORDER BY day`).map((row) => row.hits);
      expect(await totals()).toEqual([90, 100, 999]);
      // An unknown legacy pruning interval must never be inferred from MIN(raw).
      const env = { ...process.env, BOT_INGESTION_PAUSED: "true", RAW_COMPLETE_FROM: "" };
      await execFileAsync("node", [reconcileScript, target.toString()], { env });
      expect(await totals()).toEqual([90, 100, 999]);
      for (let i = 0; i < 2; i++) {
        const output = await execFileAsync("node", [reconcileScript, target.toString()], { env: { ...env, RAW_COMPLETE_FROM: "2026-02-02" } });
        expect(output.stdout).toContain("earlier/uncertain history left unchanged");
        expect(await totals()).toEqual([90, 100, 4]);
      }
      const rerun = await execFileAsync("node", [migrateScript, target.toString()]);
      expect(rerun.stdout).toContain("skipped (already applied): 004_weighted_rollups.sql");
      expect(await totals()).toEqual([90, 100, 4]);
    } finally {
      await scoped.end();
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
});
