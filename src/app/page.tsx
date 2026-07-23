import { cookies } from "next/headers";
import Link from "next/link";
import { getBotLogToken, isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";
import { CATEGORY_ORDER, categoryLabel, categoryMeta } from "@/lib/categories";
import { CrawlerMixBars } from "@/components/charts/crawler-mix-bars";
import { BotName } from "@/components/bot-name";
import { LandingPreviewTabs } from "@/components/landing-preview-tabs";
import {
  Panel,
  StatTile,
  BarMeter,
  botHref,
  errorRateAccent,
  pct,
  statusClassTone,
  statusClassLabel,
  StatusCodeChip,
} from "@/app/dashboard/shared";

const REPO_URL = "https://github.com/vesivanov/bot-observability";

// Copy for each real, user-facing category (keyed by the canonical
// BotCategory values in lib/categories.ts, not hand-invented labels).
const CATEGORY_DESCRIPTIONS: Partial<Record<string, string>> = {
  ai_training: "Bulk model data collection",
  ai_search: "Citation and retrieval indexes",
  ai_agent: "User-triggered page fetches",
  search_crawler: "Traditional organic discovery",
  seo_crawler: "Audits and competitive scans",
  social_preview: "Link previews and unfurlers",
  generic: "Scripts, libraries, and unclassified bots",
};

// "unknown" has no meaningful category to advertise, and "ai_crawler" is a
// legacy internal bucket normalized away at query time (see
// normalizeBotCategory) — neither is real/user-facing. Same filter the
// dashboard's category chip row uses (src/app/dashboard/page.tsx).
const VISIBLE_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "unknown" && c !== "ai_crawler");

// Illustrative counts for the hero preview panel — clearly labeled "Example
// data" below, never presented as a live query. Real category keys/colors
// (from lib/categories.ts) so the shape matches the actual dashboard exactly.
const PREVIEW_CATEGORIES = [
  { bot_category: "ai_training", count: 8400 },
  { bot_category: "search_crawler", count: 4200 },
  { bot_category: "ai_search", count: 2100 },
  { bot_category: "seo_crawler", count: 1450 },
  { bot_category: "social_preview", count: 980 },
  { bot_category: "ai_agent", count: 640 },
  { bot_category: "generic", count: 320 },
];
const PREVIEW_TOTAL = PREVIEW_CATEGORIES.reduce((sum, row) => sum + row.count, 0);
const PREVIEW_AI_HITS = PREVIEW_CATEGORIES
  .filter((c) => c.bot_category.startsWith("ai_"))
  .reduce((sum, c) => sum + c.count, 0);
const PREVIEW_ERROR_HITS = 217;
const PREVIEW_ERROR_RATE = Math.round((PREVIEW_ERROR_HITS / PREVIEW_TOTAL) * 100 * 10) / 10;

// Real bot names (see lib/bots.ts) paired with their actual detected
// category, so the dots/tooltips below match what the app really reports.
const PREVIEW_TOP_BOTS: { name: string; category: string; hits: number }[] = [
  { name: "GPTBot", category: "ai_training", hits: 5200 },
  { name: "ClaudeBot", category: "ai_training", hits: 3200 },
  { name: "Googlebot", category: "search_crawler", hits: 2800 },
  { name: "Bingbot", category: "search_crawler", hits: 1600 },
  { name: "PerplexityBot", category: "ai_search", hits: 1400 },
  { name: "ChatGPT-User", category: "ai_agent", hits: 1100 },
  { name: "AhrefsBot", category: "seo_crawler", hits: 1050 },
  { name: "Twitterbot", category: "social_preview", hits: 720 },
  { name: "UptimeRobot", category: "generic", hits: 340 },
];
const PREVIEW_MAX_BOT_HITS = Math.max(...PREVIEW_TOP_BOTS.map((b) => b.hits));

// Status-class split for the same 18,090-hit example dataset as
// PREVIEW_CATEGORIES above (17400 + 473 + 160 + 57 = 18090), so the error
// rate/count shown here matches PREVIEW_ERROR_HITS/PREVIEW_ERROR_RATE exactly.
const PREVIEW_STATUS_BUCKETS: { status_class: string; count: number }[] = [
  { status_class: "2xx", count: 17400 },
  { status_class: "3xx", count: 473 },
  { status_class: "4xx", count: 160 },
  { status_class: "5xx", count: 57 },
];
const PREVIEW_MAX_STATUS = Math.max(...PREVIEW_STATUS_BUCKETS.map((b) => b.count));

// Illustrative raw-event rows for the "Raw events" tab teaser.
const PREVIEW_EVENTS: { time: string; bot: string; category: string; statusCode: number; path: string; project: string }[] = [
  { time: "0:04 ago", bot: "GPTBot", category: "ai_training", statusCode: 200, path: "/blog/how-ai-crawlers-work", project: "marketing-site" },
  { time: "0:41 ago", bot: "Googlebot", category: "search_crawler", statusCode: 200, path: "/pricing", project: "marketing-site" },
  { time: "1:12 ago", bot: "AhrefsBot", category: "seo_crawler", statusCode: 404, path: "/old-landing-page", project: "marketing-site" },
];

const HOW_IT_WORKS = [
  ["1", "Send events", "Your app POSTs each request's user agent, path, and status code to /api/bot-hit as it's served — from middleware, an edge function, or backend logging code."],
  ["2", "Bots get identified", "Every event is matched against 130+ known crawler patterns and (where possible) verified via reverse-DNS or IP range, server-side, on the way in."],
  ["3", "You inspect the traffic", "The dashboard rolls hits up by bot, category, page, and status so you can see who's crawling, what they're reading, and what's breaking."],
];

const FEATURES = [
  ["Bot identity", "Detect crawler families, categories, and verified vs UA-only traffic.", "border-neutral-800"],
  ["Traffic trends", "Compare bot, page, and project movement across daily, weekly, and monthly views.", "border-neutral-800"],
  ["Response quality", "Review status classes, failing paths, API hits, and sensitive route probes.", "border-neutral-800"],
];

const DASHBOARD_VIEWS = [
  ["Overview", "Totals, crawler mix, daily trend, time-of-day distribution, movers, and AI crawls-vs-visits by company."],
  ["Bots", "Full bot list with categories, project spread, hit share, and last seen time — includes a per-bot detail view and an AI-only filter."],
  ["Health", "2xx/3xx/4xx/5xx mix, failing paths, and sensitive/API path hits."],
  ["Raw Events", "Filterable event log for individual bot requests and debugging."],
];

const INGEST_FIELDS = [
  ["project", "Groups traffic by product, site, or deployment."],
  ["url / path", "Identifies which content bots are requesting."],
  ["user_agent", "Drives bot detection and category assignment."],
  ["ip", "Enables reverse-DNS and CIDR verification when available."],
  ["status_code", "Separates successful reads from redirects, errors, and uncaptured rows."],
  ["heartbeat", "Tracks whether the logging pipeline is still alive."],
];

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A10.51 10.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default async function HomePage() {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const authed = isSessionValid(session ?? null, getBotLogToken());
  const previewCategoryHref = (category: string) => `/dashboard?view=overview&category=${encodeURIComponent(category)}`;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-amber-300">Open source · self-hosted</p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-100 sm:text-4xl">
            Bot Observability
          </h1>
          <p className="mt-4 text-sm leading-6 text-neutral-400">
            See exactly which AI crawlers, search engines, and other bots are reading your sites, which pages they hit, and whether those requests are healthy, broken, or worth blocking.
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            It&apos;s a Next.js + Postgres app you run yourself: point it at your own database, drop one API call into your app, and traffic starts showing up in the dashboard below.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded border border-neutral-600 bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
            >
              <GitHubMark className="h-4 w-4" />
              View on GitHub
            </a>
            {authed ? (
              <Link href="/dashboard" className="rounded border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:text-neutral-100">
                Open dashboard
              </Link>
            ) : null}
            <a href="#get-started" className="rounded border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:text-neutral-100">
              Get started
            </a>
          </div>

          {!authed ? (
            <details className="mt-5 max-w-md">
              <summary className="inline-flex w-fit cursor-pointer list-none items-center rounded border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 [&::-webkit-details-marker]:hidden">
                Already running your own instance? Sign in
              </summary>
              <form action="/login" method="POST" className="mt-3 flex gap-2">
                <input
                  name="token"
                  type="password"
                  placeholder="Access token"
                  autoFocus
                  className="min-h-10 flex-1 rounded border border-neutral-800 bg-neutral-950 px-3 text-sm text-foreground outline-none placeholder:text-neutral-600 focus:border-neutral-600"
                />
                <button type="submit" className="rounded border border-neutral-600 bg-neutral-200 px-4 text-sm font-medium text-neutral-950 hover:bg-white">
                  Sign in
                </button>
              </form>
            </details>
          ) : null}
        </div>

        <Panel title="Top bots this week" meta="Example data">
          <div className="space-y-1.5">
            {PREVIEW_TOP_BOTS.slice(0, 6).map((bot) => (
              <div key={bot.name} className="grid grid-cols-[1.1fr_1fr_4rem] items-center gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${categoryMeta(bot.category).dot}`} />
                  <BotName name={bot.name} href={botHref({ bot: bot.name, period: "7" })} className="truncate font-medium text-neutral-100 hover:text-white" />
                </span>
                <BarMeter value={(bot.hits / PREVIEW_MAX_BOT_HITS) * 100} />
                <span className="text-right font-mono text-neutral-100">{bot.hits.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800/80 pt-3">
            <StatTile label="Bot hits (7d)" value={PREVIEW_TOTAL.toLocaleString()} />
            <StatTile
              label="AI share"
              value={`${((PREVIEW_AI_HITS / PREVIEW_TOTAL) * 100).toFixed(1)}%`}
              detail={`${PREVIEW_AI_HITS.toLocaleString()} hits`}
            />
          </div>
        </Panel>
      </section>

      <section className="mt-12 border-t border-neutral-800 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-200">See it in action</h2>
          <span className="text-[11px] text-neutral-600">Example data — not a live query</span>
        </div>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-500">
          Flip through the same tabs the real dashboard has — the numbers below are illustrative, but the panels, colors, and layout are exactly what you&apos;ll see once your own traffic starts flowing in.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Bot hits (7d)" value={PREVIEW_TOTAL.toLocaleString()} />
          <StatTile
            label="AI share"
            value={`${((PREVIEW_AI_HITS / PREVIEW_TOTAL) * 100).toFixed(1)}%`}
            detail={`${PREVIEW_AI_HITS.toLocaleString()} hits`}
          />
          <StatTile
            label="Error rate"
            value={`${PREVIEW_ERROR_RATE}%`}
            detail={`${PREVIEW_ERROR_HITS.toLocaleString()} 4xx/5xx hits`}
            accent={errorRateAccent(PREVIEW_ERROR_RATE)}
          />
          <StatTile label="Data health" value="Healthy" detail="Heartbeat 2m ago · Event 4s ago" accent="text-emerald-300" />
        </div>

        <div className="mt-4">
          <LandingPreviewTabs
            tabs={[
              {
                key: "overview",
                label: "Overview",
                content: (
                  <Panel title="Crawler mix" meta="AI training leads">
                    <CrawlerMixBars data={PREVIEW_CATEGORIES} total={PREVIEW_TOTAL} categoryHref={previewCategoryHref} />
                  </Panel>
                ),
              },
              {
                key: "bots",
                label: "Bots",
                content: (
                  <Panel title="Top bots" meta={`${PREVIEW_TOP_BOTS.length} bots`}>
                    <div className="space-y-1.5">
                      {PREVIEW_TOP_BOTS.map((bot) => (
                        <div key={bot.name} className="grid grid-cols-[1.1fr_1fr_4.5rem] items-center gap-3 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 truncate">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${categoryMeta(bot.category).dot}`} />
                            <BotName name={bot.name} href={botHref({ bot: bot.name, period: "7" })} className="truncate font-medium text-neutral-100 hover:text-white" />
                          </span>
                          <BarMeter value={(bot.hits / PREVIEW_MAX_BOT_HITS) * 100} />
                          <span className="text-right font-mono text-neutral-100">{bot.hits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-neutral-600">Hover a bot name for what it is and why it&apos;s crawling.</p>
                  </Panel>
                ),
              },
              {
                key: "health",
                label: "Health",
                content: (
                  <Panel title="Status classes" meta="response mix">
                    <div className="space-y-2">
                      {PREVIEW_STATUS_BUCKETS.map((bucket) => (
                        <div key={bucket.status_class}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-mono text-neutral-300">{statusClassLabel(bucket.status_class)}</span>
                            <span className="font-mono text-neutral-500">{bucket.count.toLocaleString()} · {pct(bucket.count, PREVIEW_TOTAL)}%</span>
                          </div>
                          <BarMeter value={(bucket.count / PREVIEW_MAX_STATUS) * 100} color={statusClassTone(bucket.status_class)} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-neutral-600">Failing paths, sensitive-path probes, and per-bot triage live on the Health tab.</p>
                  </Panel>
                ),
              },
              {
                key: "events",
                label: "Raw events",
                content: (
                  <Panel title="Raw events" meta="filterable log">
                    <div className="space-y-1.5">
                      {PREVIEW_EVENTS.map((e, i) => (
                        <div key={i} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 text-xs">
                          <span className="text-neutral-600">{e.time}</span>
                          <span className="flex min-w-0 items-center gap-1.5 truncate">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${categoryMeta(e.category).dot}`} />
                            <BotName name={e.bot} href={botHref({ bot: e.bot, period: "7" })} className="shrink-0 font-medium text-neutral-100 hover:text-white" />
                            <span className="truncate font-mono text-neutral-500">{e.path}</span>
                          </span>
                          <span className="flex justify-end">
                            <StatusCodeChip statusCode={e.statusCode} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ),
              },
            ]}
          />
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">How it works</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS.map(([step, title, copy]) => (
            <div key={title} className="rounded border border-neutral-800 bg-neutral-950 p-4">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/15 font-mono text-[11px] font-semibold text-amber-300">{step}</span>
              <h3 className="mt-2.5 text-sm font-medium text-neutral-100">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-neutral-500">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">What you get</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {FEATURES.map(([title, copy, border]) => (
            <div key={title} className={`rounded border ${border} bg-neutral-950 p-4`}>
              <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-neutral-500">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">What you can inspect</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DASHBOARD_VIEWS.map(([title, copy]) => (
            <div key={title} className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2.5">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                <div>
                  <h3 className="text-xs font-medium text-neutral-200">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">{copy}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Response status reporting</h2>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Status reporting depends on tracked sites sending <span className="font-mono text-neutral-300">status_code</span>. Rows without that field are shown as <span className="text-neutral-300">not captured</span>, not as a real HTTP status.
            </p>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Use the Status tab to find bots reading broken URLs, hitting API routes, probing admin/login paths, or generating server errors.
            </p>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <h3 className="text-xs font-medium text-neutral-200">Useful ingestion fields</h3>
            <div className="mt-3 grid gap-2">
              {INGEST_FIELDS.map(([field, copy]) => (
                <div key={field} className="grid grid-cols-[7rem_1fr] gap-3 text-xs">
                  <span className="font-mono text-neutral-300">{field}</span>
                  <span className="leading-5 text-neutral-500">{copy}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">Bot categories</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {VISIBLE_CATEGORIES.map((cat) => {
            const meta = categoryMeta(cat);
            return (
              <div key={cat} className={`rounded border px-3 py-2.5 ${meta.chip}`}>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  {categoryLabel(cat)}
                </span>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">{CATEGORY_DESCRIPTIONS[cat]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="get-started" className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">Get started</h2>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-neutral-500">
          Requires Node.js 20+ and a Postgres database (Aiven, Neon, or any standard Postgres). Clone the repo, then:
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs leading-6 text-neutral-300">
{`npm install
cp .env.example .env        # set DATABASE_URL and BOT_LOG_TOKEN
npm run migrate
npm run dev`}
        </pre>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-neutral-500">
          Open <span className="font-mono text-neutral-300">/dashboard</span> and sign in with your <span className="font-mono text-neutral-300">BOT_LOG_TOKEN</span>. Full setup, deployment, and ingestion docs are in the{" "}
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noopener noreferrer" className="text-neutral-300 underline decoration-neutral-700 underline-offset-2 hover:text-white">
            README
          </a>.
        </p>
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5 text-xs text-neutral-600">
        <span>MIT licensed · Next.js + Postgres · self-hosted</span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-300">
          <GitHubMark className="h-3.5 w-3.5" />
          vesivanov/bot-observability
        </a>
      </footer>
    </div>
  );
}
