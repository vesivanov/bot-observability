export interface LegendSub {
  label: string;
  examples: string;
  what: string;
}

export interface LegendGroup {
  label: string;
  description: string;
  color: string;
  impact: string;
  subs: LegendSub[];
}

export interface BotLegendInfo {
  groupLabel: string;
  groupDescription: string;
  groupColor: string;
  impact: string;
  subLabel: string;
  what: string;
}

// Group-level summary shown in the collapsible "Legend — Bot Categories &
// Descriptions" table (src/app/dashboard/page.tsx). `subs[].examples` here
// is human-readable prose for that table only — it is NOT parsed to build
// the per-bot hover lookup (see BOT_LEGEND_ENTRIES / getBotLegend below).
// Keeping these decoupled is deliberate: prose examples use marketing names
// ("Ahrefs", "Semrush") that don't match canonical bots.ts PATTERNS[].name
// tokens ("AhrefsBot", "SemrushBot"), so deriving the per-bot map from this
// prose previously left ~70 of 115+ bots with no hover description.
export const LEGEND_GROUPS: LegendGroup[] = [
  {
    label: "AI Training", description: "Bulk training data collectors", color: "text-amber-300",
    impact: "Your content → embedded into model weights. No traffic back. Block to opt out of training.",
    subs: [
      { label: "OpenAI", examples: "GPTBot", what: "Feeds ChatGPT / GPT model training. Blocking keeps your content out of OpenAI future models." },
      { label: "Anthropic", examples: "ClaudeBot, anthropic-ai", what: "Feeds Claude model training. Blocking prevents use in Anthropic's training pipeline." },
      { label: "Google", examples: "Google-Extended, Google-Cloud-Vertex", what: "Feeds Gemini / Vertex AI training. Google-Extended is a robots.txt policy token (no separate UA). Blocking does NOT affect Google Search. (GoogleOther and Google-CloudVertexBot are separate crawlers not documented as feeding model training — see Generic / CLI below.)" },
      { label: "Meta", examples: "Meta-ExternalAgent, FacebookBot", what: "Feeds Meta AI / LLaMA model training." },
      { label: "Apple", examples: "Applebot-Extended", what: "Feeds Apple Intelligence on-device models. Policy token like Google-Extended." },
      { label: "ByteDance", examples: "Bytespider, TikTokSpider", what: "Feeds TikTok / Doubao AI training. Known for partial robots.txt compliance." },
      { label: "Common Crawl", examples: "CCBot", what: "Open web corpus → feeds dozens of third-party LLMs (transitive inclusion)." },
      { label: "xAI", examples: "xAI-Bot, GrokBot", what: "Feeds Grok model training (X/Twitter)." },
      { label: "DeepSeek", examples: "DeepSeekBot", what: "Feeds DeepSeek model training." },
      { label: "Mistral", examples: "MistralBot", what: "Feeds Mistral AI model training (open-weight models)." },
      { label: "Cohere", examples: "Cohere", what: "Feeds Cohere's enterprise AI models." },
      { label: "Hugging Face", examples: "HuggingFaceBot", what: "Feeds Hugging Face's open datasets and model training." },
      { label: "Allen AI", examples: "AI2Bot, Ai2Bot-Dolma", what: "Feeds AI2 (Allen Institute) research models like OLMo. Ai2Bot-Dolma is a specialized variant for the Dolma dataset." },
      { label: "Zhipu AI", examples: "GLM-Spider / ChatGLM", what: "Feeds ChatGLM model training (Chinese AI lab)." },
      { label: "Moonshot AI", examples: "KimiBot", what: "Feeds Moonshot AI's Kimi model training." },
      { label: "Other", examples: "Diffbot, ImagesiftBot, Amazonbot, Timpibot, VelenPublicBot, OmgiliBot, SeekrBot, FirecrawlAgent, magpie-crawler, Groq-Bot, Webzio, Character-AI, ICC-Crawler, PanguBot", what: "Various AI training and data collection operations. Amazonbot also powers Alexa answers. ICC-Crawler is Japan's NICT AI research crawler; PanguBot feeds Huawei's Pangu models." },
    ],
  },
  {
    label: "AI Search", description: "Index / retrieval for AI chat products", color: "text-indigo-300",
    impact: "Your content → cited in AI chat answers. Drives referral traffic via inline citations. Block to remove from AI search.",
    subs: [
      { label: "OpenAI", examples: "OAI-SearchBot (ChatGPT Search)", what: "Builds the index ChatGPT uses to cite sources in answers. Block → your site won't appear in ChatGPT Search results." },
      { label: "Anthropic", examples: "Claude-SearchBot (Claude Search)", what: "Builds the index Claude uses for search citations. Block → invisible in Claude Search." },
      { label: "Perplexity", examples: "PerplexityBot", what: "Powers Perplexity AI search results with inline citations. High referral traffic source." },
      { label: "Google", examples: "Gemini-Deep-Research", what: "Feeds Gemini's deep research feature. Used when users ask complex research questions." },
      { label: "Meta", examples: "Meta-WebIndexer (meta-webindexer)", what: "Builds the index behind Meta AI's search results — the peer of OAI-SearchBot / Claude-SearchBot. Per Meta's docs this is a search-retrieval crawler, not a training crawler." },
      { label: "DuckDuckGo", examples: "DuckAssistBot", what: "Powers DuckDuckGo AI Assist answers with citations." },
      { label: "You.com", examples: "YouBot", what: "Powers You.com AI search engine." },
      { label: "Cloudflare", examples: "Cloudflare-AI-Search", what: "Cloudflare's AI search infrastructure crawler." },
      { label: "Other", examples: "PhindBot, Andibot, Grok-DeepSearch, TavilyBot, TongyiBot, YiyanBot", what: "PhindBot powers Phind's developer-focused AI search. Andibot powers Andi. Grok-DeepSearch is xAI's multi-step research feature. TavilyBot powers an AI-focused search API used for grounding by third-party LLM apps and agents. TongyiBot and YiyanBot power Alibaba's Tongyi Qianwen and Baidu's Yiyan assistant answers, respectively." },
    ],
  },
  {
    label: "AI Agent", description: "On-demand user-triggered fetches", color: "text-emerald-300",
    impact: "Single-page fetch when a user asks AI to read a URL. Direct attribution. Blocking hurts user-initiated reads, not bulk crawling.",
    subs: [
      { label: "OpenAI", examples: "ChatGPT-User (browse mode)", what: "Fetches a page when a ChatGPT user pastes a URL or clicks 'browse'. Single request, real-time. Blocking blocks user-initiated page reads." },
      { label: "Anthropic", examples: "Claude-User (on-demand), claude-code", what: "Claude-User fetches a page when a Claude user references a URL, on-demand only. claude-code is Anthropic's CLI coding agent fetching a URL for a user's task." },
      // Claude-Web is intentionally not folded into the "Anthropic" sub above —
      // it is a deprecated, legacy UA whose original semantics are unclear.
      // Do not present it as equivalent to Claude-User.
      { label: "Anthropic (legacy)", examples: "Claude-Web — deprecated", what: "Older Anthropic user agent, now deprecated. Its original semantics are unclear; it behaves more like a general-purpose crawler than a genuine on-demand user fetch. Kept for backward compatibility only." },
      { label: "Perplexity", examples: "Perplexity-User", what: "On-demand page fetch for Perplexity users. Single request, cited inline." },
      { label: "Google", examples: "Google-Agent, GoogleAgent-URLContext, Google-NotebookLM, Google-GeminiNotebook", what: "Fetches pages for Google's agentic / contextual AI features and for sources added to NotebookLM/Gemini Notebook." },
      { label: "Meta", examples: "Meta-ExternalFetcher", what: "Fetches a page when a user asks a Meta AI product (WhatsApp / Instagram / Messenger) to read a URL. The Meta peer of ChatGPT-User / Claude-User / Perplexity-User." },
      { label: "Mistral", examples: "MistralAI-User", what: "On-demand fetch for Mistral's chat product. User-triggered, single page." },
      { label: "Other", examples: "kagi-fetcher, Kimi-User, Devin, Manus-User, NovaAct", what: "kagi-fetcher and Kimi-User are the Kagi/Kimi peers of ChatGPT-User. Devin (Cognition AI) is an AI software engineering agent that fetches web content as part of a task. Manus-User and NovaAct (Amazon) are AI agents that browse the web on a user's behalf." },
    ],
  },
  {
    label: "Search Engine", description: "Traditional search index crawlers", color: "text-sky-300",
    impact: "Your content → search results on Google, Bing, etc. Blocking removes you from search entirely.",
    subs: [
      { label: "General", examples: "Googlebot, Bingbot, Applebot, Yandex, Baidu", what: "Googlebot drives Google Search (90%+ of organic traffic). Bingbot powers Bing / Copilot. Applebot feeds Siri & Spotlight. Yandex/Baidu are Russia/China's primary search engines. These are the most important to keep allowed." },
      { label: "Other", examples: "Bravebot, DuckDuckBot, Sogou, SeznamBot, NaverBot, 360Spider, Google-Safety, Google-InspectionTool, Storebot-Google, KagiBot, PetalBot", what: "Bravebot powers Brave Search. DuckDuckBot powers DuckDuckGo. Sogou/Seznam/Naver/360Spider are regional search engines (China, Czech, Korea). Google-Safety checks for malicious content, Google-InspectionTool is Search Console's on-demand checker, and Storebot-Google crawls listings for Google Play/Shopping. KagiBot builds Kagi's independent search index; PetalBot builds Huawei's Petal Search index — both general search-index crawlers, not AI-answer bots." },
    ],
  },
  {
    label: "Social Preview", description: "Link unfurling / share preview cards", color: "text-fuchsia-300",
    impact: "Fetches your page when someone shares a link. Generates the title/image/description card. Blocking breaks link previews.",
    subs: [
      { label: "Platforms", examples: "Twitterbot, Facebook, LinkedIn, Pinterest, Bluesky, Tumblr, HubSpot", what: "Generate link preview cards when URLs are posted on their platforms (or used in HubSpot marketing/CRM tools). Blocking → shared links appear as bare URLs with no preview." },
      { label: "Messaging", examples: "Slack, Discord, Telegram, WhatsApp, Skype, Snapchat, Line", what: "Generate link previews in chat apps. Blocking → links shared in chats have no preview card." },
      { label: "Other", examples: "NotionBot, Iframely, ZoomBot, Embedly", what: "NotionBot generates Notion's page embeds. ZoomBot previews links shared in Zoom chat. Iframely and Embedly are third-party embed services used by many other apps to generate rich previews." },
    ],
  },
  {
    label: "SEO Tool", description: "SEO audit / tech detection analytics", color: "text-orange-400",
    impact: "Scan your site to analyze SEO, track rankings, detect technologies. Blocking prevents data collection.",
    subs: [
      { label: "Audit", examples: "AhrefsBot, SemrushBot, MozBot, MJ12bot, Majestic, Screaming Frog, SiteAuditBot, DataForSeoBot, DotBot, SISTRIX, Botify, SiteimproveBot, Brightbot", what: "Crawl your site to analyze backlinks, keywords, and SEO health. They also power their users' SEO tools. Blocking hides you from their reports." },
      { label: "Detection", examples: "Wappalyzer, BuiltWith, Similarweb", what: "Identify which technologies your site uses (CMS, frameworks, analytics). Blocking prevents tech profiling." },
    ],
  },
  {
    label: "Monitoring", description: "Uptime / performance checks", color: "text-lime-400",
    impact: "Periodic requests to verify your site is online and responsive. Blocking causes false downtime alerts.",
    subs: [
      { label: "Services", examples: "Pingdom, UptimeRobot, Datadog, NewRelic, GTmetrix, WebPageTest", what: "Check your site's uptime and performance, typically every 1-5 minutes for uptime checks or on-demand for GTmetrix/WebPageTest speed tests. If blocked, uptime checkers report your site as down, triggering false alarm notifications." },
    ],
  },
  {
    label: "Archival", description: "Web page preservation", color: "text-neutral-400",
    impact: "Save copies of your pages for historical record. Blocking removes your site from the archive.",
    subs: [
      { label: "Services", examples: "InternetArchive, Wayback Machine, ia_archiver", what: "Preserve snapshots of your pages for public access. Blocking via robots.txt is honored retroactively — already-saved pages become inaccessible." },
    ],
  },
  {
    label: "Generic / CLI", description: "Uncategorized automated agents", color: "text-neutral-400",
    impact: "Manual tools or unknown crawlers. Could be benign (dev scripts) or malicious (scraping, probing). Monitor and block individually.",
    subs: [
      { label: "CLI tools", examples: "curl, Wget, python-requests, Python-urllib, Go-http-client, Java, Ruby, HTTPie, axios, okhttp, libwww-perl", what: "Command-line or library HTTP clients. No browser, no JS. Often used for dev scripts, CI/CD checks, backend services, or targeted scraping. Benign on their own but can indicate probing." },
      { label: "Other", examples: "AdsBot-Google, OAI-AdsBot, GoogleOther, Google-CloudVertexBot, Scrapy, Slackbot, Slack-ImgProxy, KangarooBot, ResearchBot, unknown bot/crawler agents", what: "AdsBot-Google and OAI-AdsBot check ad landing page quality for Google Ads and ChatGPT ads respectively. GoogleOther is Google's internal crawler for unspecified R&D — its purpose isn't publicly documented, so it's not assumed to be AI training. Google-CloudVertexBot crawls a site owner's own site to build their custom Vertex AI Agent — not documented as training Google's own models. Scrapy is a generic scraping framework's default UA. KangarooBot and ResearchBot are unverified data collectors." },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────
// Per-bot hover legend (BotName tooltip in src/components/bot-name.tsx).
//
// Resolved by EXACT canonical bot name — i.e. bots.ts PATTERNS[].name — not
// by parsing the prose above. Every entry's `group` must match a
// LEGEND_GROUPS[].label exactly (enforced at module init below) so the
// group-level color/description/impact stay a single source of truth while
// each bot still gets its own specific blurb.
//
// Coverage goal: every PATTERNS[].name in bots.ts resolves here (see
// src/lib/bot-legend.test.ts). A few extra, non-PATTERNS fallback names that
// detectBot() can still emit (dynamic CLI tool names, "Generic Bot") are
// included too so the hover card has something useful even for those.
// ────────────────────────────────────────────────────────────────────────

interface BotLegendEntry {
  name: string;
  group: string;
  subLabel: string;
  what: string;
}

const BOT_LEGEND_ENTRIES: BotLegendEntry[] = [
  // ── AI Training ────────────────────────────────────────────────
  { name: "GPTBot", group: "AI Training", subLabel: "OpenAI", what: "Crawls your site to collect training data for future GPT / ChatGPT models. Operated by OpenAI. Blocking keeps your content out of upcoming training runs, but has no effect on ChatGPT Search or browsing." },
  { name: "ClaudeBot", group: "AI Training", subLabel: "Anthropic", what: "Crawls your site to collect training data for Claude models. Operated by Anthropic. Blocking excludes your content from future training pipelines." },
  { name: "Anthropic", group: "AI Training", subLabel: "Anthropic", what: "Legacy Anthropic training-crawler user agent (token: anthropic-ai). Same purpose as ClaudeBot — collects data for Claude model training." },
  { name: "Google-Extended", group: "AI Training", subLabel: "Google", what: "A robots.txt policy token, not a separate crawler UA. Lets you opt content out of Gemini / Vertex AI training specifically, without affecting Google Search indexing." },
  { name: "Google-Cloud-Vertex", group: "AI Training", subLabel: "Google", what: "Fetches pages on behalf of Vertex AI-based training or grounding pipelines. Operated by Google Cloud." },
  { name: "Meta-ExternalAgent", group: "AI Training", subLabel: "Meta", what: "Crawls your site to collect training data for Meta AI / Llama models and to power Meta's AI products. Operated by Meta." },
  { name: "FacebookBot", group: "AI Training", subLabel: "Meta", what: "Collects training data for Meta's AI models. Distinct from facebookexternalhit, which fetches link-preview cards, not training data." },
  { name: "Applebot-Extended", group: "AI Training", subLabel: "Apple", what: "A robots.txt policy token controlling whether Apple may use crawled content to train Apple Intelligence's on-device models. Doesn't affect Applebot's search/Siri indexing." },
  { name: "xAI-Bot", group: "AI Training", subLabel: "xAI", what: "Crawls your site to collect training data for Grok models. Operated by xAI, tied to X (Twitter)." },
  { name: "GrokBot", group: "AI Training", subLabel: "xAI", what: "Alternate xAI training-crawler user agent, same purpose as xAI-Bot — collects data to train Grok models." },
  { name: "Bytespider", group: "AI Training", subLabel: "ByteDance", what: "Crawls your site to train ByteDance's AI models (TikTok's parent company), including Doubao. Historically inconsistent about honoring robots.txt." },
  { name: "TikTokSpider", group: "AI Training", subLabel: "ByteDance", what: "A second, distinct ByteDance training crawler alongside Bytespider — downloads data to train ByteDance's LLMs." },
  { name: "CCBot", group: "AI Training", subLabel: "Common Crawl", what: "Builds the open Common Crawl web archive, reused as training data by dozens of third-party LLMs and research labs — not one single company." },
  { name: "Amazonbot", group: "AI Training", subLabel: "Other", what: "Crawls your site to improve Amazon's services, including training data for Alexa and Amazon's AI-powered product answers." },
  { name: "Cohere", group: "AI Training", subLabel: "Cohere", what: "Crawls your site to collect training data for Cohere's enterprise-focused language models." },
  { name: "Diffbot", group: "AI Training", subLabel: "Other", what: "Extracts structured data from your pages to build Diffbot's Knowledge Graph, which is resold as training/enrichment data to other AI companies." },
  { name: "ImagesiftBot", group: "AI Training", subLabel: "Other", what: "Crawls images and surrounding text to build multimodal AI training datasets. Operated by ImageSift." },
  { name: "DeepSeekBot", group: "AI Training", subLabel: "Other", what: "Crawls your site to collect training data for DeepSeek's language models." },
  { name: "AI2Bot", group: "AI Training", subLabel: "Allen AI", what: "Crawls your site to build open training datasets and models such as OLMo. Operated by the nonprofit Allen Institute for AI (AI2)." },
  { name: "MistralBot", group: "AI Training", subLabel: "Mistral", what: "Crawls your site to collect training data for Mistral AI's open-weight and commercial models." },
  { name: "HuggingFaceBot", group: "AI Training", subLabel: "Hugging Face", what: "Crawls your site to build open datasets hosted on Hugging Face, used to train third-party open-source models." },
  { name: "GLM-Spider", group: "AI Training", subLabel: "Zhipu AI", what: "Crawls your site to train Zhipu AI's ChatGLM models, a major Chinese AI lab." },
  { name: "Timpibot", group: "AI Training", subLabel: "Other", what: "Crawls your site to build Timpi's decentralized search/AI index." },
  { name: "VelenPublicBot", group: "AI Training", subLabel: "Other", what: "Crawls your site for Velen's data-collection operation; the operator's downstream use of the data isn't well documented publicly." },
  { name: "OmgiliBot", group: "AI Training", subLabel: "Other", what: "Crawls forums and discussion content to build Omgili's dataset, which is sold on to AI training customers." },
  { name: "SeekrBot", group: "AI Training", subLabel: "Other", what: "Crawls your site to build training/ranking data for Seekr's AI-driven content trust and search products." },
  { name: "ResearchBot", group: "AI Training", subLabel: "Other", what: "Identifies itself as a research data collector, but the operating company isn't reliably verifiable from the user agent alone. Treat as an unverified third-party crawler." },
  { name: "KangarooBot", group: "AI Training", subLabel: "Other", what: "An unverified crawler seen collecting general web data; the operating company is not publicly confirmed." },
  { name: "FirecrawlAgent", group: "AI Training", subLabel: "Other", what: "Crawls pages on behalf of Firecrawl, a developer API that turns websites into LLM-ready data — usually triggered by a third-party app's own crawl job, not a live user request." },
  { name: "magpie-crawler", group: "AI Training", subLabel: "Other", what: "General-purpose web crawler operated by Magpie, used to build datasets for downstream AI/analytics customers." },
  { name: "Groq-Bot", group: "AI Training", subLabel: "Other", what: "Crawls your site to collect training/grounding data associated with Groq's fast-inference AI platform." },
  { name: "Webzio", group: "AI Training", subLabel: "Other", what: "Crawls news, forums, and blogs to build Webz.io's data feeds, resold to AI and analytics companies as training/enrichment data." },
  { name: "Character-AI", group: "AI Training", subLabel: "Other", what: "Crawls your site to collect data supporting Character.AI's conversational character models." },
  { name: "KimiBot", group: "AI Training", subLabel: "Moonshot AI", what: "Crawls your site to collect training data for Moonshot AI's Kimi models. Disallowing signals your content shouldn't be used for training." },
  { name: "ICC-Crawler", group: "AI Training", subLabel: "Other", what: "Operated by Japan's National Institute of Information and Communications Technology (NICT) for AI research purposes." },
  { name: "PanguBot", group: "AI Training", subLabel: "Other", what: "Crawls your site to collect training data for Huawei's Pangu AI models." },
  { name: "Ai2Bot-Dolma", group: "AI Training", subLabel: "Allen AI", what: "A specialized variant of AI2Bot used to build the Dolma training dataset. Already caught by the parent AI2Bot pattern; this entry exists for clearer attribution." },

  // ── AI Search ──────────────────────────────────────────────────
  { name: "OAI-SearchBot", group: "AI Search", subLabel: "OpenAI", what: "Builds the index ChatGPT Search uses to cite live sources in answers. Blocking removes your site from ChatGPT Search citations (doesn't affect GPTBot training)." },
  { name: "Claude-SearchBot", group: "AI Search", subLabel: "Anthropic", what: "Builds the index Claude uses to cite sources in web-search-enabled answers. Blocking makes your site invisible to Claude's search feature." },
  { name: "PerplexityBot", group: "AI Search", subLabel: "Perplexity", what: "Crawls and indexes your site to power Perplexity's AI search answers with inline citations. A significant source of AI referral traffic." },
  { name: "PhindBot", group: "AI Search", subLabel: "Phind", what: "Crawls and indexes your site to power Phind, an AI search engine focused on developers." },
  { name: "Andibot", group: "AI Search", subLabel: "Andi", what: "Crawls and indexes your site to power Andi, an AI-powered conversational search engine." },
  { name: "Gemini-Deep-Research", group: "AI Search", subLabel: "Google", what: "Fetches pages when Gemini's Deep Research feature investigates a multi-step question on a user's behalf." },
  { name: "Grok-DeepSearch", group: "AI Search", subLabel: "xAI", what: "Fetches pages when Grok's DeepSearch feature performs multi-step research to answer a user's question." },
  { name: "YouBot", group: "AI Search", subLabel: "You.com", what: "Crawls and indexes your site to power You.com's AI search engine." },
  { name: "Cloudflare-AI-Search", group: "AI Search", subLabel: "Cloudflare", what: "Crawls your site as part of Cloudflare's AI Search infrastructure, used by sites/customers building retrieval-augmented search on Cloudflare." },
  { name: "DuckAssistBot", group: "AI Search", subLabel: "DuckDuckGo", what: "Builds the index DuckDuckGo's AI-powered DuckAssist answers cite. Separate from the plain-search DuckDuckBot crawler." },
  { name: "meta-webindexer", group: "AI Search", subLabel: "Meta", what: "Builds the index behind Meta AI's search results — the peer of OAI-SearchBot / Claude-SearchBot. Recategorized from AI training to AI search per Meta's published documentation." },
  { name: "TavilyBot", group: "AI Search", subLabel: "Tavily", what: "Crawls and indexes your site for Tavily's AI-focused search API, used for grounding by many third-party LLM apps and agents." },
  { name: "TongyiBot", group: "AI Search", subLabel: "Alibaba", what: "Fetches web content for Alibaba's Tongyi Qianwen assistant and related Qwen-generated answers." },
  { name: "YiyanBot", group: "AI Search", subLabel: "Baidu", what: "Fetches web content for Baidu's Yiyan assistant and related ERNIE-generated answers." },

  // ── AI Agent ───────────────────────────────────────────────────
  { name: "ChatGPT-User", group: "AI Agent", subLabel: "OpenAI", what: "Fetches a single page in real time when a ChatGPT user pastes a URL or the model browses on their behalf. Not bulk crawling — one request per user action." },
  { name: "Claude-User", group: "AI Agent", subLabel: "Anthropic", what: "Fetches a single page in real time when a Claude user references a URL or Claude uses a tool to browse. On-demand only." },
  // Deprecated/legacy — deliberately NOT described as equivalent to
  // Claude-User. See the code comment on this pattern in bots.ts.
  { name: "Claude-Web", group: "AI Agent", subLabel: "Anthropic (legacy)", what: "Deprecated Anthropic user agent. Its original semantics are unclear — it behaves more like a general-purpose crawler than a genuine on-demand user fetch. Kept for backward compatibility; do not assume it's equivalent to Claude-User." },
  { name: "claude-code", group: "AI Agent", subLabel: "Anthropic", what: "Requests made by Claude Code, Anthropic's CLI coding agent, when a user has it fetch a URL as part of a task." },
  { name: "Perplexity-User", group: "AI Agent", subLabel: "Perplexity", what: "Fetches a single page in real time when a Perplexity user asks about a specific URL. On-demand, cited inline in the answer." },
  { name: "GoogleAgent", group: "AI Agent", subLabel: "Google", what: "Fetches pages on behalf of Google's agentic AI features (e.g. Gemini's URL-context / browsing tools) at a user's request. Official token is the hyphenated Google-Agent." },
  { name: "Google-NotebookLM", group: "AI Agent", subLabel: "Google", what: "Fetches a page when a user adds its URL as a source in Google's NotebookLM. Legacy token — Google is migrating to Google-GeminiNotebook; support for this one ends August 2026." },
  { name: "Google-GeminiNotebook", group: "AI Agent", subLabel: "Google", what: "Fetches a page when a user adds its URL as a source in Gemini Notebook. Current token, replacing the legacy Google-NotebookLM." },
  { name: "MistralAI-User", group: "AI Agent", subLabel: "Mistral", what: "Fetches a single page in real time when a user of Mistral's chat product (Le Chat) references a URL. On-demand only." },
  { name: "Meta-ExternalFetcher", group: "AI Agent", subLabel: "Meta", what: "Fetches a single page in real time when a user asks a Meta AI product (WhatsApp / Instagram / Messenger) to read a URL. The Meta peer of ChatGPT-User / Claude-User / Perplexity-User." },
  { name: "kagi-fetcher", group: "AI Agent", subLabel: "Kagi", what: "Fetches a single page in real time when a Kagi user asks Kagi's Assistant a question requiring live retrieval. The Kagi peer of ChatGPT-User." },
  { name: "Kimi-User", group: "AI Agent", subLabel: "Moonshot AI", what: "Fetches a single page in real time when a user asks Kimi to summarize an article or answer a question requiring live web retrieval." },
  { name: "Devin", group: "AI Agent", subLabel: "Cognition AI", what: "Requests made by Devin, Cognition AI's autonomous software engineering agent, when it browses the web as part of a user's task." },
  { name: "Manus-User", group: "AI Agent", subLabel: "Manus", what: "Requests made by Manus, an AI agent operated by Butterfly Effect, when it autonomously navigates and interacts with websites on a user's behalf." },
  { name: "GoogleAgent-URLContext", group: "AI Agent", subLabel: "Google", what: "Fetches a URL a developer supplied as context to the Gemini API, on that developer's behalf." },
  { name: "NovaAct", group: "AI Agent", subLabel: "Amazon", what: "Requests made by Nova Act, Amazon's browser-using AI agent, when it navigates and interacts with websites on a user's behalf." },

  // ── Search Engine ──────────────────────────────────────────────
  { name: "Googlebot", group: "Search Engine", subLabel: "General", what: "Crawls and indexes your site for Google Search — the primary driver of organic search traffic for most sites. Blocking removes you from Google Search entirely." },
  { name: "Bingbot", group: "Search Engine", subLabel: "General", what: "Crawls and indexes your site for Bing Search and Microsoft Copilot's web results." },
  { name: "Applebot", group: "Search Engine", subLabel: "General", what: "Crawls and indexes your site to power Siri, Spotlight, and Safari search suggestions. Separate from Applebot-Extended (AI training opt-out)." },
  { name: "YandexBot", group: "Search Engine", subLabel: "General", what: "Crawls and indexes your site for Yandex, the primary search engine in Russia." },
  { name: "Baiduspider", group: "Search Engine", subLabel: "General", what: "Crawls and indexes your site for Baidu, the primary search engine in China." },
  { name: "Google-Safety", group: "Search Engine", subLabel: "Other", what: "Google's crawler for detecting malware, phishing, and policy-violating content on pages linked from Google products." },
  { name: "Google-InspectionTool", group: "Search Engine", subLabel: "Other", what: "Fetches a page on-demand when a site owner uses Google Search Console tools (URL Inspection, Rich Results Test) to check it." },
  { name: "Storebot-Google", group: "Search Engine", subLabel: "Other", what: "Crawls app and product listing pages for Google Play and Google Shopping surfaces." },
  { name: "Bravebot", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for Brave Search, an independent search index." },
  { name: "DuckDuckBot", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for DuckDuckGo's traditional (non-AI) search results." },
  { name: "Sogou", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for Sogou, a regional Chinese search engine." },
  { name: "SeznamBot", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for Seznam, the leading search engine in the Czech Republic." },
  { name: "NaverBot", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for Naver, the leading search engine in South Korea." },
  { name: "360Spider", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site for Qihoo 360 Search (so.com), a regional Chinese search engine." },
  { name: "KagiBot", group: "Search Engine", subLabel: "Other", what: "Crawls and indexes your site to build Kagi Search's independent, ad-free search index — Kagi's own docs describe this as their general search-index crawler, the peer of Googlebot/Bingbot, not one that feeds AI-generated answers (that's kagi-fetcher)." },
  { name: "PetalBot", group: "Search Engine", subLabel: "Other", what: "Huawei's crawler for Petal Search's general search index. Huawei's own webmaster docs describe it as a standard search-index crawler; not documented as feeding AI-generated answers." },

  // ── SEO Tool ───────────────────────────────────────────────────
  { name: "AhrefsBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to build Ahrefs' backlink index and keyword/SEO reports, sold to Ahrefs' subscribers. Blocking hides you from those reports, not from search engines." },
  { name: "SemrushBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power Semrush's SEO, backlink, and competitive-research tools." },
  { name: "MozBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site (also identifying as rogerbot) to power Moz's SEO analysis and link-tracking tools." },
  { name: "MJ12bot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to build Majestic's link-graph dataset. Operated by Majestic-12." },
  { name: "Majestic", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power Majestic's backlink-analysis reports." },
  { name: "Screaming Frog", group: "SEO Tool", subLabel: "Audit", what: "The Screaming Frog SEO Spider — usually run manually by a site owner or SEO consultant auditing a site's own or a client's technical SEO." },
  { name: "SiteAuditBot", group: "SEO Tool", subLabel: "Audit", what: "Generic/white-label SEO site-audit crawler used by various SEO tooling vendors to scan for technical SEO issues." },
  { name: "DataForSeoBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power DataForSEO's SERP and SEO data API, which is resold to other SEO tools and platforms." },
  { name: "DotBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to build Moz's link index — an older/secondary Moz crawler alongside rogerbot." },
  { name: "SISTRIX", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power SISTRIX's SEO visibility and ranking-tracking tools." },
  { name: "Botify", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power Botify's enterprise technical-SEO analytics platform." },
  { name: "SiteimproveBot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site to power Siteimprove's SEO, accessibility, and content-quality audits." },
  { name: "Brightbot", group: "SEO Tool", subLabel: "Audit", what: "Crawls your site for BrightEdge's SEO and content-performance analytics platform." },
  { name: "Wappalyzer", group: "SEO Tool", subLabel: "Detection", what: "Scans your site to identify the technologies it runs (CMS, frameworks, analytics, hosting). Powers Wappalyzer's tech-profiling reports and browser extension." },
  { name: "BuiltWith", group: "SEO Tool", subLabel: "Detection", what: "Scans your site to identify the technologies it runs, powering BuiltWith's technology-profiling and lead-generation database." },
  { name: "Similarweb", group: "SEO Tool", subLabel: "Detection", what: "Crawls your site to estimate traffic, engagement, and technology usage for Similarweb's market-intelligence reports." },

  // ── Social Preview ─────────────────────────────────────────────
  { name: "HubSpot", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a URL is used inside HubSpot, e.g. marketing emails or CRM link previews." },
  { name: "Twitterbot", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a link is posted on X (Twitter) to generate the preview card. Blocking makes shared links show as bare URLs on X." },
  { name: "facebook", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a link is shared on Facebook or Instagram to generate the preview card (user agent: facebookexternalhit / Facebot)." },
  { name: "LinkedIn", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a link is shared on LinkedIn to generate the preview card." },
  { name: "Pinterest", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a URL is pinned or shared on Pinterest to generate the preview image/card." },
  { name: "Bluesky", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a link is posted on Bluesky to generate the preview card." },
  { name: "Tumblr", group: "Social Preview", subLabel: "Platforms", what: "Fetches your page when a link is shared on Tumblr to generate the preview card." },
  { name: "Slack", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is pasted in Slack to generate the unfurled preview card (user agent: Slackbot-LinkExpanding)." },
  { name: "Discord", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is pasted in Discord to generate the embedded preview card." },
  { name: "Telegram", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is shared in Telegram to generate the preview card." },
  { name: "WhatsApp", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is shared in WhatsApp to generate the preview card." },
  { name: "Skype", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is shared in Skype to generate the preview card." },
  { name: "Snapchat", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is shared in Snapchat to generate the preview card." },
  { name: "Line", group: "Social Preview", subLabel: "Messaging", what: "Fetches your page when a link is shared in the LINE messaging app to generate the preview card." },
  { name: "NotionBot", group: "Social Preview", subLabel: "Other", what: "Fetches your page when a URL is pasted into Notion to generate the embedded preview/bookmark card." },
  { name: "Iframely", group: "Social Preview", subLabel: "Other", what: "A third-party embed/preview service used by many apps to generate rich link previews on their behalf — not tied to one platform." },
  { name: "ZoomBot", group: "Social Preview", subLabel: "Other", what: "Fetches your page when a link is shared in Zoom chat to generate the preview card." },
  { name: "Embedly", group: "Social Preview", subLabel: "Other", what: "A third-party embed/preview service (owned by Medium) used by many apps to generate rich link previews on their behalf." },

  // ── Monitoring ─────────────────────────────────────────────────
  { name: "Pingdom", group: "Monitoring", subLabel: "Services", what: "Checks your site's uptime and response time every 1-5 minutes from multiple global locations. Blocking triggers false downtime alerts for whoever set up the check." },
  { name: "UptimeRobot", group: "Monitoring", subLabel: "Services", what: "Checks your site's uptime on a schedule, as often as every minute on paid plans. Blocking triggers false downtime alerts." },
  { name: "Datadog", group: "Monitoring", subLabel: "Services", what: "Runs synthetic monitoring checks against your site as part of a customer's Datadog observability setup. Blocking triggers false alerts for that customer." },
  { name: "NewRelic", group: "Monitoring", subLabel: "Services", what: "Runs synthetic monitoring checks against your site as part of a customer's New Relic observability setup. Blocking triggers false alerts." },
  { name: "GTmetrix", group: "Monitoring", subLabel: "Services", what: "Fetches your page to run a performance/speed test, usually triggered manually by a site owner or developer via gtmetrix.com." },
  { name: "WebPageTest", group: "Monitoring", subLabel: "Services", what: "Fetches your page to run a performance test, usually triggered manually by a site owner or developer via webpagetest.org." },

  // ── Archival ───────────────────────────────────────────────────
  { name: "InternetArchive", group: "Archival", subLabel: "Services", what: "Saves snapshots of your pages for the Wayback Machine's public archive. Blocking via robots.txt is honored retroactively — previously saved pages can become inaccessible." },

  // ── Generic / CLI ──────────────────────────────────────────────
  { name: "GoogleOther", group: "Generic / CLI", subLabel: "Other", what: "Google's generic/internal crawler for experimental or unspecified R&D purposes. Its exact purpose isn't publicly documented by Google — unlike Google-Extended, it is not confirmed to feed AI training, so it's treated as a general-purpose Google crawler rather than an AI one." },
  { name: "Google-CloudVertexBot", group: "Generic / CLI", subLabel: "Other", what: "Per Google's own crawler docs, this crawls a site's own content only when its owner requests it, to build that owner's custom Vertex AI Agent. Not documented as training Google's own models, so treated as a general Google crawler rather than an AI-training one." },
  { name: "AdsBot", group: "Generic / CLI", subLabel: "Other", what: "Google's crawler that checks the quality and policy compliance of ad landing pages. Related to Google Ads, not organic Search ranking." },
  { name: "OAI-AdsBot", group: "Generic / CLI", subLabel: "Other", what: "OpenAI's crawler that checks the quality and policy compliance of ad landing pages linked from ChatGPT ads. Not a training or search crawler." },
  { name: "Scrapy", group: "Generic / CLI", subLabel: "Other", what: "The default user agent of the Scrapy Python web-scraping framework. Could be anyone's scraper — a dev script, data pipeline, or unsanctioned scraping." },
  { name: "Slackbot", group: "Generic / CLI", subLabel: "Other", what: "Slack's background user agent for re-verifying links already posted in Slack. Distinct from Slackbot-LinkExpanding, which fetches the initial preview." },
  { name: "Slack-ImgProxy", group: "Generic / CLI", subLabel: "Other", what: "Slack's image-proxy fetcher, used to relay images referenced in Slack messages through Slack's own CDN." },
  { name: "axios", group: "Generic / CLI", subLabel: "CLI tools", what: "The default user agent of the axios JavaScript HTTP client. Indicates a script or backend service making a programmatic request, not a browser." },
  { name: "okhttp", group: "Generic / CLI", subLabel: "CLI tools", what: "The default user agent of the OkHttp Java/Android HTTP client. Commonly a mobile app's backend call or a Java/Kotlin service, not a browser." },
  { name: "libwww-perl", group: "Generic / CLI", subLabel: "CLI tools", what: "The default user agent of Perl's LWP HTTP library. Typically a Perl script; benign on its own but worth watching if paired with unusual request patterns." },

  // ── Bonus: dynamic fallback names detectBot() can emit that aren't
  // fixed PATTERNS entries (see CLI_UA_RE / GENERIC_BOT_RE in bots.ts).
  // Not required for PATTERNS completeness but useful for hover coverage.
  { name: "curl", group: "Generic / CLI", subLabel: "CLI tools", what: "The command-line HTTP client bundled with most OSes. Used for anything from manual debugging to automated scripts — no browser, no JS execution." },
  { name: "Wget", group: "Generic / CLI", subLabel: "CLI tools", what: "A command-line file/page downloader. Often used for scripted mirroring or bulk downloads." },
  { name: "Python-urllib", group: "Generic / CLI", subLabel: "CLI tools", what: "Python's built-in HTTP client. Almost always a script, not a browser." },
  { name: "python-requests", group: "Generic / CLI", subLabel: "CLI tools", what: "The popular Python `requests` library's default user agent. Very common in scrapers, integrations, and internal scripts." },
  { name: "Go-http-client", group: "Generic / CLI", subLabel: "CLI tools", what: "Go's standard-library HTTP client default user agent. Indicates a Go program or service, not a browser." },
  { name: "Java", group: "Generic / CLI", subLabel: "CLI tools", what: "Java's built-in HttpURLConnection default user agent. Indicates a Java program or service, not a browser." },
  { name: "Ruby", group: "Generic / CLI", subLabel: "CLI tools", what: "Ruby's built-in Net::HTTP default user agent. Indicates a Ruby script or service, not a browser." },
  { name: "HTTPie", group: "Generic / CLI", subLabel: "CLI tools", what: "The HTTPie command-line HTTP client, commonly used for manual API testing and debugging." },
  { name: "CLI Tool", group: "Generic / CLI", subLabel: "CLI tools", what: "An unrecognized command-line HTTP client. No browser, no JS — likely a script, integration, or manual test." },
  { name: "Generic Bot", group: "Generic / CLI", subLabel: "Other", what: "A user agent that looks like a bot/crawler (contains a term like 'bot', 'crawler', or 'spider') but doesn't match any known, named crawler. Could be benign or a scraper." },
];

const GROUPS_BY_LABEL = new Map(LEGEND_GROUPS.map((g) => [g.label, g]));

const BOT_LEGEND_MAP = buildBotLegendMap();

function buildBotLegendMap(): Map<string, BotLegendInfo> {
  const map = new Map<string, BotLegendInfo>();
  for (const entry of BOT_LEGEND_ENTRIES) {
    const group = GROUPS_BY_LABEL.get(entry.group);
    if (!group) {
      // Fail loudly at module init rather than silently dropping coverage —
      // this only happens if a BOT_LEGEND_ENTRIES.group typo'd a
      // LEGEND_GROUPS label.
      throw new Error(`bot-legend.ts: unknown legend group "${entry.group}" for bot "${entry.name}"`);
    }
    map.set(entry.name, {
      groupLabel: group.label,
      groupDescription: group.description,
      groupColor: group.color,
      impact: group.impact,
      subLabel: entry.subLabel,
      what: entry.what,
    });
  }
  return map;
}

export function getBotLegend(botName: string): BotLegendInfo | null {
  return BOT_LEGEND_MAP.get(botName) ?? null;
}
