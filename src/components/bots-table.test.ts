import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotsTable } from "./bots-table";

describe("bot investigation evidence", () => {
  const props = {
    bots: [
      {
        bot_name: "ChatGPT-User",
        bot_category: "ai_agent" as const,
        total_hits: 10,
        verified_hits: 0,
        projects: "docs",
        last_seen: "2026-10-01T12:00:00Z",
      },
    ],
    outcomes: [
      {
        bot_name: "ChatGPT-User",
        total_hits: 10,
        known_status_hits: 8,
        redirect_hits: 8,
        error_hits: 2,
        unique_pages: 3,
      },
    ],
    period: "2026-09-25_2026-10-02",
    projectFilter: "docs",
    categoryFilter: "ai_agent",
  };
  it("takes redirect shares over known outcomes plus redirects, and error shares over known requests", () => {
    const text = renderToStaticMarkup(createElement(BotsTable, props))
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ");
    expect(text).toContain("8 50%");
    expect(text).toContain("2 25%");
  });
  it("does not add redirects twice when the table is filtered to redirects", () => {
    const text = renderToStaticMarkup(createElement(BotsTable, {
      ...props,
      statusFilter: "redirects",
      outcomes: [{ ...props.outcomes[0], total_hits: 8, known_status_hits: 8, error_hits: 0 }],
    })).replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
    expect(text).toContain("8 100%");
  });
  it("opens the bot's errors with the same project, category and custom range", () => {
    const html = renderToStaticMarkup(
      createElement(BotsTable, props),
    ).replaceAll("&amp;", "&");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(
      (match) => new URL(match[1], "https://collector.test").searchParams,
    );
    expect(
      Object.fromEntries(
        links.find((query) => query.get("status") === "errors")!,
      ),
    ).toMatchObject({
      view: "pages",
      bot: "ChatGPT-User",
      project: "docs",
      category: "ai_agent",
      period: props.period,
      status: "errors",
    });
  });
});
