import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDbClient, type DbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";

const url = process.env.TEST_DATABASE_URL;
const projects = ["__vitest_counting_delivery__", "__vitest_counting_other__", "__vitest_counting_paths__"];
const bot = "__VitestCountingBot__";
const from = new Date(Date.now() - 60_000);
const to = new Date(Date.now() + 600_000);
function hit(overrides: Partial<BotHit> = {}): BotHit {
  return {
    project_name: projects[0], environment: "test", host: "example.test",
    path: "/en", query_string: "", method: "GET", status_code: 200,
    bot_name: bot, bot_category: "generic", confidence: "verified",
    user_agent: "Counting fixture", referer: "", ip: "", country: "",
    region: "", city: "", timezone: "", deployment_url: "", vercel_id: "same-deployment",
    is_api_route: false, sample_rate: 1, heartbeat: false, ...overrides,
  };
}

describe.skipIf(!url)("request counting", () => {
  let db: DbClient;
  let concurrent: DbClient;
  let raw: ReturnType<typeof postgres>;
  beforeAll(() => {
    db = createDbClient(url!);
    concurrent = createDbClient(url!);
    raw = postgres(url!, { max: 1 });
  });
  afterAll(async () => {
    await raw`DELETE FROM bot_hits WHERE project_name IN ${raw(projects)}`;
    await raw`DELETE FROM bot_hits_daily WHERE project_name IN ${raw(projects)}`;
    await raw`DELETE FROM bot_first_seen WHERE bot_name = ${bot}`;
    await raw.end();
    await db.close();
    await concurrent.close();
  });

  it("atomically deduplicates concurrent sampled deliveries without advancing first/last seen", async () => {
    const event = hit({ event_id: randomUUID(), sample_rate: 0.1 });
    expect((await Promise.all([db.insertHit(event), concurrent.insertHit(event)])).sort()).toEqual([false, true]);
    const [seen] = await raw`SELECT * FROM bot_first_seen WHERE bot_name = ${bot}`;
    expect(await concurrent.insertHit(event)).toBe(false);
    expect((await db.queryFiltered({ project: projects[0], from, to }))).toHaveLength(1);
    const stats = await db.fetchStatsBatch(from, to, projects[0]);
    expect(stats.total).toBe(10);
    const [rollup] = await raw`SELECT SUM(hits)::int AS hits, SUM(verified_hits)::int AS verified FROM bot_hits_daily WHERE project_name = ${projects[0]}`;
    expect(rollup).toMatchObject({ hits: 10, verified: 10 });
    const [after] = await raw`SELECT * FROM bot_first_seen WHERE bot_name = ${bot}`;
    expect(after).toEqual(seen);
    // IDs belong to a project; an unrelated project may use the same ID.
    expect(await db.insertHit({ ...event, project_name: projects[1] })).toBe(true);
    // A real repeat request is retained even if all other fields match.
    expect(await db.insertHit({ ...event, event_id: randomUUID() })).toBe(true);
    // Older senders without IDs continue to record each request.
    expect(await db.insertHit(hit())).toBe(true);
    expect(await db.insertHit(hit())).toBe(true);
  });

  it("keeps redirect hops in volume but excludes them, HEAD, errors, unknowns and APIs from successful paths", async () => {
    const project = projects[2];
    for (const event of [
      hit({ path: "/", status_code: 301 }),
      hit({ sample_rate: 0.5 }),
      hit({ method: "HEAD" }),
      hit({ path: "/missing", status_code: 404 }),
      hit({ path: "/unknown", status_code: 0 }),
      hit({ path: "/api/data" }),
      hit({ path: "/api" }),
      hit({ path: "/rpc", is_api_route: true }),
      hit({ method: "POST" }),
    ]) await db.insertHit({ ...event, project_name: project, event_id: randomUUID() });
    const all = await db.requestAnalysis({ from, to, project, status: "all" });
    expect(all.summary.total_hits).toBe(10);
    expect(all.summary.redirect_hits).toBe(1);
    expect(all.pageCount).toBe(7);
    const successful = await db.requestAnalysis({ from, to, project, status: "successful" });
    expect(successful.summary).toMatchObject({ total_hits: 2, redirect_hits: 0, error_hits: 0, unique_pages: 1 });
    expect(successful.pages.map(row => row.path)).toEqual(["/en"]);
    const events = await db.queryFiltered({ from, to, project, status: "successful" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ method: "GET", status_code: 200, path: "/en" });
    expect((await db.allBotDetails(from, to, project, undefined, "successful"))[0].total_hits).toBe(2);
    const stats = await db.fetchStatsBatch(from, to, project);
    expect(stats.total).toBe(10);
    expect(stats.topPagesByProject).toHaveLength(1);
    expect(stats.topPagesByProject[0]).toMatchObject({ path: "/en", count: 2 });
    expect(stats.topPages).toEqual([{ path: "/en", count: 2 }]);
  });
});
