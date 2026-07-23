import type { BotCategory } from "./schema";

export interface BotMatch {
  name: string;
  category: BotCategory;
  pattern: RegExp;
}

// Exported (in addition to detectBot) so tests can enumerate every known
// bot name/category pairing without duplicating the list — see
// src/lib/bot-companies.test.ts's BOT_COMPANY completeness check.
//
// ── How to classify ai_training / ai_search / ai_agent ──────────────────
// The bar is: the OPERATING COMPANY'S OWN documentation says THIS SPECIFIC
// bot trains models (ai_training), builds an index that feeds AI-generated
// answers/citations (ai_search), or performs an on-demand, user-triggered,
// single-page fetch (ai_agent). "This company makes AI products elsewhere"
// is not evidence for any of the three — most companies' primary crawler is
// just a plain search-index bot even when the company is otherwise an AI
// business. When you can't point to the operator's own docs stating one of
// the three purposes above for THIS bot, categorize it by what it actually
// does instead (search_crawler / seo_crawler / social_preview / generic).
// This is exactly the mistake this file used to make: KagiBot, PetalBot, and
// Google-CloudVertexBot were all tagged ai_search/ai_training on "the
// operator does AI stuff" reasoning, when their own docs describe them as
// general search-index or owner-initiated agent-building crawlers — not
// bots that train models or feed AI answers. All three were corrected;
// don't reintroduce the pattern.
export const PATTERNS: BotMatch[] = [
  // ══════════════════════════════════════════════════════════
  //  AI crawlers — training, search retrieval, on-demand agents
  //  (order matters: more specific patterns first)
  // ══════════════════════════════════════════════════════════

  // ── OpenAI ─────────────────────────────────────────────
  { name: "GPTBot", category: "ai_training", pattern: /GPTBot/i },
  { name: "ChatGPT-User", category: "ai_agent", pattern: /ChatGPT-User/i },
  { name: "OAI-SearchBot", category: "ai_search", pattern: /OAI-SearchBot/i },
  // Ad-landing-page checker for ChatGPT ads — not a training or search crawler,
  // just ad-policy compliance.
  { name: "OAI-AdsBot", category: "generic", pattern: /OAI-AdsBot/i },

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
  // Must precede GoogleAgent below — "GoogleAgent-URLContext" contains
  // "GoogleAgent" as a substring. Fetches a URL a developer supplied as
  // context to the Gemini API, on the API caller's behalf. (No official
  // Google doc confirms this token, but it's independently listed by two
  // unrelated bot-tracking services beyond the community registry.)
  { name: "GoogleAgent-URLContext", category: "ai_agent", pattern: /GoogleAgent-URLContext/i },
  // Google's official token is the hyphenated "Google-Agent" (see Google's
  // user-triggered-fetchers docs). "GoogleAgent" (no hyphen) is kept as a fallback
  // in case of variant UAs, but the hyphenated form is the real one — without it,
  // every user-triggered-agent request was invisible (fell through to null, not
  // even caught as a generic bot). NB: a "GoogleAgent-Mariner" variant was
  // previously added here based on third-party mentions of Google's Project
  // Mariner, but no official Google source ever confirmed that literal token,
  // and Mariner itself was discontinued by Google on 2026-05-04 — removed.
  { name: "GoogleAgent", category: "ai_agent", pattern: /Google-Agent|GoogleAgent/i },
  { name: "Google-NotebookLM", category: "ai_agent", pattern: /Google-NotebookLM/i },
  // Current token for Gemini Notebook — Google-NotebookLM above is now legacy and
  // loses support in August 2026 per Google's docs.
  { name: "Google-GeminiNotebook", category: "ai_agent", pattern: /Google-GeminiNotebook/i },
  // Per Google's own crawler docs, this is "crawls requested by site owners
  // for building Vertex AI Agents" — an opt-in, owner-initiated crawl of the
  // owner's own site. That's not "trains Gemini" (Google-Extended's job) or
  // an on-demand end-user fetch (GoogleAgent's job), so it doesn't cleanly
  // fit ai_training/ai_search/ai_agent; categorized generic rather than
  // asserting a training purpose the source doesn't state (same reasoning as
  // GoogleOther above).
  { name: "Google-CloudVertexBot", category: "generic", pattern: /Google-CloudVertexBot/i },

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
  // Must precede the parent AI2Bot pattern below — already caught by it, but a
  // dedicated entry gives correct attribution for the Dolma-dataset variant.
  { name: "Ai2Bot-Dolma", category: "ai_training", pattern: /Ai2Bot-Dolma/i },
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
  // Kagi's own docs (kagi.com/bot) confirm this is their general search-index
  // crawler — the peer of Googlebot/Bingbot for Kagi Search, not a bot that
  // feeds AI-generated answers. Categorized search_crawler, not ai_search.
  // (kagi-fetcher below is the actual AI-answer/on-demand bot.)
  { name: "KagiBot", category: "search_crawler", pattern: /Kagibot/i },
  // Kagi's own docs confirm this fetches web content on-demand to answer a
  // Kagi Assistant (AI) user's query — the genuine AI counterpart to KagiBot.
  { name: "kagi-fetcher", category: "ai_agent", pattern: /kagi-fetcher/i },
  { name: "KimiBot", category: "ai_training", pattern: /KimiBot/i },
  { name: "Kimi-User", category: "ai_agent", pattern: /Kimi-User/i },
  { name: "TavilyBot", category: "ai_search", pattern: /TavilyBot/i },
  { name: "ICC-Crawler", category: "ai_training", pattern: /ICC-Crawler/i },
  { name: "PanguBot", category: "ai_training", pattern: /PanguBot/i },
  // Version-suffixed to avoid overly broad matching on the bare word "Devin".
  { name: "Devin", category: "ai_agent", pattern: /Devin\/\d/i },
  // Verified token is the hyphenated "Manus-User" (operated by Butterfly
  // Effect) — no evidence a literal "Manus Bot" UA exists.
  { name: "Manus-User", category: "ai_agent", pattern: /Manus-User/i },
  // A second, distinct ByteDance training crawler alongside Bytespider.
  { name: "TikTokSpider", category: "ai_training", pattern: /TikTokSpider/i },
  // Amazon's browser-using AI agent (distinct from the Amazonbot training crawler).
  { name: "NovaAct", category: "ai_agent", pattern: /NovaAct/i },
  // Fetches web content for Alibaba's Tongyi Qianwen / Qwen assistant answers.
  { name: "TongyiBot", category: "ai_search", pattern: /TongyiBot/i },
  // Fetches web content for Baidu's Yiyan (ERNIE) assistant answers.
  { name: "YiyanBot", category: "ai_search", pattern: /YiyanBot/i },

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
  { name: "Pingdom", category: "monitoring", pattern: /Pingdom/i },
  { name: "UptimeRobot", category: "monitoring", pattern: /UptimeRobot/i },
  { name: "Datadog", category: "monitoring", pattern: /Datadog/i },
  { name: "NewRelic", category: "monitoring", pattern: /NewRelic/i },
  { name: "GTmetrix", category: "monitoring", pattern: /GTmetrix/i },
  { name: "WebPageTest", category: "monitoring", pattern: /WebPageTest|wptagent/i },

  // ══════════════════════════════════════════════════════════
  //  Other known crawlers
  // ══════════════════════════════════════════════════════════
  // Huawei's Petal Search crawler — its own webmaster docs describe it as a
  // general search-index crawler (peer of Googlebot/Bingbot for Petal
  // Search), not one that's documented as feeding AI-generated answers.
  // Previously reclassified to ai_search on "Petal Search is AI-powered"
  // reasoning alone — the same company-level inference that miscategorized
  // KagiBot; reverted to search_crawler.
  { name: "PetalBot", category: "search_crawler", pattern: /PetalBot/i },
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

