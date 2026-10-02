// Install as src/proxy.ts (or proxy.ts in a project without src/).
// Merge into an existing proxy; do not replace authentication/routing logic.
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

export const LIKELY_BOT_UA_PATTERN = ".*(?:[Bb][Oo][Tt]|[Cc][Rr][Aa][Ww][Ll][Ee][Rr]|[Ss][Pp][Ii][Dd][Ee][Rr]|[Ss][Cc][Rr][Aa][Pp]|[Ff][Ee][Tt][Cc][Hh]|curl|Wget|Python-urllib|python-requests|Go-http-client|Java/|Ruby|HTTPie|GPTBot|ChatGPT-User|OAI-|Claude|claude-code|anthropic-ai|GoogleOther|GoogleAgent|Google-Cloud|Google-Safety|Google-Inspection|Google-Notebook|Google-GeminiNotebook|Gemini-Deep-Research|Perplexity|Phind|Andibot|Meta[- ]External|meta-webindexer|Facebook|Applebot|xAI|Grok|Bytespider|CCBot|Amazonbot|Cohere|Diffbot|Imagesift|DeepSeek|AI2|Mistral|HuggingFace|ChatGLM|GLM-Spider|Timpibot|Velen|Omgili|Seekr|YouBot|ResearchBot|Kangaroo|Cloudflare-AI-Search|Firecrawl|magpie|Groq|Webzio|Character-AI|Kagi|Kimi|Tavily|ICC-Crawler|Pangu|Devin|Manus|TikTokSpider|NovaAct|Tongyi|Yiyan|BingPreview|Yandex|Baiduspider|Brave|Duck|Sogou|Seznam|Naver|Yeti|MJ12|Majestic|Screaming|Site.?Audit|Wappalyzer|BuiltWith|Similarweb|DataForSeo|SISTRIX|Botify|Siteimprove|Brightbot|HubSpot|Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Slack|Discord|Telegram|WhatsApp|Pinterest|Bluesky|Tumblr|SkypeUriPreview|NotionBot|Iframely|ZoomBot|Snapchat|Embedly|Line/[0-9]|archive[.]org|wayback|ia_archiver|Pingdom|UptimeRobot|Datadog|NewRelic|GTmetrix|WebPageTest|wptagent|PetalBot|AdsBot|Scrapy|axios/[0-9]|okhttp/[0-9]|libwww-perl).*";
const likelyBot = new RegExp(LIKELY_BOT_UA_PATTERN);
const PROBE_UA = "BotObservability-Connection-Probe/1.0";

async function deliver(payload: Record<string, unknown>) {
  const origin = process.env.BOT_COLLECTOR_ORIGIN;
  const token = process.env.BOT_INGEST_TOKEN;
  if (!origin || !token) { console.warn("[bot-observability] sender not configured"); return; }
  try {
    const response = await fetch(new URL("/api/bot-hit", origin), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!response.ok) console.warn(`[bot-observability] delivery failed: HTTP ${response.status}`);
  } catch {
    console.warn("[bot-observability] delivery failed: network error or timeout");
  }
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const ua = request.headers.get("user-agent") ?? "";
  const probe = ua === PROBE_UA;
  if (probe || likelyBot.test(ua)) {
    // Only set this header name when your platform overwrites it with the
    // original client IP. An arbitrary forwarded header is not trustworthy.
    const trustedHeader = process.env.BOT_TRUST_CLIENT_IP_HEADER;
    const ip = trustedHeader ? request.headers.get(trustedHeader)?.split(",")[0]?.trim() : undefined;
    const configuredRate = Number(process.env.BOT_SAMPLE_RATE ?? 1);
    const rate = [1, 0.5, 0.25, 0.1].includes(configuredRate) ? configuredRate : 1;
    if (probe || Math.random() < rate) {
      const payload = probe ? { probe: "connection" } : {
        url: request.nextUrl.origin + request.nextUrl.pathname,
        method: request.method,
        user_agent: ua,
        ip,
        status_code: 0, // A request-stage proxy cannot observe the final status.
        sample_rate: rate,
      };
      // Best effort: use the platform's request lifecycle, with a bounded timeout.
      event.waitUntil(deliver(payload));
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
