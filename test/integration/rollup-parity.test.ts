import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDbClient, type DbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";

const url = process.env.TEST_DATABASE_URL;

// Unique, obviously-fake identifiers so cleanup can target exactly what this
// test wrote — see the file-level afterAll.
const PROJECT = "__vitest_integration_parity__";
const BOT_A = "__VitestParityBotA__"; // ai_training
const BOT_B = "__VitestParityBotB__"; // search_crawler
const BOT_C = "__VitestParityBotC__"; // generic

function hit(overrides: Partial<BotHit>): BotHit {
  return {
    project_name: PROJECT,
    environment: "test",
    host: "example.test",
    path: "/vitest",
    query_string: "",
    method: "GET",
    status_code: 200,
    bot_name: BOT_C,
    bot_category: "generic",
    confidence: "ua_only",
    user_agent: "VitestParityBot/1.0",
    referer: "",
    ip: "203.0.113.100",
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

// fetchRollupStats buckets by UTC calendar day; fetchStatsBatch by exact
// timestamp. Using the full current UTC day as the window keeps both
// queries aligned regardless of the exact millisecond each insertHit call
// lands on, while the unique PROJECT filter keeps the comparison isolated
// from any other data in the database.
function currentUtcDayWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

describe.skipIf(!url)("rollup / raw parity", () => {
  let db: DbClient;
  let raw: ReturnType<typeof postgres>;

  beforeAll(async () => {
    db = createDbClient(url as string);
    raw = postgres(url as string, { max: 1 });

    await db.insertHit(hit({ bot_name: BOT_A, bot_category: "ai_training", status_code: 200, confidence: "verified" }));
    await db.insertHit(hit({ bot_name: BOT_A, bot_category: "ai_training", status_code: 200, confidence: "ua_only" }));
    await db.insertHit(hit({ bot_name: BOT_A, bot_category: "ai_training", status_code: 404, confidence: "ua_only" }));
    await db.insertHit(hit({ bot_name: BOT_B, bot_category: "search_crawler", status_code: 200, confidence: "verified" }));
    await db.insertHit(hit({ bot_name: BOT_B, bot_category: "search_crawler", status_code: 500, confidence: "ua_only" }));
    await db.insertHit(hit({ bot_name: BOT_C, bot_category: "generic", status_code: 200, confidence: "ua_only" }));
  });

  afterAll(async () => {
    await raw`DELETE FROM bot_hits WHERE project_name = ${PROJECT}`;
    await raw`DELETE FROM bot_hits_daily WHERE project_name = ${PROJECT}`;
    await raw`DELETE FROM bot_first_seen WHERE bot_name IN (${BOT_A}, ${BOT_B}, ${BOT_C})`;
    await raw.end();
    await db.close();
  });

  it("fetchRollupStats totals/dailyTrend/categories match fetchStatsBatch over the same window", async () => {
    const { start, end } = currentUtcDayWindow();

    const [rollup, rawStats] = await Promise.all([
      db.fetchRollupStats(start, end, PROJECT),
      db.fetchStatsBatch(start, end, PROJECT),
    ]);

    expect(rollup.total).toBe(6);
    expect(rawStats.total).toBe(6);
    expect(rollup.total).toBe(rawStats.total);

    expect(rollup.errorHits).toBe(2);
    expect(rawStats.errorHits).toBe(2);
    expect(rollup.errorHits).toBe(rawStats.errorHits);

    expect(rollup.knownStatusHits).toBe(6);
    expect(rawStats.knownStatusHits).toBe(6);

    // Single-day fixture: both should report exactly one day with count 6.
    expect(rollup.dailyTrend).toHaveLength(1);
    expect(rawStats.dailyTrend).toHaveLength(1);
    expect(rollup.dailyTrend[0].count).toBe(6);
    expect(rollup.dailyTrend[0].date).toBe(rawStats.dailyTrend[0].date);
    expect(rollup.dailyTrend[0].count).toBe(rawStats.dailyTrend[0].count);

    const rollupCategories = new Map(rollup.categories.map((c) => [c.bot_category, c.count]));
    const rawCategories = new Map(rawStats.categories.map((c) => [c.bot_category, c.count]));
    expect(rollupCategories.get("ai_training")).toBe(3);
    expect(rollupCategories.get("search_crawler")).toBe(2);
    expect(rollupCategories.get("generic")).toBe(1);
    expect(rollupCategories).toEqual(rawCategories);
  });

  // Regression test for the period-over-period double-count bug: the
  // overview view queries a "current" window [periodStart, periodEnd] and a
  // "previous" window [previousPeriodStart, periodStart] back-to-back.
  // fetchRollupStats buckets by UTC calendar day with both bounds
  // inclusive, so naively reusing `periodStart` as both the current
  // window's lower bound and the previous window's upper bound counts that
  // calendar day's hits twice. The fix (src/app/dashboard/views/overview.tsx)
  // backs the previous window's upper bound off by one day; this test
  // exercises fetchRollupStats directly with that same adjacency.
  it("adjacent rollup windows sharing a boundary day do not double-count it", async () => {
    const { start: boundaryDayStart, end: boundaryDayEnd } = currentUtcDayWindow();
    const previousWindowStart = new Date(boundaryDayStart.getTime() - 7 * 86_400_000);
    // Naive (buggy) previous-window upper bound: the same instant as the
    // current window's lower bound. Both windows' ::date bucket includes
    // the boundary day, so this reproduces the double-count.
    const naivePreviousWindowEnd = boundaryDayStart;
    // Corrected previous-window upper bound (mirrors the fix in
    // src/app/dashboard/views/overview.tsx): one day earlier, so its
    // ::date bucket stops the day before the boundary day.
    const correctedPreviousWindowEnd = new Date(boundaryDayStart.getTime() - 86_400_000);

    // Snapshot totals before adding new hits — this suite's `beforeAll`
    // fixture already wrote data into the boundary day, so we assert on the
    // delta these 3 new hits cause rather than an absolute count.
    const [baselineCurrent, baselineNaivePrevious, baselineCorrectedPrevious] = await Promise.all([
      db.fetchRollupStats(boundaryDayStart, boundaryDayEnd, PROJECT),
      db.fetchRollupStats(previousWindowStart, naivePreviousWindowEnd, PROJECT),
      db.fetchRollupStats(previousWindowStart, correctedPreviousWindowEnd, PROJECT),
    ]);

    await db.insertHit(hit({ bot_name: BOT_A, bot_category: "ai_training" }));
    await db.insertHit(hit({ bot_name: BOT_A, bot_category: "ai_training" }));
    await db.insertHit(hit({ bot_name: BOT_B, bot_category: "search_crawler" }));

    const [current, naivePrevious, correctedPrevious] = await Promise.all([
      db.fetchRollupStats(boundaryDayStart, boundaryDayEnd, PROJECT),
      db.fetchRollupStats(previousWindowStart, naivePreviousWindowEnd, PROJECT),
      db.fetchRollupStats(previousWindowStart, correctedPreviousWindowEnd, PROJECT),
    ]);

    expect(current.total - baselineCurrent.total).toBe(3);
    // Demonstrates the bug this test guards against: the naive boundary
    // still double-counts the 3 new hits into the "previous" window too,
    // because its ::date bucket also includes the boundary day.
    expect(naivePrevious.total - baselineNaivePrevious.total).toBe(3);
    // With the corrected boundary, the previous window sees none of the
    // boundary day's new hits — each hit is counted in exactly one window.
    expect(correctedPrevious.total - baselineCorrectedPrevious.total).toBe(0);
  });

  // Companion regression test for the raw-mode (fetchStatsBatch) path, which
  // uses exact `created_at` timestamps rather than day buckets. The fix
  // makes the lower bound exclusive (`created_at > from AND created_at <=
  // to`) so a hit landing exactly on a shared window boundary is counted in
  // only the window where it's the (inclusive) upper bound.
  it("adjacent raw-mode windows partition a shared boundary instant exactly once", async () => {
    const boundary = new Date();
    const before = new Date(boundary.getTime() - 60_000);
    const after = new Date(boundary.getTime() + 60_000);

    const [baselinePrevious, baselineCurrent] = await Promise.all([
      db.fetchStatsBatch(before, boundary, PROJECT),
      db.fetchStatsBatch(boundary, after, PROJECT),
    ]);

    // Insert directly via raw SQL (bypassing insertHit, which always stamps
    // created_at = now()) so the row lands at the exact boundary instant.
    await raw`
      INSERT INTO bot_hits (
        created_at, project_name, environment, host, path, query_string,
        method, status_code, bot_name, bot_category, confidence, user_agent,
        referer, ip, country, region, city, timezone,
        deployment_url, vercel_id, is_api_route, sample_rate, heartbeat
      ) VALUES (
        ${boundary}, ${PROJECT}, 'test', 'example.test', '/vitest-boundary', '',
        'GET', 200, ${BOT_C}, 'generic', 'ua_only', 'VitestParityBot/1.0',
        '', '203.0.113.100', '', '', '', '',
        '', '', false, 1, false
      )
    `;

    const [afterPrevious, afterCurrent] = await Promise.all([
      db.fetchStatsBatch(before, boundary, PROJECT),
      db.fetchStatsBatch(boundary, after, PROJECT),
    ]);

    // The boundary-instant hit lands only in the window where `boundary` is
    // the inclusive upper bound, not the window where it's the exclusive
    // lower bound.
    expect(afterPrevious.total - baselinePrevious.total).toBe(1);
    expect(afterCurrent.total - baselineCurrent.total).toBe(0);
  });
});
