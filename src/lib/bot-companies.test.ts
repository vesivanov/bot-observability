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

    // 67: 52 previously-verified ai_* bots, plus bots added and re-verified
    // across two follow-up audit passes:
    // - Kept (ai_*): Google-GeminiNotebook, kagi-fetcher, KimiBot, Kimi-User,
    //   TavilyBot, ICC-Crawler, PanguBot, Devin, Ai2Bot-Dolma, Manus-User,
    //   GoogleAgent-URLContext, TikTokSpider, NovaAct, TongyiBot, YiyanBot
    //   (15 bots, each confirmed either by the operating company's own docs
    //   or multiple independent third-party trackers).
    // - Added then removed after failing verification: CopilotBot (no
    //   evidence Microsoft publishes this token), ExaBot (name collision
    //   with Exalead's unrelated, decades-old crawler — no evidence it's
    //   Exa.ai's), GoogleAgent-Mariner (no official token; the underlying
    //   product, Project Mariner, was discontinued by Google 2026-05-04),
    //   Google-Gemini-CLI and Google-Firebase (single-source, no
    //   independent corroboration), Cursor and Trae (no UA token evidence
    //   anywhere, not even from the community registry that named them).
    // - Recategorized OUT of ai_* after re-checking primary sources:
    //   KagiBot and PetalBot (both are the operators' general search-index
    //   crawlers, not AI-answer bots — moved to search_crawler) and
    //   Google-CloudVertexBot (Google's own docs describe it as an
    //   owner-initiated agent-building crawl, not model training — moved to
    //   generic, see bots.ts).
    expect(aiNames.length).toBe(67);

    const missing = aiNames.filter((name) => !(name in BOT_COMPANY));
    expect(missing).toEqual([]);
  });
});
