import { describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

// execFile (not execFileSync): this suite runs alongside other integration
// test files that are doing their own concurrent async Postgres I/O in the
// same process. A *Sync child_process call blocks the event loop for the
// script's whole run, which can stall those other files' in-flight queries —
// a real, if hard-to-reproduce-locally, source of CI-only flakiness.
const execFileAsync = promisify(execFile);

// Integration tests only run when TEST_DATABASE_URL is set — see
// migrations.test.ts for the full rationale.
const url = process.env.TEST_DATABASE_URL;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "..", "db", "migrations");
const reconcileScript = join(__dirname, "..", "..", "scripts", "reconcile-rollups.mjs");

// scripts/reconcile-rollups.mjs operates on ALL of bot_hits/bot_hits_daily —
// unlike insertHit/queries elsewhere, it has no per-project scoping (it
// exists specifically to rebuild the rollup wholesale). Running it against
// "public" would race with every other integration test file inserting rows
// concurrently, so this test creates its own Postgres schema and points the
// script at it via the `search_path` connection param (merged into the
// startup packet by the `postgres` driver from any unrecognized URL query
// param) — fully isolated from whatever "public" has at the time.
function withSearchPath(rawUrl: string, schema: string): string {
  const u = new URL(rawUrl);
  u.searchParams.set("search_path", schema);
  return u.toString();
}

describe.skipIf(!url)("reconcile-rollups.mjs", () => {
  const schema = `vitest_reconcile_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  it("rebuilds bot_hits_daily and bot_first_seen wholesale from bot_hits, overwriting stale rows and excluding heartbeats", async () => {
    const admin = postgres(url as string, { max: 1 });
    const scoped = postgres(url as string, { max: 1, connection: { search_path: schema } });
    try {
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);

      const init = readFileSync(join(migrationsDir, "001_init.sql"), "utf8");
      await scoped.unsafe(init);
      const rollups = readFileSync(join(migrationsDir, "002_rollups.sql"), "utf8");
      await scoped.unsafe(rollups);

      const day1 = "2026-02-01T10:00:00Z";
      const day2 = "2026-02-02T10:00:00Z";
      await scoped.unsafe(`
        INSERT INTO bot_hits (created_at, project_name, bot_name, bot_category, status_code, confidence, sample_rate, heartbeat)
        VALUES
          ('${day1}', 'proj', 'BotX', 'ai_training', 200, 'verified', 1,   FALSE),
          ('${day1}', 'proj', 'BotX', 'ai_training', 200, 'ua_only',  1,   FALSE),
          ('${day1}', 'proj', 'BotX', 'ai_training', 404, 'ua_only',  1,   FALSE),
          ('${day1}', 'proj', 'BotX', 'ai_training', 200, 'verified', 0.2, FALSE),
          ('${day1}', 'proj', 'BotX', 'ai_training', 200, 'verified', 1,   TRUE),
          ('${day2}', 'proj', 'BotX', 'ai_training', 200, 'verified', 1,   FALSE)
      `);

      // Simulate drift the reconcile is meant to fix: a stale/wrong existing
      // count for a bot that still has raw rows (must be overwritten, not
      // added to), and a leftover row for a bot with NO raw rows at all
      // (must be wiped entirely by the full rebuild's DELETE).
      await scoped.unsafe(`
        INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
        VALUES
          ('2026-02-01', 'proj', 'BotX', 'ai_training', '2xx', 1, 1),
          ('2026-02-01', 'proj', 'GhostBot', 'generic', '2xx', 999, 999)
      `);

      const { stdout } = await execFileAsync("node", [reconcileScript, withSearchPath(url as string, schema)]);
      expect(stdout).toContain("reconciled: rollup matches raw");

      const daily = await scoped<{ day: string; bot_name: string; status_class: string; hits: number; verified_hits: number }[]>`
        SELECT day::text, bot_name, status_class, hits, verified_hits FROM bot_hits_daily ORDER BY day, bot_name, status_class
      `;
      expect(daily).toEqual([
        // Stale hits=1 was overwritten (not added to) — correct weighted
        // total is 1 (verified) + 1 (ua_only) + 5 (1/0.2 sampled) = 7, with
        // the heartbeat row contributing nothing.
        { day: "2026-02-01", bot_name: "BotX", status_class: "2xx", hits: 7, verified_hits: 6 },
        { day: "2026-02-01", bot_name: "BotX", status_class: "4xx", hits: 1, verified_hits: 0 },
        { day: "2026-02-02", bot_name: "BotX", status_class: "2xx", hits: 1, verified_hits: 1 },
        // GhostBot is gone: no raw bot_hits row backs it, and the rebuild
        // DELETEs the whole table before re-inserting from bot_hits.
      ]);

      const firstSeen = await scoped<{ bot_name: string; first_seen: Date; last_seen: Date }[]>`
        SELECT bot_name, first_seen, last_seen FROM bot_first_seen ORDER BY bot_name
      `;
      expect(firstSeen).toHaveLength(1);
      expect(firstSeen[0].bot_name).toBe("BotX");
      expect(firstSeen[0].first_seen.toISOString()).toBe(new Date(day1).toISOString());
      expect(firstSeen[0].last_seen.toISOString()).toBe(new Date(day2).toISOString());
    } finally {
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
      await scoped.end();
    }
  });
});
