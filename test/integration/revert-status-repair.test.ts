import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const exec = promisify(execFile);
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("reverting a historical status repair", () => {
  it("restores exactly the forwarded 200s a repair changed, plus interim 0s, while keeping its other corrections", async () => {
    const schema = `vitest_revert_${Date.now()}`;
    const directory = mkdtempSync(join(tmpdir(), "bot-history-revert-"));
    const manifest = join(directory, "plan.json");
    const repairBackup = join(directory, "repair.json.gz");
    const backup = join(directory, "revert.json.gz");
    const target = new URL(url!); target.searchParams.set("search_path", schema);
    const sql = postgres(target.toString(), { max: 1, connection: { timezone: "UTC" } });
    const env = { ...process.env, DATABASE_URL: target.toString() };
    const plan = { id: "fixture", before: "2026-10-19T21:30:00Z",
      unknownStatusSources: [{ project: "site", host: "site.test", evidence: "Fixture request-stage sender" }],
      excludeLocalSources: [{ project: "site", host: "localhost:3000", evidence: "Fixture local tests" }],
      expected: { statusRows: 2, excludedRows: 1, restoredRollupHits: 0, aggregateOnlyRequests: 0 } };
    writeFileSync(manifest, JSON.stringify(plan));
    const revert = (...args: string[]) => exec("node", ["scripts/revert-status-repair.mjs", "--repair", "fixture", "--repair-backup", repairBackup, ...args], { env });
    try {
      await sql.unsafe(`CREATE SCHEMA ${schema}`);
      for (const file of readdirSync("db/migrations").filter(f => f.endsWith(".sql")).sort()) {
        await sql.unsafe(readFileSync(join("db/migrations", file), "utf8"));
      }
      await sql`INSERT INTO bot_hits (created_at, project_name, host, bot_name, status_code, sample_rate, confidence, path) VALUES
        ('2026-07-01', 'site', 'site.test', 'Bot', 200, 0.1, 'verified', '/en'),
        ('2026-07-01', 'site', 'site.test', 'Bot', 200, 1, 'ua_only', '/missing'),
        ('2026-07-01', 'site', 'site.test', 'Bot', 301, 1, 'ua_only', '/'),
        ('2026-07-01', 'site', 'site.test', 'Bot', 0, 1, 'ua_only', '/unknown'),
        ('2026-07-01', 'other', 'site.test', 'Bot', 200, 1, 'ua_only', '/other'),
        ('2026-07-01', 'site', 'localhost:3000', 'Bot', 200, 1, 'ua_only', '/local')`;
      const daily = `INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
        SELECT created_at::date, project_name, bot_name, bot_category,
          CASE WHEN status_code = 200 THEN '2xx' WHEN status_code = 301 THEN '3xx' ELSE 'unknown' END,
          SUM(1/sample_rate::text::numeric)::int,
          COALESCE(SUM(1/sample_rate::text::numeric) FILTER (WHERE confidence = 'verified'), 0)::int
        FROM bot_hits WHERE heartbeat = FALSE AND event_id IS NULL GROUP BY 1, 2, 3, 4, 5`;
      await sql.unsafe(daily);
      const state = async () => ({
        raw: await sql`SELECT path, status_code FROM bot_hits ORDER BY created_at, path`,
        daily: await sql`SELECT day::text, project_name, status_class, hits, verified_hits FROM bot_hits_daily ORDER BY day, project_name, status_class`,
      });
      const original = await state();
      await exec("node", ["scripts/repair-history.mjs", "--manifest", manifest, "--apply", "--backup", repairBackup], { env });
      // The interim sender reported forwarded requests as 0, with event IDs;
      // its own redirects kept their status.
      await sql`INSERT INTO bot_hits (created_at, project_name, host, bot_name, status_code, sample_rate, confidence, path, event_id) VALUES
        ('2026-10-20T10:00:00Z', 'site', 'site.test', 'Bot', 0, 1, 'ua_only', '/later', 'interim-forwarded'),
        ('2026-10-20T10:00:00Z', 'site', 'site.test', 'Bot', 301, 1, 'ua_only', '/', 'interim-redirect')`;
      await sql`INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits) VALUES
        ('2026-10-20', 'site', 'Bot', 'generic', 'unknown', 1, 0), ('2026-10-20', 'site', 'Bot', 'generic', '3xx', 1, 0)`;
      const repaired = await state();

      // An unfixed sender still reporting 0 after the cutoff blocks the run.
      await expect(revert("--forwarded-until", "2026-10-20T09:00:00Z")).rejects.toThrow(/still reported 1 forwarded/);
      // Only the repair's own backup identifies what it changed.
      await expect(exec("node", ["scripts/revert-status-repair.mjs", "--repair", "fixture", "--repair-backup", manifest, "--forwarded-until", "2026-10-21T00:00:00Z"], { env })).rejects.toThrow(/SHA-256/);
      const dry = JSON.parse((await revert("--forwarded-until", "2026-10-21T00:00:00Z")).stdout);
      expect(dry).toMatchObject({ mode: "dry_run", restoredRows: 2, forwardedRows: 1 });
      expect(dry.changes).toEqual([{ project_name: "site", action: "forwarded", requests: 1 }, { project_name: "site", action: "restored", requests: 11 }]);
      expect(await state()).toEqual(repaired);
      expect(await sql`SELECT id FROM history_repairs`).toEqual([{ id: "fixture" }]);

      const applied = JSON.parse((await revert("--forwarded-until", "2026-10-21T00:00:00Z", "--apply", "--backup", backup)).stdout);
      expect(applied).toMatchObject({ mode: "applied", restoredRows: 2, forwardedRows: 1 });
      expect(statSync(backup).mode & 0o777).toBe(0o600);
      const after = await state();
      // History matches the original exactly, minus the excluded local test.
      const july = (rows: readonly Record<string, unknown>[]) => rows.filter(row => row.day === "2026-07-01");
      const restored = [
        { day: "2026-07-01", project_name: "other", status_class: "2xx", hits: 1, verified_hits: 0 },
        { day: "2026-07-01", project_name: "site", status_class: "2xx", hits: 11, verified_hits: 10 },
        { day: "2026-07-01", project_name: "site", status_class: "3xx", hits: 1, verified_hits: 0 },
        { day: "2026-07-01", project_name: "site", status_class: "unknown", hits: 1, verified_hits: 0 },
      ];
      expect(july(original.daily)).toEqual(restored.map(row => row.project_name === "site" && row.status_class === "2xx" ? { ...row, hits: 12 } : row));
      expect(july(after.daily)).toEqual(restored);
      expect(after.raw).toEqual([
        { path: "/", status_code: 301 }, { path: "/en", status_code: 200 }, { path: "/missing", status_code: 200 },
        { path: "/other", status_code: 200 }, { path: "/unknown", status_code: 0 },
        { path: "/", status_code: 301 }, { path: "/later", status_code: 200 },
      ]);
      expect(after.daily.filter(row => row.day === "2026-10-20")).toEqual([
        { day: "2026-10-20", project_name: "site", status_class: "2xx", hits: 1, verified_hits: 0 },
        { day: "2026-10-20", project_name: "site", status_class: "3xx", hits: 1, verified_hits: 0 },
      ]);
      expect((await sql`SELECT id FROM history_repairs ORDER BY id`).map(row => row.id)).toEqual(["fixture", "revert-status:fixture"]);
      expect(JSON.parse((await revert("--forwarded-until", "2026-10-21T00:00:00Z", "--apply", "--backup", join(directory, "again.json.gz"))).stdout).mode).toBe("already_applied");
      expect(await state()).toEqual(after);
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await sql.end();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
