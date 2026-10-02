import { describe, expect, it } from "vitest";
import { knownStatusAccent } from "./shared";
import { dashboardHref } from "@/lib/query-context";

describe("dashboard selection links", () => {
  const selection = { view: "events", period: "2025-01-01_2025-06-01", project: "Site & A", category: "ai_agent", bot: "ChatGPT-User", path: "/pricing", limit: 25, offset: 50 };
  const query = (href: string) => new URL(href, "https://collector.test").searchParams;

  it("preserves historical bounds and category through pagination and bot navigation", () => {
    const page = query(dashboardHref(selection, { offset: 75 }));
    expect(Object.fromEntries(page)).toMatchObject({ period: selection.period, project: selection.project, category: selection.category, bot: selection.bot, path: selection.path, offset: "75" });
    const bot = query(dashboardHref(selection, { view: "bots" }));
    expect(Object.fromEntries(bot)).toEqual({ view: "bots", period: selection.period, project: selection.project, category: selection.category, bot: selection.bot });
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
