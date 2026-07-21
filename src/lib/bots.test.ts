import { describe, expect, it } from "vitest";
import { detectBot, PATTERNS } from "./bots";

describe("detectBot", () => {
  it("identifies a known AI training crawler", () => {
    const match = detectBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot");
    expect(match).not.toBeNull();
    expect(match?.name).toBe("GPTBot");
    expect(match?.category).toBe("ai_training");
  });

  it("identifies a search engine crawler", () => {
    const match = detectBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
    expect(match).not.toBeNull();
    expect(match?.name).toBe("Googlebot");
    expect(match?.category).toBe("search_crawler");
  });

  it("identifies an SEO tool crawler", () => {
    const match = detectBot("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)");
    expect(match).not.toBeNull();
    expect(match?.name).toBe("AhrefsBot");
    expect(match?.category).toBe("seo_crawler");
  });

  it("identifies a CLI user agent as generic", () => {
    const match = detectBot("curl/8.4.0");
    expect(match).not.toBeNull();
    expect(match?.name).toBe("curl");
    expect(match?.category).toBe("generic");
  });

  it("falls back to Generic Bot for unrecognized bot-like user agents", () => {
    const match = detectBot("SomeUnknownCrawler/1.0 (+https://example.com/bot)");
    expect(match).not.toBeNull();
    expect(match?.name).toBe("Generic Bot");
    expect(match?.category).toBe("generic");
  });

  it("returns null for a regular browser user agent", () => {
    const match = detectBot(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    expect(match).toBeNull();
  });

  it("returns null for an empty user agent", () => {
    expect(detectBot("")).toBeNull();
  });
});

describe("PATTERNS invariants", () => {
  // AI_SEARCH_BOTS / AI_AGENT_BOTS (categories.ts) exist only to remap
  // legacy DB rows whose bot_category was persisted as the generic
  // "ai_crawler" placeholder before per-bot categories existed. Every
  // pattern here must set its real, specific category directly — asserting
  // that documents (and enforces) normalizeBotCategory's intent.
  it("never uses the legacy ai_crawler category directly", () => {
    const offenders = PATTERNS.filter((p) => (p.category as string) === "ai_crawler").map((p) => p.name);
    expect(offenders).toEqual([]);
  });

  it("has no duplicate bot names", () => {
    const names = PATTERNS.map((p) => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("detectBot regex tightening", () => {
  it("matches the real Cohere crawler UA", () => {
    const match = detectBot("Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com/bot)");
    expect(match?.name).toBe("Cohere");
    expect(match?.category).toBe("ai_training");
  });

  it("does not misfire on 'Coherent' as a substring", () => {
    const match = detectBot("Mozilla/5.0 (compatible; CoherentBrowserEngine/1.0)");
    expect(match?.name).not.toBe("Cohere");
  });

  it("matches the literal Google-Cloud-Vertex token", () => {
    const match = detectBot("Mozilla/5.0 (compatible; Google-Cloud-Vertex; +https://cloud.google.com/vertex-ai)");
    expect(match?.name).toBe("Google-Cloud-Vertex");
    expect(match?.category).toBe("ai_training");
  });

  it("does not misattribute a third-party 'Vertex AI' mention to Google", () => {
    const match = detectBot("MyRagApp/1.0 (built on Vertex AI; +https://example.com/bot)");
    expect(match?.name).not.toBe("Google-Cloud-Vertex");
  });
});

describe("vendor-fact recategorizations", () => {
  it("categorizes GoogleOther as generic, not ai_training", () => {
    const match = detectBot("Mozilla/5.0 (compatible; GoogleOther)");
    expect(match?.name).toBe("GoogleOther");
    expect(match?.category).toBe("generic");
  });

  it("categorizes meta-webindexer as ai_search, not ai_training", () => {
    const match = detectBot("Mozilla/5.0 (compatible; meta-webindexer/1.0)");
    expect(match?.name).toBe("meta-webindexer");
    expect(match?.category).toBe("ai_search");
  });

  it("recognizes the new Meta-ExternalFetcher on-demand agent", () => {
    const match = detectBot("Mozilla/5.0 (compatible; Meta-ExternalFetcher/1.0; +https://developers.facebook.com/docs/sharing/webmasters/crawler)");
    expect(match?.name).toBe("Meta-ExternalFetcher");
    expect(match?.category).toBe("ai_agent");
  });
});
