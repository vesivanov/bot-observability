import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ queryFiltered: vi.fn(), projectDelivery: vi.fn(async () => ({ delivered: true })),
    fetchMeta: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/dashboard/db", () => ({ getDb: () => mocks }));
import { EventsViewServer } from "./events";

describe("Raw Events selection", () => {
  beforeEach(() => {
    mocks.fetchMeta.mockResolvedValue({ allProjects: [], latestEvent: null, latestHeartbeat: null });
    mocks.queryFiltered.mockReset();
    mocks.queryFiltered.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({
      id: i, created_at: "2025-05-31T12:00:00Z", project_name: "Site & A", bot_name: "ChatGPT-User", bot_category: "ai_agent", path: "/pricing", method: "GET", status_code: 0, confidence: "ua_only",
    })));
  });

  it("applies category and retains project/category/historical bounds in pagination and evidence links", async () => {
    const selection = { period: "2025-01-01_2025-06-01", project: "Site & A", category: "ai_agent", bot: "ChatGPT-User", path: "/pricing", limit: "25", offset: "25", status: "301" };
    const html = renderToStaticMarkup(await EventsViewServer({ searchParams: selection })).replaceAll("&amp;", "&");
    expect(mocks.queryFiltered).toHaveBeenCalledWith(expect.objectContaining({ category: "ai_agent", project: "Site & A", botName: "ChatGPT-User", path: "/pricing", status: "301", offset: 25 }));
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1], "https://collector.test").searchParams);
    const next = links.find((q) => q.get("offset") === "50");
    expect(next?.get("period")).toBe(selection.period);
    expect(next?.get("status")).toBe("301");
    expect(next?.get("category")).toBe("ai_agent");
    expect(next?.get("project")).toBe(selection.project);
    expect(links.find((q) => q.get("view") === "bots")?.get("category")).toBe("ai_agent");
    expect(html).toContain('value="ai_agent"');
  });

  it("does not reuse a category's cached results for another category", async () => {
    await EventsViewServer({ searchParams: { project: "cache-selection-test", category: "ai_agent" } });
    await EventsViewServer({ searchParams: { project: "cache-selection-test", category: "social_preview" } });
    expect(mocks.queryFiltered).toHaveBeenCalledTimes(2);
    expect(mocks.queryFiltered.mock.calls.map(([params]) => params.category)).toEqual(["ai_agent", "social_preview"]);
  });
});

describe("status cache isolation", () => {
  it("fetches separately for 301 and 308 in the same selection", async () => {
    mocks.queryFiltered.mockClear();
    await EventsViewServer({searchParams:{project:"status-cache-test", status:"301"}});
    await EventsViewServer({searchParams:{project:"status-cache-test", status:"308"}});
    expect(mocks.queryFiltered.mock.calls.map(([params])=>params.status)).toEqual(["301","308"]);
  });
});
