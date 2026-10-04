import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDbClient, type DbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";

const url = process.env.TEST_DATABASE_URL;
const PROJECT = "__vitest_request_investigation__";
const PAGED = `${PROJECT}_pages`;
const BOT = "__InvestigationGooglebot__";
const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-10-02T00:00:00Z");

function hit(overrides: Partial<BotHit>): BotHit {
  return {
    project_name: PROJECT,
    environment: "test",
    host: "example.test",
    path: "/old",
    query_string: "",
    method: "GET",
    status_code: 301,
    bot_name: BOT,
    bot_category: "search_crawler",
    confidence: "ua_only",
    user_agent: "Investigation fixture",
    referer: "",
    ip: "203.0.113.42",
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

describe.skipIf(!url)("request investigation", () => {
  let db: DbClient;
  let raw: ReturnType<typeof postgres>;
  beforeAll(async () => {
    db = createDbClient(url!);
    raw = postgres(url!, { max: 1 });
    for (const fixture of [
      hit({ sample_rate: 0.5 }),
      hit({ status_code: 200 }),
      hit({ status_code: 308, path: "/pricing" }),
      hit({
        bot_name: "ChatGPT-User",
        bot_category: "ai_agent",
        sample_rate: 0.1,
      }),
      hit({ bot_name: "ChatGPT-User", bot_category: "ai_crawler" }),
      hit({ status_code: 404, path: "/broken" }),
      hit({ status_code: 500, path: "/problem" }),
      hit({ status_code: 0, path: "/unknown" }),
      hit({ heartbeat: true }),
      hit({ path: "/exclusive-end" }),
    ])
      await db.insertHit(fixture);
    await raw`UPDATE bot_hits SET created_at = ${from} WHERE project_name = ${PROJECT}`;
    await raw`UPDATE bot_hits SET created_at = ${to} WHERE project_name = ${PROJECT} AND path = '/exclusive-end'`;
    await raw`UPDATE bot_hits SET created_at = ${new Date("2026-10-01T12:00:00Z")} WHERE project_name = ${PROJECT} AND status_code = 200`;
    for (let i = 0; i < 30; i++)
      await db.insertHit(
        hit({
          project_name: PAGED,
          path: `/page-${String(i).padStart(2, "0")}`,
        }),
      );
    await raw`UPDATE bot_hits SET created_at = ${from} WHERE project_name = ${PAGED}`;
  });
  afterAll(async () => {
    await raw`DELETE FROM bot_hits WHERE project_name IN (${PROJECT}, ${PAGED})`;
    await raw`DELETE FROM bot_hits_daily WHERE project_name IN (${PROJECT}, ${PAGED})`;
    await raw`DELETE FROM bot_first_seen WHERE bot_name = ${BOT}`;
    await raw.end();
    await db.close();
  });

  it("filters exact statuses and classes while retaining project, bot, path and exclusive end", async () => {
    const rows = await db.queryFiltered({
      from,
      to,
      project: PROJECT,
      botName: BOT,
      path: "/old",
      status: "301",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status_code).toBe(301);
    const redirects = await db.queryFiltered({
      from,
      to,
      project: PROJECT,
      botName: BOT,
      status: "3xx",
    });
    expect(redirects.map((row) => row.status_code).sort()).toEqual([301, 308]);
    const unknown = await db.queryFiltered({
      from,
      to,
      project: PROJECT,
      status: "unknown",
    });
    expect(unknown.map((row) => row.path)).toEqual(["/unknown"]);
    expect(
      (await db.queryFiltered({ from, to, project: PROJECT, status: "errors" }))
        .map((row) => row.status_code)
        .sort(),
    ).toEqual([404, 500]);
  });

  it("reports the weighted 301 pages and bot counts without including other responses", async () => {
    const analysis = await db.requestAnalysis({
      from,
      to,
      project: PROJECT,
      status: "301",
    });
    expect(analysis.summary).toMatchObject({
      total_hits: 13,
      known_status_hits: 13,
      redirect_hits: 13,
      error_hits: 0,
      unique_pages: 1,
    });
    expect(analysis.pages).toHaveLength(1);
    expect(analysis.pages[0]).toMatchObject({ path: "/old", total_hits: 13 });
    expect(analysis.bots.map((row) => [row.bot_name, row.total_hits])).toEqual([
      ["ChatGPT-User", 11],
      [BOT, 2],
    ]);
    expect(
      analysis.statusCodes.find((row) => row.status_code === 301)?.count,
    ).toBe(13);
    expect(
      analysis.statusCodes.find((row) => row.status_code === 0)?.count,
    ).toBe(1);
  });

  it("applies normalized AI category filters to identities and their evidence", async () => {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const rollup = await db.fetchRollupStats(
      dayStart,
      dayEnd,
      PROJECT,
      "ai_agent",
      "ChatGPT-User",
    );
    expect(rollup.total).toBe(11);
    expect(rollup.topBots.map((row) => row.bot_name)).toEqual(["ChatGPT-User"]);

    const analysis = await db.requestAnalysis({
      from,
      to,
      project: PROJECT,
      botName: "ChatGPT-User",
      category: "ai_agent",
      status: "301",
    });
    expect(analysis.summary.total_hits).toBe(11);
    const bots = await db.allBotDetails(from, to, PROJECT, "ai_agent", "301");
    expect(bots).toHaveLength(1);
    expect(bots[0]).toMatchObject({
      bot_name: "ChatGPT-User",
      bot_category: "ai_agent",
      total_hits: 11,
    });
    expect(
      (await db.fetchStatusBatch(from, to, PROJECT, "ai_agent", "ChatGPT-User"))
        .summary.total_hits,
    ).toBe(11);
  });

  it("paginates distinct pages without dropping filter scope or changing totals", async () => {
    const first = await db.requestAnalysis({
      from,
      to,
      project: PAGED,
      status: "301",
      limit: 25,
    });
    const second = await db.requestAnalysis({
      from,
      to,
      project: PAGED,
      status: "301",
      limit: 25,
      offset: 25,
    });
    expect(first.pageCount).toBe(30);
    expect(first.pages).toHaveLength(26);
    expect(second.pages).toHaveLength(5);
    expect(second.summary.total_hits).toBe(30);
    expect(
      new Set(
        [...first.pages.slice(0, 25), ...second.pages].map((row) => row.path),
      ).size,
    ).toBe(30);
  });
  it("keeps exact path, bot, status and daily totals aligned across the investigation", async () => {
    const scope = {from, to, project: PROJECT, path: "/old", botName: "ChatGPT-User", status: "301"};
    const analysis = await db.requestAnalysis(scope);
    const events = await db.queryFiltered(scope);
    const bots = await db.allBotDetails(from, to, PROJECT, undefined, "301", "/old");
    expect(analysis.summary.total_hits).toBe(11);
    expect(analysis.pageCount).toBe(1);
    expect(analysis.pages[0].bot_count).toBe(1);
    expect(analysis.daily).toEqual([{date: "2026-10-01", count: 11}]);
    expect(new Date(analysis.summary.last_seen!).toISOString()).toBe(from.toISOString());
    const allResponses = await db.requestAnalysis({from, to, project: PROJECT, path: "/old"});
    expect(new Date(allResponses.summary.last_seen!).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(events).toHaveLength(2);
    expect(events.every(row => row.path === "/old" && row.bot_name === "ChatGPT-User" && row.status_code === 301)).toBe(true);
    expect(bots.find(bot => bot.bot_name === "ChatGPT-User")?.total_hits).toBe(11);
    expect(analysis.statusCodes.every(code => code.status_code === 301)).toBe(true);
  });

  it("treats prefix searches as literal text, and preserves prefix across page batches", async () => {
    const scope = {from, to, project: PAGED, prefix: "/page-0", status: "301"};
    const first = await db.requestAnalysis({...scope, limit: 5});
    const next = await db.requestAnalysis({...scope, limit: 5, offset: 5});
    expect(first.pageCount).toBe(10);
    expect(next.summary.total_hits).toBe(10);
    expect(new Set([...first.pages.slice(0,5), ...next.pages].map(row => row.path)).size).toBe(10);
    expect((await db.queryFiltered(scope))).toHaveLength(10);
    expect((await db.requestAnalysis({...scope, prefix: "/page-%"})).pageCount).toBe(0);
    expect((await db.queryFiltered({...scope, prefix: "/page-_"}))).toHaveLength(0);
  });

  it("returns an honest empty selection without inventing daily activity or bots", async () => {
    const analysis = await db.requestAnalysis({from, to, project: PROJECT, path: "/not-recorded", status: "301"});
    expect(analysis.summary.total_hits).toBe(0);
    expect(analysis.pageCount).toBe(0);
    expect(analysis.bots).toEqual([]);
    expect(analysis.daily).toEqual([]);
  });

  it("keeps alternative bot choices available without widening selected counts", async () => {
    const analysis = await db.requestAnalysis({from, to, project: PROJECT, path: "/old", botName: "ChatGPT-User", status: "404"});
    expect(analysis.botNames).toEqual(["ChatGPT-User", BOT]);
    expect(analysis.summary.total_hits).toBe(0);
    expect(analysis.bots).toEqual([]);
    const otherPath = await db.requestAnalysis({from, to, project: PROJECT, path: "/broken", botName: "ChatGPT-User"});
    expect(otherPath.botNames).toEqual([BOT]);
    const aiOnly = await db.requestAnalysis({from, to, project: PROJECT, path: "/old", category: "ai_agent"});
    expect(aiOnly.botNames).toEqual(["ChatGPT-User"]);
  });

});
