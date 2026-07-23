import { describe, expect, it } from "vitest";
import { detectBot, PATTERNS } from "./bots";

// Regression guard for the class of bug this file's classification-rule
// comment (top of bots.ts) exists to prevent, plus a simpler one: a pattern
// added with a qualifier (e.g. a required version suffix, a word boundary)
// that doesn't actually match any realistic real-world UA for that bot,
// silently making the bot undetectable despite having a PATTERNS entry.
//
// For each entry, build a realistic synthetic UA containing its literal
// token (UA_TOKEN_OVERRIDES for the entries whose PATTERNS[].name is a
// friendly display name rather than the literal substring the regex
// matches — e.g. "Slack" the entry vs. "Slackbot-LinkExpanding" the token)
// and assert detectBot() resolves it back to that exact entry.
const UA_TOKEN_OVERRIDES: Record<string, string> = {
  Slack: "Slackbot-LinkExpanding",
  facebook: "facebookexternalhit",
  HubSpot: "HubSpot Crawler",
  AdsBot: "AdsBot-Google",
  InternetArchive: "archive.org_bot",
  Anthropic: "anthropic-ai",
  LinkedIn: "LinkedInBot",
  Discord: "Discordbot",
  Telegram: "TelegramBot",
  Skype: "SkypeUriPreview",
  Snapchat: "Snapchat Scraper",
};

function syntheticUa(name: string): string {
  const token = UA_TOKEN_OVERRIDES[name] ?? name;
  return `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ${token}/1.0; +https://example.com/bot`;
}

describe("PATTERNS UA smoke test", () => {
  for (const entry of PATTERNS) {
    it(`detects a realistic UA for "${entry.name}" (${entry.category})`, () => {
      const ua = syntheticUa(entry.name);
      const match = detectBot(ua);
      expect(match?.name, `UA "${ua}" should have matched "${entry.name}" but got ${match?.name ?? "null"}`).toBe(entry.name);
      expect(match?.category).toBe(entry.category);
    });
  }
});
