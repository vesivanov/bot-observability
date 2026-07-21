import { describe, expect, it } from "vitest";
import { botCompany, BOT_COMPANY } from "./bot-companies";
import { PATTERNS } from "./bots";

describe("botCompany", () => {
  it("returns the right company for known AI bots", () => {
    expect(botCompany("GPTBot")).toBe("OpenAI");
    expect(botCompany("ClaudeBot")).toBe("Anthropic");
    expect(botCompany("PerplexityBot")).toBe("Perplexity");
  });

  it("falls back to Other for an unknown bot name", () => {
    expect(botCompany("SomeBrandNewBotNobodyMappedYet")).toBe("Other");
  });

  it("maps every ai_* category bot name from bots.ts PATTERNS", () => {
    // Every bot detectBot can emit with an ai_training | ai_search | ai_agent
    // category must have an explicit company entry — normalizeBotCategory
    // only ever remaps the legacy "ai_crawler" category into one of these
    // three, and AI_SEARCH_BOTS/AI_AGENT_BOTS (categories.ts) are subsets of
    // this same name list, so completeness here covers those paths too.
    const aiNames = PATTERNS.filter((p) =>
      p.category === "ai_training" || p.category === "ai_search" || p.category === "ai_agent"
    ).map((p) => p.name);

    // Still 52: GoogleOther moved out of the ai_* set (recategorized
    // generic — its purpose isn't publicly documented as AI training) while
    // Meta-ExternalFetcher (a new ai_agent bot) moved in, netting to zero.
    expect(aiNames.length).toBe(52);

    const missing = aiNames.filter((name) => !(name in BOT_COMPANY));
    expect(missing).toEqual([]);
  });
});
