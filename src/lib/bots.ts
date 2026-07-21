import type { BotCategory } from "./schema";

export interface BotMatch {
  name: string;
  category: BotCategory;
  pattern: RegExp;
}

// Exported (in addition to detectBot) so tests can enumerate every known
// bot name/category pairing without duplicating the list — see
// src/lib/bot-companies.test.ts's BOT_COMPANY completeness check.
export const PATTERNS: BotMatch[] = [
  // ══════════════════════════════════════════════════════════
  //  AI crawlers — training, search retrieval, on-demand agents
  //  (order matters: more specific patterns first)
  // ══════════════════════════════════════════════════════════

  // ── OpenAI ─────────────────────────────────────────────
  { name: "GPTBot", category: "ai_training", pattern: /GPTBot/i },
  { name: "ChatGPT-User", category: "ai_agent", pattern: /ChatGPT-User/i },
  { name: "OAI-SearchBot", category: "ai_search", pattern: /OAI-SearchBot/i },

  // ── Anthropic ─────────────────────────────────────────
  { name: "ClaudeBot", category: "ai_training", pattern: /ClaudeBot/i },
  { name: "Claude-SearchBot", category: "ai_search", pattern: /Claude-SearchBot/i },
  { name: "Claude-User", category: "ai_agent", pattern: /Claude-User/i },
  // Deprecated/legacy Anthropic UA. Its original semantics are unclear —
  // behaves more like a general crawler than a genuine on-demand user
  // fetch, so don't treat it as equivalent to Claude-User (see bot-legend.ts).
  // Left categorized ai_agent for backward-compat; not changing without
  // clearer evidence.
  { name: "Claude-Web", category: "ai_agent", pattern: /Claude-Web/i },
  { name: "claude-code", category: "ai_agent", pattern: /claude-code\//i },
  { name: "Anthropic", category: "ai_training", pattern: /anthropic-ai/i },

  // ── Google AI ──────────────────────────────────────────
  { name: "Google-Extended", category: "ai_training", pattern: /Google-Extended/i },
  // GoogleOther is Google's internal/unspecified R&D crawler — its purpose
  // is not publicly documented. It is NOT the AI-training opt-out token
  // (that's Google-Extended above), so we don't assert an AI-training
  // purpose here; categorized generic rather than ai_training.
  { name: "GoogleOther", category: "generic", pattern: /GoogleOther|Google-Other/i },
  // Narrowed to the literal product token. The previous broad form
  // (`Vertex\s?AI`) matched any UA merely mentioning "Vertex AI" — e.g.
  // third-party RAG apps built on Vertex AI — which misattributed those
  // requests to Google itself.
  { name: "Google-Cloud-Vertex", category: "ai_training", pattern: /Google-Cloud-Vertex/i },
  { name: "Gemini-Deep-Research", category: "ai_search", pattern: /Gemini-Deep-Research/i },
  { name: "GoogleAgent", category: "ai_agent", pattern: /GoogleAgent/i },
  { name: "Google-NotebookLM", category: "ai_agent", pattern: /Google-NotebookLM/i },

  // ── Perplexity / Phind / Andi ──────────────────────────
  { name: "PerplexityBot", category: "ai_search", pattern: /PerplexityBot/i },
  { name: "Perplexity-User", category: "ai_agent", pattern: /Perplexity-User/i },
  { name: "PhindBot", category: "ai_search", pattern: /PhindBot/i },
  { name: "Andibot", category: "ai_search", pattern: /Andibot/i },

  // ── Meta ───────────────────────────────────────────────
  { name: "Meta-ExternalAgent", category: "ai_training", pattern: /Meta-ExternalAgent|MetaExternAgent/i },
  { name: "FacebookBot", category: "ai_training", pattern: /FacebookBot/i },
  // Per Meta's published docs, Meta-WebIndexer builds the index behind Meta
  // AI's search results — the peer of OAI-SearchBot / Claude-SearchBot, NOT
  // a training crawler. Categorized ai_search accordingly.
  { name: "meta-webindexer", category: "ai_search", pattern: /meta-webindexer/i },
  // Meta's user-triggered, on-demand fetcher — the peer of ChatGPT-User /
  // Claude-User / Perplexity-User. Must be listed before the generic
  // bot|crawler|spider fallback in detectBot().
  { name: "Meta-ExternalFetcher", category: "ai_agent", pattern: /Meta-ExternalFetcher/i },

  // ── Apple ──────────────────────────────────────────────
  { name: "Applebot-Extended", category: "ai_training", pattern: /Applebot-Extended/i },

  // ── xAI / Grok ─────────────────────────────────────────
  { name: "xAI-Bot", category: "ai_training", pattern: /xAI-Bot/i },
  { name: "GrokBot", category: "ai_training", pattern: /GrokBot/i },
  { name: "Grok-DeepSearch", category: "ai_search", pattern: /Grok-DeepSearch/i },

  // ── ByteDance ──────────────────────────────────────────
  { name: "Bytespider", category: "ai_training", pattern: /Bytespider/i },

  // ── Other AI training / search crawlers ────────────────
  { name: "CCBot", category: "ai_training", pattern: /CCBot/i },
  { name: "Amazonbot", category: "ai_training", pattern: /Amazonbot/i },
  // Word-bounded so this doesn't match "Cohere" as a substring of unrelated
  // words (e.g. "Coherent"). Real Cohere UA is the `cohere-ai` token.
  { name: "Cohere", category: "ai_training", pattern: /\bcohere-ai\b|\bCohere\b/i },
  { name: "Diffbot", category: "ai_training", pattern: /Diffbot/i },
  { name: "ImagesiftBot", category: "ai_training", pattern: /ImagesiftBot/i },
  { name: "DeepSeekBot", category: "ai_training", pattern: /DeepSeekBot/i },
  { name: "AI2Bot", category: "ai_training", pattern: /AI2Bot/i },
  { name: "MistralBot", category: "ai_training", pattern: /MistralBot/i },
  { name: "MistralAI-User", category: "ai_agent", pattern: /MistralAI-User/i },
  { name: "HuggingFaceBot", category: "ai_training", pattern: /HuggingFaceBot/i },
  { name: "GLM-Spider", category: "ai_training", pattern: /ChatGLM|GLM-Spider/i },
  { name: "Timpibot", category: "ai_training", pattern: /Timpibot/i },
  { name: "VelenPublicBot", category: "ai_training", pattern: /VelenPublicBot|VelenDigits/i },
  { name: "OmgiliBot", category: "ai_training", pattern: /OmgiliBot/i },
  { name: "SeekrBot", category: "ai_training", pattern: /SeekrBot/i },
  { name: "YouBot", category: "ai_search", pattern: /YouBot/i },
  { name: "ResearchBot", category: "ai_training", pattern: /ResearchBot/i },
  { name: "KangarooBot", category: "ai_training", pattern: /KangarooBot/i },
  { name: "Cloudflare-AI-Search", category: "ai_search", pattern: /Cloudflare-AI-Search/i },
  { name: "FirecrawlAgent", category: "ai_training", pattern: /FirecrawlAgent/i },
  { name: "magpie-crawler", category: "ai_training", pattern: /magpie-crawler/i },
  { name: "Groq-Bot", category: "ai_training", pattern: /Groq-?Bot/i },
  { name: "Webzio", category: "ai_training", pattern: /Webzio/i },
  { name: "Character-AI", category: "ai_training", pattern: /Character-AI/i },

  // ══════════════════════════════════════════════════════════
  //  Search engine crawlers
  // ══════════════════════════════════════════════════════════
  { name: "Googlebot", category: "search_crawler", pattern: /Googlebot/i },
  { name: "Google-Safety", category: "search_crawler", pattern: /Google-Safety/i },
  { name: "Google-InspectionTool", category: "search_crawler", pattern: /Google-InspectionTool/i },
  { name: "Storebot-Google", category: "search_crawler", pattern: /Storebot-Google/i },
  { name: "Bingbot", category: "search_crawler", pattern: /bingbot|BingPreview/i },
  { name: "Applebot", category: "search_crawler", pattern: /Applebot/i },
  { name: "YandexBot", category: "search_crawler", pattern: /YandexBot|YandexMobileBot/i },
  { name: "Baiduspider", category: "search_crawler", pattern: /Baiduspider/i },
  { name: "Bravebot", category: "search_crawler", pattern: /Bravebot|Brave.Search/i },
  { name: "DuckAssistBot", category: "ai_search", pattern: /DuckAssistBot/i },
  { name: "DuckDuckBot", category: "search_crawler", pattern: /DuckDuckBot/i },
  { name: "Sogou", category: "search_crawler", pattern: /Sogou/i },
  { name: "SeznamBot", category: "search_crawler", pattern: /SeznamBot/i },
  { name: "NaverBot", category: "search_crawler", pattern: /NaverBot|Yeti/i },
  { name: "360Spider", category: "search_crawler", pattern: /360Spider/i },

  // ══════════════════════════════════════════════════════════
  //  SEO / marketing crawlers
  // ══════════════════════════════════════════════════════════
  { name: "AhrefsBot", category: "seo_crawler", pattern: /AhrefsBot/i },
  { name: "SemrushBot", category: "seo_crawler", pattern: /SemrushBot|Semrush/i },
  { name: "MozBot", category: "seo_crawler", pattern: /MozBot|rogerbot/i },
  { name: "MJ12bot", category: "seo_crawler", pattern: /MJ12bot/i },
  { name: "Majestic", category: "seo_crawler", pattern: /Majestic/i },
  { name: "Screaming Frog", category: "seo_crawler", pattern: /Screaming.?Frog|spider\.screaming/i },
  { name: "SiteAuditBot", category: "seo_crawler", pattern: /SiteAuditBot|Site\s?Audit/i },
  { name: "Wappalyzer", category: "seo_crawler", pattern: /Wappalyzer/i },
  { name: "BuiltWith", category: "seo_crawler", pattern: /BuiltWith/i },
  { name: "Similarweb", category: "seo_crawler", pattern: /Similarweb/i },
  { name: "DataForSeoBot", category: "seo_crawler", pattern: /DataForSeoBot/i },
  { name: "DotBot", category: "seo_crawler", pattern: /DotBot/i },
  { name: "SISTRIX", category: "seo_crawler", pattern: /SISTRIX/i },
  { name: "Botify", category: "seo_crawler", pattern: /Botify/i },
  { name: "SiteimproveBot", category: "seo_crawler", pattern: /SiteimproveBot/i },
  { name: "Brightbot", category: "seo_crawler", pattern: /Brightbot/i },

  // ══════════════════════════════════════════════════════════
  //  Social preview
  // ══════════════════════════════════════════════════════════
  { name: "HubSpot", category: "social_preview", pattern: /HubSpot\s*Crawler/i },
  { name: "Twitterbot", category: "social_preview", pattern: /Twitterbot/i },
  { name: "facebook", category: "social_preview", pattern: /facebookexternalhit|Facebot/i },
  { name: "LinkedIn", category: "social_preview", pattern: /LinkedInBot/i },
  { name: "Slack", category: "social_preview", pattern: /Slackbot-LinkExpanding/i },
  { name: "Slackbot", category: "generic", pattern: /Slackbot\/\d/i },
  { name: "Slack-ImgProxy", category: "generic", pattern: /Slack-ImgProxy/i },
  { name: "Discord", category: "social_preview", pattern: /Discordbot/i },
  { name: "Telegram", category: "social_preview", pattern: /TelegramBot/i },
  { name: "WhatsApp", category: "social_preview", pattern: /WhatsApp/i },
  { name: "Pinterest", category: "social_preview", pattern: /Pinterest/i },
  { name: "Bluesky", category: "social_preview", pattern: /Bluesky/i },
  { name: "Tumblr", category: "social_preview", pattern: /Tumblr/i },
  { name: "Skype", category: "social_preview", pattern: /SkypeUriPreview/i },
  { name: "NotionBot", category: "social_preview", pattern: /NotionBot/i },
  { name: "Iframely", category: "social_preview", pattern: /Iframely/i },
  { name: "ZoomBot", category: "social_preview", pattern: /ZoomBot/i },
  { name: "Snapchat", category: "social_preview", pattern: /Snapchat\s*Scraper/i },
  { name: "Embedly", category: "social_preview", pattern: /Embedly/i },
  { name: "Line", category: "social_preview", pattern: /\bLine\/\d/i },

  // ══════════════════════════════════════════════════════════
  //  Archival / monitoring
  // ══════════════════════════════════════════════════════════
  { name: "InternetArchive", category: "generic", pattern: /archive\.org|wayback|ia_archiver/i },
  { name: "Pingdom", category: "generic", pattern: /Pingdom/i },
  { name: "UptimeRobot", category: "generic", pattern: /UptimeRobot/i },
  { name: "Datadog", category: "generic", pattern: /Datadog/i },
  { name: "NewRelic", category: "generic", pattern: /NewRelic/i },
  { name: "GTmetrix", category: "generic", pattern: /GTmetrix/i },
  { name: "WebPageTest", category: "generic", pattern: /WebPageTest|wptagent/i },

  // ══════════════════════════════════════════════════════════
  //  Other known crawlers
  // ══════════════════════════════════════════════════════════
  { name: "PetalBot", category: "generic", pattern: /PetalBot/i },
  { name: "AdsBot", category: "generic", pattern: /AdsBot-Google/i },
  { name: "Scrapy", category: "generic", pattern: /Scrapy/i },
  { name: "axios", category: "generic", pattern: /\baxios\/\d/i },
  { name: "okhttp", category: "generic", pattern: /okhttp\/\d/i },
  { name: "libwww-perl", category: "generic", pattern: /libwww-perl/i },
];

const CLI_UA_RE = /^(curl|Wget|Python-urllib|python-requests|Go-http-client|Java\/|Ruby|HTTPie|fetch\s)/i;
const GENERIC_BOT_RE = /bot|crawler|spider|scrape|scraping|fetch/i;

export function detectBot(ua: string): BotMatch | null {
  if (!ua || ua.length === 0) return null;

  for (const match of PATTERNS) {
    if (match.pattern.test(ua)) {
      return match;
    }
  }

  if (CLI_UA_RE.test(ua)) {
    const name = ua.match(CLI_UA_RE)?.[1] ?? "CLI Tool";
    return { name, category: "generic", pattern: CLI_UA_RE };
  }

  if (GENERIC_BOT_RE.test(ua)) {
    return { name: "Generic Bot", category: "generic", pattern: GENERIC_BOT_RE };
  }

  return null;
}

