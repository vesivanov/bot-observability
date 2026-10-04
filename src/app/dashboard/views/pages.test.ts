import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveDashboardRange } from "@/lib/period";
const mocks = vi.hoisted(() => ({ requestAnalysis: vi.fn() }));
vi.mock("@/app/dashboard/db", () => ({ getDb: () => mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/charts/daily-trend-chart", () => ({ DailyTrendChart: () => null }));
import { PagesViewServer } from "./pages";

const context = {view:"pages", period:"2026-10-01_2026-10-02", project:"docs", bot:"GPTBot", category:"ai_training", status:"301", prefix:"/en/", path:"/en/old"};
const range = resolveDashboardRange(context.period, new Date("2026-10-04T12:00:00Z"));
beforeEach(() => {
  mocks.requestAnalysis.mockReset().mockResolvedValue({
    summary:{total_hits:10,known_status_hits:10,redirect_hits:10,error_hits:0,unique_pages:1},
    pages:[{project:"docs",path:"/en/old",total_hits:10,known_status_hits:10,redirect_hits:10,error_hits:0,unique_pages:1,bot_count:1,last_seen:"2026-10-01T12:00:00Z"}],
    botNames:["GPTBot", "OAI-SearchBot"], bots:[{bot_name:"GPTBot",total_hits:10}], pageCount:1, statusCodes:[{status_code:301,count:10}], projects:[{project:"docs",count:10}],daily:[{date:"2026-10-01",count:10}],
  });
});
it("renders path detail and preserves its complete scope in bot and request links", async () => {
  const html = renderToStaticMarkup(await PagesViewServer({context,range})).replaceAll("&amp;","&");
  expect(mocks.requestAnalysis).toHaveBeenCalledWith(expect.objectContaining({path:context.path,prefix:context.prefix,status:"301",botName:"GPTBot",project:"docs"}));
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1],"https://example.test").searchParams);
  for (const view of ["bots","events"]) expect(Object.fromEntries(links.find(query=>query.get("view")===view)!)).toMatchObject({...context,view});
  expect(html).toContain("Bots requesting this page");
});
it("opens ranked paths as page detail rather than dropping straight into raw rows", async () => {
  const html=renderToStaticMarkup(await PagesViewServer({context:{...context,path:undefined},range})).replaceAll("&amp;","&");
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(match=>new URL(match[1],"https://example.test").searchParams);
  expect(links.some(query=>query.get("view")==="pages" && query.get("path")==="/en/old" && query.get("status")==="301" && query.get("bot")==="GPTBot")).toBe(true);
});
describe("historical limits", () => {
  it("does not substitute incomplete raw results for aggregate history", async () => {
    const longRange=resolveDashboardRange("365",new Date("2026-10-04T12:00:00Z"));
    const html=renderToStaticMarkup(await PagesViewServer({context:{...context,period:"365"},range:longRange}));
    expect(mocks.requestAnalysis).not.toHaveBeenCalled();
    expect(html).toContain("Page detail requires retained requests");
    expect(html).not.toContain("0 requests");
  });
});
