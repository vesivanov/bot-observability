import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDbClient, type DbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";

const url = process.env.TEST_DATABASE_URL;

// Unique, obviously-fake identifiers so cleanup can target exactly what this
// test wrote and nothing else — see the file-level afterAll.
const PROJECT = "__vitest_integration_ingest__";
const BOT = "__VitestIngestBot__";

function baseHit(overrides: Partial<BotHit>): BotHit {
  return {
    project_name: PROJECT,
    environment: "test",
    host: "example.test",
    path: "/vitest",
    query_string: "",
    method: "GET",
    status_code: 200,
    bot_name: BOT,
    bot_category: "generic",
    confidence: "ua_only",
    user_agent: "VitestIngestBot/1.0",
    referer: "",
    ip: "203.0.113.99",
    country: "",
    region: "",
    city: "",
    timezone: "",
    deployment_url: "",
    vercel_id: "",
    is_api_route: false,
    sample_rate: 1,
    heartbeat: false,
    ...overrides,
  };
}

describe.skipIf(!url)("insertHit", () => {
  let db: DbClient;
  let raw: ReturnType<typeof postgres>;

  beforeAll(() => {
    db = createDbClient(url as string);
    raw = postgres(url as string, { max: 1 });
  });

  afterAll(async () => {
    // Clean up everything this test wrote, verified by name/project prefix —
    // must not touch any other data in the (possibly live/shared) database.
    await raw`DELETE FROM bot_hits WHERE project_name = ${PROJECT}`;
    await raw`DELETE FROM bot_hits_daily WHERE project_name = ${PROJECT}`;
    await raw`DELETE FROM bot_first_seen WHERE bot_name = ${BOT}`;
    await raw.end();
    await db.close();
  });

  it("writes raw + rollup + first_seen consistently, and skips rollup/first_seen for heartbeats", async () => {
    await db.insertHit(baseHit({ status_code: 200, confidence: "verified" }));
    await db.insertHit(baseHit({ status_code: 200, confidence: "ua_only" }));
    await db.insertHit(baseHit({ status_code: 404, confidence: "ua_only" }));
    await db.insertHit(baseHit({ status_code: 500, confidence: "ua_only" }));
    await db.insertHit(baseHit({ heartbeat: true, status_code: 0 }));

    // Raw rows: 4 real hits + 1 heartbeat.
    const rawHits = await raw`
      SELECT status_code, confidence, heartbeat FROM bot_hits
      WHERE project_name = ${PROJECT} AND heartbeat = FALSE
    `;
    expect(rawHits).toHaveLength(4);

    const heartbeatRows = await raw`
      SELECT * FROM bot_hits WHERE project_name = ${PROJECT} AND heartbeat = TRUE
    `;
    expect(heartbeatRows).toHaveLength(1);

    // Rollup: hits/verified_hits per (day, status_class), heartbeat excluded.
    const rollupRows = await raw<{ status_class: string; hits: number; verified_hits: number }[]>`
      SELECT status_class, hits, verified_hits FROM bot_hits_daily
      WHERE project_name = ${PROJECT} AND bot_name = ${BOT}
      ORDER BY status_class
    `;
    const byClass = new Map(rollupRows.map((r) => [r.status_class, r]));
    expect(byClass.get("2xx")).toMatchObject({ hits: 2, verified_hits: 1 });
    expect(byClass.get("4xx")).toMatchObject({ hits: 1, verified_hits: 0 });
    expect(byClass.get("5xx")).toMatchObject({ hits: 1, verified_hits: 0 });

    const totalRollupHits = rollupRows.reduce((sum, r) => sum + r.hits, 0);
    expect(totalRollupHits).toBe(4); // not 5 — the heartbeat must not be counted

    // first_seen / last_seen come from the 4 real hits only.
    const [firstSeenRow] = await raw<{ first_seen: Date; last_seen: Date }[]>`
      SELECT first_seen, last_seen FROM bot_first_seen WHERE bot_name = ${BOT}
    `;
    expect(firstSeenRow).toBeDefined();

    const [{ max_real_created_at }] = await raw<{ max_real_created_at: Date }[]>`
      SELECT MAX(created_at) AS max_real_created_at FROM bot_hits
      WHERE project_name = ${PROJECT} AND heartbeat = FALSE
    `;
    const [{ heartbeat_created_at }] = await raw<{ heartbeat_created_at: Date }[]>`
      SELECT created_at AS heartbeat_created_at FROM bot_hits
      WHERE project_name = ${PROJECT} AND heartbeat = TRUE
    `;

    expect(new Date(firstSeenRow.last_seen).getTime()).toBe(new Date(max_real_created_at).getTime());
    // The heartbeat was inserted after the 4 real hits but must not have
    // bumped last_seen past it.
    expect(new Date(firstSeenRow.last_seen).getTime()).toBeLessThan(new Date(heartbeat_created_at).getTime());
  });

  it("weights sample_rate so a sampled row counts as ~1/sample_rate real hits", async () => {
    const SAMPLED_BOT = "__VitestIngestSampledBot__";
    const from = new Date(Date.now() - 5 * 60_000);
    const to = new Date(Date.now() + 60_000);

    // Snapshot the raw-aggregate total before inserting, so the assertion
    // below is a delta and doesn't depend on what else this PROJECT
    // accumulated in this window (e.g. the earlier test in this file).
    const baseline = await db.fetchStatsBatch(from, to, PROJECT);

    // sample_rate=0.1 means only 1 in 10 real hits was recorded — this one
    // row should be weighted as ~10 real hits everywhere a hit count is
    // presented as a real-traffic total: the rollup's `hits`/`verified_hits`
    // columns (maintained incrementally by insertHit) and the raw-row
    // aggregates in fetchStatsBatch (SUM(1/sample_rate)).
    await db.insertHit(baseHit({ bot_name: SAMPLED_BOT, status_code: 200, confidence: "verified", sample_rate: 0.1 }));

    try {
      const [rollupRow] = await raw<{ hits: number; verified_hits: number }[]>`
        SELECT hits, verified_hits FROM bot_hits_daily
        WHERE project_name = ${PROJECT} AND bot_name = ${SAMPLED_BOT}
      `;
      expect(rollupRow).toBeDefined();
      expect(rollupRow.hits).toBe(10);
      expect(rollupRow.verified_hits).toBe(10);

      const afterStats = await db.fetchStatsBatch(from, to, PROJECT);
      expect(afterStats.total - baseline.total).toBe(10);

      // sample_rate=1 (the default, used by every other hit in this file)
      // must be unaffected — weight is 1, identical to plain COUNT(*).
      const unsampledRow = await raw<{ hits: number }[]>`
        SELECT hits FROM bot_hits_daily WHERE project_name = ${PROJECT} AND bot_name = ${BOT} AND status_class = '2xx'
      `;
      expect(unsampledRow[0].hits).toBe(2);
    } finally {
      await raw`DELETE FROM bot_hits WHERE project_name = ${PROJECT} AND bot_name = ${SAMPLED_BOT}`;
      await raw`DELETE FROM bot_hits_daily WHERE project_name = ${PROJECT} AND bot_name = ${SAMPLED_BOT}`;
      await raw`DELETE FROM bot_first_seen WHERE bot_name = ${SAMPLED_BOT}`;
    }
  });
});
