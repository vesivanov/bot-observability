import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { knownStatusAccent, pct, formatDateTime, ActiveFilterChips } from "./shared";
import { dashboardHref, readDashboardQuery } from "@/lib/query-context";

describe("dashboard selection links", () => {
  const selection = { view: "events", period: "2025-01-01_2025-06-01", project: "Site & A", category: "ai_agent", bot: "ChatGPT-User", path: "/pricing", limit: 25, offset: 50 };
  const query = (href: string) => new URL(href, "https://collector.test").searchParams;

  it("preserves historical bounds and category through pagination and bot navigation", () => {
    const page = query(dashboardHref(selection, { offset: 75 }));
    expect(Object.fromEntries(page)).toMatchObject({ period: selection.period, project: selection.project, category: selection.category, bot: selection.bot, path: selection.path, offset: "75" });
    const bot = query(dashboardHref(selection, { view: "bots" }));
    expect(Object.fromEntries(bot)).toEqual({ view: "bots", period: selection.period, project: selection.project, category: selection.category, bot: selection.bot, path: selection.path });
  });

  it("resets pagination only when a result-changing selection changes", () => {
    expect(query(dashboardHref(selection, { category: "ai_search" })).has("offset")).toBe(false);
    expect(query(dashboardHref(selection, { category: "ai_agent" })).get("offset")).toBe("50");
    expect(query(dashboardHref(selection, { project: undefined })).has("project")).toBe(false);
    expect(query(dashboardHref(selection, { project: undefined })).get("bot")).toBe(selection.bot);
  });
});

// Regression coverage for the incident this function exists to prevent: three
// sites (yardwork.dev, vesivanov.com, garaxe.com) each independently started
// reporting status_code: 0 for every hit, and it went unnoticed for weeks
// because the "Known status" tile on the Health tab never changed color.
describe("knownStatusAccent", () => {
  it("is neutral when status capture is healthy", () => {
    expect(knownStatusAccent(100)).toBe("text-neutral-100");
    expect(knownStatusAccent(90)).toBe("text-neutral-100");
  });

  it("warns (orange) when status capture is degraded", () => {
    expect(knownStatusAccent(89)).toBe("text-orange-300");
    expect(knownStatusAccent(50)).toBe("text-orange-300");
  });

  it("alarms (rose) when status capture is effectively broken", () => {
    expect(knownStatusAccent(49)).toBe("text-rose-300");
    expect(knownStatusAccent(0)).toBe("text-rose-300");
  });
});

describe("response investigation navigation", () => {
  const scope={view:"pages", period:"2026-09-25_2026-10-02",project:"docs",category:"ai_agent",bot:"ChatGPT-User",status:"301",offset:25};
  it("preserves exact status, bot and custom dates between Pages, Bots and requests", () => {
    for (const view of ["pages","bots","events"]) {
      const query=new URL(dashboardHref(scope,{view}),"https://collector.test").searchParams;
      expect(Object.fromEntries(query)).toMatchObject({view,period:scope.period,project:scope.project,category:scope.category,bot:scope.bot,status:"301"});
    }
  });
  it("resets page position when status or view changes, and clears investigation on Overview", () => {
    expect(dashboardHref(scope,{status:"308"})).not.toContain("offset=");
    const overview=new URL(dashboardHref(scope,{view:"overview"}),"https://collector.test").searchParams;
    expect(overview.has("bot")).toBe(false);
    expect(overview.has("status")).toBe(false);
  });
  it("rejects invalid status codes without changing other scope", () => {
    for (const status of ["301 OR 1=1","0","199","600","999","30x"]) {
      expect(readDashboardQuery({status,project:"docs"})).toMatchObject({project:"docs",status:undefined});
    }
    expect(readDashboardQuery({status:"301"}).status).toBe("301");
    expect(readDashboardQuery({status:"unknown"}).status).toBe("unknown");
  });
});


describe("page investigation scope", () => {
  const scope = {view: "pages", period: "2026-09-01_2026-10-01", project: "docs", bot: "GPTBot", path: "/en/blog/a", prefix: "/en/blog/", status: "301", offset: 25};
  it("keeps page and prefix scope through bot detail and request evidence", () => {
    for (const view of ["pages", "bots", "events"]) {
      const query = new URL(dashboardHref(scope, {view}), "https://example.test").searchParams;
      expect(Object.fromEntries(query)).toMatchObject({ view, period: scope.period, project: scope.project, bot: scope.bot, path: scope.path, prefix: scope.prefix, status: "301" });
    }
    expect(dashboardHref(scope, {prefix: "/de/"})).not.toContain("offset=");
    expect(dashboardHref(scope, {view: "overview"})).not.toContain("path=");
    expect(dashboardHref(scope, {view: "overview"})).not.toContain("prefix=");
  });
  it("maps old Health links into Pages without dropping investigation scope", () => {
    const query = new URL(dashboardHref({...scope, view: "health"}), "https://example.test").searchParams;
    expect(query.get("view")).toBe("pages");
    expect(query.get("status")).toBe("301");
  });
  it("never rounds positive error rates down to zero and includes years in dates", () => {
    expect(pct(14, 4883)).toBe(0.3);
    expect(pct(1, 100000)).toBeGreaterThan(0);
    expect(pct(0, 200)).toBe(0);
    expect(pct(0, 0)).toBe(0);
    expect(formatDateTime("2025-10-04T10:00:00Z")).toContain("2025");
  });
});


it("removing a visible chip retains the selected project even when its chip is hidden", () => {
  const html = renderToStaticMarkup(createElement(ActiveFilterChips, {view:"pages",period:"7",project:"docs",path:"/pricing",status:"301",hideProject:true})).replaceAll("&amp;","&");
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1],"https://example.test").searchParams);
  expect(links).toHaveLength(2);
  expect(links.every(query => query.get("project") === "docs")).toBe(true);
  expect(html).not.toContain("project: docs");
});
