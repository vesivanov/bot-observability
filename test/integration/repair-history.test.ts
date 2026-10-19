import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";

const exec = promisify(execFile);
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("historical repair", () => {
  it("rehearses without writes, backs up originals, repairs weighted buckets, preserves uncertain history and is idempotent", async () => {
    const schema = `vitest_repair_${Date.now()}`;
    const directory = mkdtempSync(join(tmpdir(), "bot-history-repair-"));
    const manifest = join(directory, "plan.json");
    const backup = join(directory, "snapshot.json.gz");
    const target = new URL(url!); target.searchParams.set("search_path", schema);
    const sql = postgres(target.toString(), { max: 1, connection: { timezone: "UTC" } });
    const plan = { id: "fixture", before: "2026-10-19T21:30:00Z",
      unknownStatusSources: [{ project: "site", host: "site.test", evidence: "Fixture request-stage sender" }],
      excludeLocalSources: [{ project: "site", host: "localhost:3000", evidence: "Fixture local tests" }],
      expected: { statusRows: 2, excludedRows: 1, restoredRollupHits: 1, aggregateOnlyRequests: 55 } };
    writeFileSync(manifest, JSON.stringify(plan));
    const run = (...args: string[]) => exec("node", ["scripts/repair-history.mjs", "--manifest", manifest, ...args], {
      env: { ...process.env, DATABASE_URL: target.toString() },
    });
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
        ('2026-10-20', 'site', 'site.test', 'Bot', 200, 1, 'ua_only', '/later'),
        ('2026-07-01', 'site', 'localhost:3000', 'Bot', 200, 1, 'ua_only', '/local')`;
      await sql`INSERT INTO bot_hits (created_at, project_name, host, bot_name, status_code, event_id) VALUES
        ('2026-07-01', 'site', 'site.test', 'Bot', 200, 'modern-sender')`;
      await sql`INSERT INTO bot_hits (created_at, project_name, host, bot_name, status_code, heartbeat) VALUES
        ('2026-07-01', 'site', 'site.test', 'Heartbeat', 200, TRUE)`;
      await sql`INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
        SELECT created_at::date, project_name, bot_name, bot_category,
          CASE WHEN status_code = 200 THEN '2xx' WHEN status_code = 301 THEN '3xx' ELSE 'unknown' END,
          SUM(1/sample_rate::text::numeric)::int,
          COALESCE(SUM(1/sample_rate::text::numeric) FILTER (WHERE confidence = 'verified'), 0)::int
        FROM bot_hits WHERE heartbeat = FALSE GROUP BY 1, 2, 3, 4, 5`;
      // One missing increment and unrelated aggregate-only history.
      await sql`UPDATE bot_hits_daily SET hits = hits - 1 WHERE day = '2026-07-01' AND project_name = 'site' AND status_class = '2xx'`;
      await sql`INSERT INTO bot_hits_daily (day, project_name, bot_name, status_class, hits) VALUES ('2026-01-01', 'old', 'OldBot', '2xx', 55)`;
      const state = async () => ({ raw: await sql`SELECT * FROM bot_hits ORDER BY id`, daily: await sql`SELECT * FROM bot_hits_daily ORDER BY day, project_name, status_class` });
      const before = await state();
      const dry = JSON.parse((await run()).stdout);
      expect(dry).toMatchObject({ mode: "dry_run", statusRows: 2, excludedRows: 1, restoredRollupHits: 1, aggregateOnlyRequests: 55 });
      expect(await state()).toEqual(before);
      expect(await sql`SELECT * FROM history_repairs`).toHaveLength(0);
      // A changed candidate set fails before any correction.
      writeFileSync(manifest, JSON.stringify({ ...plan, expected: { ...plan.expected, statusRows: 99 } }));
      await expect(run("--apply", "--backup", backup)).rejects.toThrow();
      expect(await state()).toEqual(before);
      writeFileSync(manifest, JSON.stringify(plan));
      // A post-update invariant failure must roll back raw rows, daily
      // transfers and the ledger together, even after the backup was saved.
      writeFileSync(manifest, JSON.stringify({ ...plan, expected: { ...plan.expected, aggregateOnlyRequests: 56 } }));
      await expect(run("--apply", "--backup", join(directory, "failed-snapshot.json.gz"))).rejects.toThrow();
      expect(await state()).toEqual(before);
      expect(await sql`SELECT * FROM history_repairs`).toHaveLength(0);
      writeFileSync(manifest, JSON.stringify(plan));
      const applied = JSON.parse((await run("--apply", "--backup", backup)).stdout);
      expect(applied).toMatchObject({ mode: "applied", ...plan.expected, restoredRollupHits: 1, aggregateOnlyRequests: 55 });
      expect(applied.changes).toEqual([{ project_name: "site", action: "exclude", requests: 1 }, { project_name: "site", action: "unknown", requests: 11 }]);
      const saved = JSON.parse(gunzipSync(readFileSync(backup)).toString());
      expect(saved.tables.bot_hits).toHaveLength(before.raw.length);
      expect(saved.tables.bot_hits.find((r: { path: string }) => r.path === "/en").status_code).toBe(200);
      expect(statSync(backup).mode & 0o777).toBe(0o600);
      expect(await sql`SELECT path, status_code FROM bot_hits WHERE path IN ('/en', '/missing') ORDER BY path`).toEqual([{ path: "/en", status_code: 0 }, { path: "/missing", status_code: 0 }]);
      expect(await sql`SELECT * FROM bot_hits WHERE path = '/local'`).toHaveLength(0);
      expect((await sql`SELECT hits, verified_hits FROM bot_hits_daily WHERE day = '2026-07-01' AND project_name = 'site' AND status_class = 'unknown'`)[0]).toEqual({ hits: 12, verified_hits: 10 });
      expect((await sql`SELECT hits FROM bot_hits_daily WHERE day = '2026-07-01' AND project_name = 'site' AND status_class = '2xx'`)[0].hits).toBe(1);
      const after = await state();
      expect(JSON.parse((await run("--apply", "--backup", backup)).stdout).mode).toBe("already_applied");
      expect(await state()).toEqual(after);
      expect(await sql`SELECT * FROM history_repairs`).toHaveLength(1);
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await sql.end();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
