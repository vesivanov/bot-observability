import { describe, expect, it } from "vitest";
import { normalizeBotCategory, AI_SEARCH_BOTS, AI_AGENT_BOTS, MONITORING_BOTS } from "./categories";

describe("normalizeBotCategory", () => {
  it("maps a legacy ai_crawler name in the AI agent set to ai_agent", () => {
    // ChatGPT-User is in AI_AGENT_BOTS (src/lib/categories.ts)
    expect(normalizeBotCategory("ChatGPT-User", "ai_crawler")).toBe("ai_agent");
  });

  it("maps a legacy ai_crawler name in the AI search set to ai_search", () => {
    // PerplexityBot is in AI_SEARCH_BOTS (src/lib/categories.ts)
    expect(normalizeBotCategory("PerplexityBot", "ai_crawler")).toBe("ai_search");
  });

  it("maps a legacy ai_crawler name not in either set to ai_training", () => {
    expect(normalizeBotCategory("GPTBot", "ai_crawler")).toBe("ai_training");
    expect(normalizeBotCategory("SomeUnmappedAiBot", "ai_crawler")).toBe("ai_training");
  });

  it("passes through non-ai_crawler categories unchanged", () => {
    expect(normalizeBotCategory("Googlebot", "search_crawler")).toBe("search_crawler");
    expect(normalizeBotCategory("AhrefsBot", "seo_crawler")).toBe("seo_crawler");
    expect(normalizeBotCategory("GPTBot", "ai_training")).toBe("ai_training");
  });

  it("maps legacy ai_crawler rows for the new Meta bots to their real categories", () => {
    // meta-webindexer: recategorized ai_training -> ai_search (bots.ts).
    expect(normalizeBotCategory("meta-webindexer", "ai_crawler")).toBe("ai_search");
    // Meta-ExternalFetcher: new on-demand agent, peer of ChatGPT-User etc.
    expect(normalizeBotCategory("Meta-ExternalFetcher", "ai_crawler")).toBe("ai_agent");
  });

  it("exports AI_SEARCH_BOTS and AI_AGENT_BOTS with the expected new members", () => {
    expect(AI_SEARCH_BOTS.has("meta-webindexer")).toBe(true);
    expect(AI_AGENT_BOTS.has("Meta-ExternalFetcher")).toBe(true);
  });

  it("maps a legacy generic row for a monitoring bot to monitoring", () => {
    // UptimeRobot was promoted out of "generic" into its own "monitoring"
    // category; rows ingested before that change are still stored as
    // generic and must be remapped at read time — no DB backfill.
    expect(normalizeBotCategory("UptimeRobot", "generic")).toBe("monitoring");
    expect(normalizeBotCategory("Pingdom", "generic")).toBe("monitoring");
  });

  it("leaves non-monitoring bots tagged generic unchanged", () => {
    expect(normalizeBotCategory("Scrapy", "generic")).toBe("generic");
    expect(normalizeBotCategory("axios", "generic")).toBe("generic");
  });

  it("passes through an already-correct monitoring category unchanged", () => {
    expect(normalizeBotCategory("UptimeRobot", "monitoring")).toBe("monitoring");
  });

  it("exports MONITORING_BOTS with the expected members", () => {
    expect(MONITORING_BOTS.has("UptimeRobot")).toBe(true);
    expect(MONITORING_BOTS.has("Pingdom")).toBe(true);
    expect(MONITORING_BOTS.has("Datadog")).toBe(true);
    expect(MONITORING_BOTS.has("NewRelic")).toBe(true);
    expect(MONITORING_BOTS.has("GTmetrix")).toBe(true);
    expect(MONITORING_BOTS.has("WebPageTest")).toBe(true);
  });
});
