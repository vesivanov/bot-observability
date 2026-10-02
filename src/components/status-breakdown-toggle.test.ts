import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBreakdownToggle } from "./status-breakdown-toggle";

describe("Health evidence links", () => {
  it("keeps category, project and custom dates in a breakdown path link", () => {
    const html = renderToStaticMarkup(createElement(StatusBreakdownToggle, {
      projectStatuses: [{ project: "docs", status_code: 302, count: 4, top_bot: "ChatGPT-User", top_path: "/pricing", last_seen: "2026-10-01T12:00:00Z" }],
      botStatusCodes: [], pageStatusCodes: [],
      period: "2026-09-25_2026-10-02", projectFilter: "docs", categoryFilter: "ai_agent",
    })).replaceAll("&amp;", "&");
    const href = html.match(/href="([^"]+)"/)?.[1];
    const query = new URL(href!, "https://collector.test").searchParams;
    expect(Object.fromEntries(query)).toMatchObject({ view: "events", period: "2026-09-25_2026-10-02", project: "docs", category: "ai_agent", path: "/pricing" });
  });
});
