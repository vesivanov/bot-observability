// Explicit bot_name -> operating company mapping, covering every bot in
// src/lib/bots.ts PATTERNS whose category is ai_training | ai_search |
// ai_agent (the categories normalizeBotCategory ever maps legacy ai_crawler
// rows into — see src/lib/categories.ts AI_SEARCH_BOTS/AI_AGENT_BOTS, both
// of which are subsets of the AI names below). Used by the "AI crawls vs.
// visits" overview panel to group per-bot hits by company.
export const BOT_COMPANY: Record<string, string> = {
  // OpenAI
  GPTBot: "OpenAI",
  "OAI-SearchBot": "OpenAI",
  "ChatGPT-User": "OpenAI",

  // Anthropic
  ClaudeBot: "Anthropic",
  Anthropic: "Anthropic",
  "Claude-SearchBot": "Anthropic",
  "Claude-User": "Anthropic",
  "Claude-Web": "Anthropic",
  "claude-code": "Anthropic",

  // Google
  "Google-Extended": "Google",
  // GoogleOther's bots.ts category is now `generic` (its purpose isn't
  // publicly documented as AI training — see bots.ts), so it's no longer
  // part of the ai_* completeness set this file's header comment describes.
  // Kept here anyway since it's still a genuine Google-operated crawler and
  // callers may look up its company regardless of category.
  GoogleOther: "Google",
  "Google-Cloud-Vertex": "Google",
  // Google-CloudVertexBot's bots.ts category is `generic` too (see bots.ts —
  // its documented purpose is owner-initiated agent-building crawls, not
  // model training), so like GoogleOther it's outside the ai_* completeness
  // set but kept here since it's still a genuine Google-operated crawler.
  "Google-CloudVertexBot": "Google",
  "Gemini-Deep-Research": "Google",
  GoogleAgent: "Google",
  "GoogleAgent-URLContext": "Google",
  "Google-NotebookLM": "Google",
  "Google-GeminiNotebook": "Google",

  // Meta
  "Meta-ExternalAgent": "Meta",
  FacebookBot: "Meta",
  "meta-webindexer": "Meta",
  "Meta-ExternalFetcher": "Meta",

  // Apple
  "Applebot-Extended": "Apple",

  // xAI
  "xAI-Bot": "xAI",
  GrokBot: "xAI",
  "Grok-DeepSearch": "xAI",

  // ByteDance
  Bytespider: "ByteDance",

  // Perplexity
  PerplexityBot: "Perplexity",
  "Perplexity-User": "Perplexity",
  PhindBot: "Phind",
  Andibot: "Andi",

  // Common Crawl
  CCBot: "Common Crawl",

  // Amazon
  Amazonbot: "Amazon",

  // Cohere
  Cohere: "Cohere",

  // Diffbot
  Diffbot: "Diffbot",

  // Imagesift
  ImagesiftBot: "Imagesift",

  // DeepSeek
  DeepSeekBot: "DeepSeek",

  // Allen Institute for AI
  AI2Bot: "Allen Institute for AI",
  "Ai2Bot-Dolma": "Allen Institute for AI",

  // Mistral
  MistralBot: "Mistral",
  "MistralAI-User": "Mistral",

  // Hugging Face
  HuggingFaceBot: "Hugging Face",

  // Zhipu AI (ChatGLM)
  "GLM-Spider": "Zhipu AI",

  // Timpi
  Timpibot: "Timpi",

  // Velen
  VelenPublicBot: "Velen",

  // Omgili
  OmgiliBot: "Omgili",

  // Seekr
  SeekrBot: "Seekr",

  // You.com
  YouBot: "You.com",

  // Unclear/independent operators — bot's own name used as the company.
  ResearchBot: "ResearchBot",
  KangarooBot: "Kangaroo",

  // Cloudflare
  "Cloudflare-AI-Search": "Cloudflare",

  // Firecrawl
  FirecrawlAgent: "Firecrawl",

  // Magpie
  "magpie-crawler": "Magpie",

  // Groq
  "Groq-Bot": "Groq",

  // Webz.io
  Webzio: "Webz.io",

  // Character.AI
  "Character-AI": "Character.AI",

  // DuckDuckGo
  DuckAssistBot: "DuckDuckGo",

  // Kagi (KagiBot is search_crawler now, not ai_*, but kept for lookup —
  // same reasoning as GoogleOther above)
  KagiBot: "Kagi",
  "kagi-fetcher": "Kagi",

  // Moonshot AI (Kimi)
  KimiBot: "Moonshot AI",
  "Kimi-User": "Moonshot AI",

  // Tavily
  TavilyBot: "Tavily",

  // NICT (Japan)
  "ICC-Crawler": "NICT",

  // Huawei (PetalBot is search_crawler now, not ai_*, but kept for lookup —
  // same reasoning as GoogleOther above)
  PanguBot: "Huawei",
  PetalBot: "Huawei",

  // Cognition AI
  Devin: "Cognition AI",

  // Manus (Butterfly Effect)
  "Manus-User": "Manus",

  // ByteDance (additional training crawler, alongside Bytespider)
  TikTokSpider: "ByteDance",

  // Amazon
  NovaAct: "Amazon",

  // Alibaba
  TongyiBot: "Alibaba",

  // Baidu
  YiyanBot: "Baidu",

  // OpenAI (ad-policy crawler, not part of the ai_* completeness set, but
  // mapped anyway for consistent company lookups)
  "OAI-AdsBot": "OpenAI",
};

export function botCompany(name: string): string {
  return BOT_COMPANY[name] ?? "Other";
}
