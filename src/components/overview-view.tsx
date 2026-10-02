"use client";

import Link from "next/link";
import { HourlyTrendChart } from "@/components/charts/hourly-trend-chart";
import { dashboardHref } from "@/lib/query-context";
import { DailyTrendDashboard } from "@/components/charts/daily-trend-chart";
import { HourlyHeatmap } from "@/components/charts/hourly-heatmap";
import { CrawlerMixBars } from "@/components/charts/crawler-mix-bars";
import { AttentionStrip } from "@/components/attention-strip";
import { categoryLabel, categoryMeta, normalizeBotCategory } from "@/lib/categories";
import { botCompany } from "@/lib/bot-companies";
import { BotName } from "@/components/bot-name";
import {
  Panel,
  StatTile,
  BarMeter,
  LongRangeCaption,
  formatRelativeTime,
  botHref,
  eventHref,
  categoryHref,
  pct,
  errorRateAccent,
} from "@/app/dashboard/shared";
import type {
  CategoryCount,
  DailyCount,
  DailyCategoryCount,
  HourlyCount,
  BotConfidenceCount,
  ProjectPageCount,
  Mover,
  NewBot,
} from "@/lib/schema";

interface Movers {
  bots: Mover[];
  pages: Mover[];
  projects: Mover[];
}

interface PeriodStats {
  total: number;
  errorHits: number;
  knownStatusHits: number;
  categories: CategoryCount[];
  topBotsWithConfidence: BotConfidenceCount[];
  aiBotsWithConfidence: BotConfidenceCount[];
  aiBotsAllWithConfidence?: BotConfidenceCount[];
  newBots: NewBot[];
}

export function OverviewView({
  stats,
  previousStats,
  dailyTrend,
  dailyCategoryTrend,
  hourlyData,
  chronologicalHours = [],
  trendPercent,
  period,
  periodDays,
  projectFilter,
  categoryFilter,
  latestHeartbeat,
  latestEvent,
  referenceTime,
  rangeStart,
  rangeEnd,
  movers,
  isLongRange = false,
}: {
  // Long-range (rollup-backed) stats lack topPagesByProject — the rollup
  // grain excludes path, so this panel + movers + heatmap are hidden and
  // replaced with a caption when isLongRange is true.
  stats: PeriodStats & { topPagesByProject?: ProjectPageCount[] };
  previousStats: PeriodStats | null;
  dailyTrend: DailyCount[];
  dailyCategoryTrend: DailyCategoryCount[];
  hourlyData: HourlyCount[];
  chronologicalHours?: DailyCount[];
  trendPercent: number | null;
  period: string;
  periodDays: number;
  projectFilter?: string;
  categoryFilter?: string;
  latestHeartbeat: Date | null;
  latestEvent: Date | null;
  referenceTime: Date;
  rangeStart?: Date;
  rangeEnd?: Date;
  movers: Movers;
  isLongRange?: boolean;
}) {
  const aiCount = stats.categories
    .filter((c) => c.bot_category.startsWith("ai_"))
    .reduce((s, c) => s + c.count, 0);
  const aiPct = stats.total > 0 ? (aiCount / stats.total) * 100 : 0;
  const errorRate = pct(stats.errorHits, stats.knownStatusHits);

  const topCategory = [...stats.categories].sort((a, b) => b.count - a.count)[0];
  const trendLabel = (previousStats?.total ?? 0) < 100
    ? `${Math.round(previousStats?.total ?? 0).toLocaleString()} → ${Math.round(stats.total).toLocaleString()}`
    : trendPercent === null
    ? stats.total > 0 ? "New" : "0%"
    : `${trendPercent >= 0 ? "+" : ""}${trendPercent.toFixed(1)}%`;
  const trendSubtitle = trendPercent === null
    ? "No previous baseline"
    : trendPercent > 0 ? "Increase" : trendPercent < 0 ? "Decrease" : "No change";

  const rowCategoryHref = (category: string) => categoryHref({ view: "overview", period, project: projectFilter, category });

  // The per-bot AI breakdown panel only renders when an AI category chip is
  // selected (All AI / AI training / AI search / AI agent). It is sourced from
  // stats.aiBotsWithConfidence, which fetchStatsBatch / fetchRollupStats scopes
  // to the selected chip — so when "AI training" is selected, the panel shows
  // only training bots (GPTBot, ClaudeBot, …), and so on.
  const AI_BREAKDOWN_CATEGORIES = new Set(["ai", "ai_training", "ai_search", "ai_agent"]);
  const showAiBreakdown = categoryFilter ? AI_BREAKDOWN_CATEGORIES.has(categoryFilter) : false;
  const breakdownLabel = !categoryFilter || categoryFilter === "ai"
    ? "AI bots"
    : categoryLabel(categoryFilter);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Request volume"
          detail="Estimated when sampling is used"
          value={stats.total.toLocaleString()}
        />
        <StatTile
          label="vs previous period"
          value={trendLabel}
          detail={trendSubtitle}
        />
        <StatTile
          label="AI share"
          value={`${aiPct.toFixed(1)}%`}
          detail={`${Math.round(aiCount).toLocaleString()} AI bot requests`}
        />
        <StatTile
          label="Error rate"
          value={stats.knownStatusHits > 0 ? `${errorRate}%` : "Unknown"}
          detail={`${Math.round(stats.errorHits).toLocaleString()} errors · ${pct(stats.knownStatusHits, stats.total)}% outcome coverage`}
          accent={errorRateAccent(errorRate)}
        />

      </div>

      <AttentionStrip current={stats} previous={previousStats} trendPercent={trendPercent} period={period} project={projectFilter} category={categoryFilter} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
        <span>Latest received request: {formatRelativeTime(latestEvent, referenceTime)}</span>
        <span>{projectFilter ? `Heartbeat: ${latestHeartbeat ? formatRelativeTime(latestHeartbeat, referenceTime) : "not configured"}` : "Heartbeat: select a project to inspect sender liveness"}</span>
      </div>
      <p className="text-sm text-neutral-400">Volume uses sample weighting; sampled totals are estimates. AI requests do not measure people, sessions, citations or referrals. Unique pages represent observed paths.</p>
      <Panel title="Request traffic" meta={periodDays === 1 && !isLongRange ? "Chronological hours · UTC" : "UTC days · partial edge days included"}>
        {periodDays === 1 && !isLongRange && rangeStart && rangeEnd
          ? <HourlyTrendChart data={chronologicalHours} from={rangeStart} to={rangeEnd} />
          : <DailyTrendDashboard dailyTrend={dailyTrend} categoryTrend={dailyCategoryTrend} periodDays={periodDays} referenceTime={rangeEnd ?? referenceTime} rangeStart={rangeStart} />}
      </Panel>

      <Panel title="Crawler mix" meta={topCategory ? `${categoryLabel(topCategory.bot_category)} leads` : `${Math.round(stats.total).toLocaleString()} requests`}>
        <CrawlerMixBars data={stats.categories} total={stats.total} categoryHref={rowCategoryHref} />
      </Panel>

      {showAiBreakdown && (
        <AiBotsBreakdown
          data={stats.aiBotsWithConfidence}
          label={breakdownLabel}
          period={period}
          projectFilter={projectFilter}
          categoryFilter={categoryFilter}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 ${isLongRange ? "" : "lg:grid-cols-2"}`}>
        <Panel title="Top bots" meta="Top 8 · share of all selected requests">
          {stats.topBotsWithConfidence.length === 0 ? (
            <p className="text-sm text-neutral-500">No bot activity in this period.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {(() => {
                  const maxHits = Math.max(...stats.topBotsWithConfidence.slice(0, 8).map((b) => b.total_hits), 1);
                  return stats.topBotsWithConfidence.slice(0, 8).map((b) => (
                    <div key={`${b.bot_name}:${b.bot_category}`} className="grid grid-cols-[1.1fr_1fr_4.5rem] items-center gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${normalizeBotCategoryDot(b.bot_name, b.bot_category)}`} />
                        <BotName name={b.bot_name} href={botHref({ bot: b.bot_name, project: projectFilter, category: categoryFilter, period })} className="truncate font-medium text-neutral-100 hover:text-white" />
                      </span>
                      <BarMeter value={(b.total_hits / maxHits) * 100} />
                      <span className="text-right font-mono text-neutral-100">{Math.round(b.total_hits).toLocaleString()}<span className="block text-xs text-neutral-500">{pct(b.total_hits, stats.total)}%</span></span>
                    </div>
                  ));
                })()}
              </div>
              <Link href={dashboardHref({ view: "bots", period, project: projectFilter, category: categoryFilter })} className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-300">View all bots →</Link>
            </>
          )}
        </Panel>

        {!isLongRange && stats.topPagesByProject && (
          <Panel title="Top pages" meta={`${stats.topPagesByProject.length} pages`}>
            {stats.topPagesByProject.length === 0 ? (
              <p className="text-sm text-neutral-500">No page activity in this period.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {stats.topPagesByProject.slice(0, 8).map((p) => (
                    <div key={`${p.project}:${p.path}`} className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-3 text-xs">
                      <span className="truncate rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-500" title={p.project}>{p.project}</span>
                      <Link href={eventHref({ project: p.project, path: p.path, category: categoryFilter, period })} className="truncate font-mono text-neutral-200 hover:text-white" title={p.path}>{p.path}</Link>
                      <span className="text-right font-mono text-neutral-100">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <details className="mt-3 group">
                  <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-300">More top pages (up to 50)</summary>
                  <div className="mt-2 space-y-1">
                    {stats.topPagesByProject.map((p) => (
                      <div key={`all:${p.project}:${p.path}`} className="grid gap-3 rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2 md:grid-cols-[2fr_1fr] md:items-center">
                        <div className="min-w-0">
                          <Link className="block truncate font-mono text-sm text-neutral-100 hover:text-white" href={eventHref({ project: p.project, path: p.path, category: categoryFilter, period })}>{p.path}</Link>
                          <p className="mt-1 text-xs text-neutral-500">
                            <span className="rounded bg-neutral-900 px-1.5 py-0.5">{p.project}</span>
                            <span className="mx-1.5">·</span>
                            Top bot {p.top_bot ? <BotName name={p.top_bot} href={botHref({ project: p.project, bot: p.top_bot, category: categoryFilter, period })} className="text-neutral-300 hover:text-white" /> : "-"}
                          </p>
                        </div>
                        <p className="text-left font-mono text-sm font-semibold text-neutral-100 md:text-right">{p.count.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </Panel>
        )}
      </div>

      <details className="rounded border border-neutral-800 p-4">
        <summary className="cursor-pointer py-2 text-sm font-medium text-neutral-300">More analysis</summary>
        <div className="mt-4 space-y-5">
      {!isLongRange && (
        <Panel title="Hour-of-day distribution" meta="Combined requests by UTC clock hour">
          <HourlyHeatmap data={hourlyData} />
        </Panel>
      )}

      {isLongRange && (
        <LongRangeCaption label="Top pages, movers, and hourly distribution are" />
      )}

      <AiRequestComparison data={stats.aiBotsWithConfidence} />

      {!isLongRange && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-100">What changed</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <MoverList title="Bot changes" items={movers.bots} period={period} project={projectFilter} category={categoryFilter} kind="bot" />
            <MoverList title="Page changes" items={movers.pages} period={period} project={projectFilter} category={categoryFilter} kind="page" />
            <MoverList title="Project changes" items={movers.projects} period={period} project={projectFilter} category={categoryFilter} kind="project" />
          </div>
        </section>
      )}
        </div>
      </details>
    </div>
  );
}

function normalizeBotCategoryDot(botName: string, category: string) {
  return categoryMeta(normalizeBotCategory(botName, category)).dot;
}

// Per-bot AI breakdown panel — shown on the Overview only when an AI category
// chip is selected (All AI / AI training / AI search / AI agent). Renders the
// individual bots behind the company-level numbers: GPTBot vs ClaudeBot vs
// PerplexityBot, ChatGPT-User vs Claude-User, etc., with verified share and a
// link into the per-bot detail view. Silent when the selected project has no
// AI hits in the chosen category (no rows → no panel).
function AiBotsBreakdown({
  data,
  label,
  period,
  projectFilter,
  categoryFilter,
}: {
  data: BotConfidenceCount[];
  label: string;
  period: string;
  projectFilter?: string;
  categoryFilter?: string;
}) {
  if (data.length === 0) return null;
  const maxHits = Math.max(...data.map((b) => b.total_hits), 1);

  return (
    <Panel title={`${label}`} eyebrow="per bot" meta={`${data.length} ${data.length === 1 ? "bot" : "bots"}`}>
      <div className="space-y-1.5">
        {data.map((b) => {
          const company = botCompany(b.bot_name);
          const verifiedShare = pct(b.verified_hits, b.total_hits);
          return (
            <div
              key={`${b.bot_name}:${b.bot_category}`}
              className="grid grid-cols-[1.2fr_1fr_5rem] items-center gap-3 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${normalizeBotCategoryDot(b.bot_name, b.bot_category)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-100">
                    <BotName
                      name={b.bot_name}
                      href={botHref({ bot: b.bot_name, project: projectFilter, category: categoryFilter, period })}
                      className="truncate font-medium text-neutral-100 hover:text-white"
                    />
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                      <span className="rounded bg-neutral-900 px-1 py-px">{company}</span>
                      <span className="text-neutral-400">
                        {b.verified_hits > 0 ? `${verifiedShare}% DNS verified` : "UA only"}
                      </span>
                    </span>
                </span>
              </span>
<BarMeter value={(b.total_hits / maxHits) * 100} color={categoryMeta(normalizeBotCategory(b.bot_name, b.bot_category)).bar} />
                <span className="text-right">
                  <span className="block font-mono text-neutral-100">{b.total_hits.toLocaleString()}</span>
                  <span className="block text-xs text-neutral-500">hits</span>
                </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// "AI crawls and user-triggered fetches" — client-side aggregation of stats.aiBotsWithConfidence
// (already fetched, no new queries) grouped by operating company. Crawls =
// hits normalizing to ai_training/ai_search/ai_crawler; fetches = ai_agent
// hits. Hidden when there's no AI activity in the period.
function AiRequestComparison({ data }: { data: BotConfidenceCount[] }) {
  const perCompany = new Map<string, { crawls: number; fetches: number }>();
  for (const row of data) {
    const category = normalizeBotCategory(row.bot_name, row.bot_category);
    const company = botCompany(row.bot_name);
    const entry = perCompany.get(company) ?? { crawls: 0, fetches: 0 };
    if (category === "ai_agent") {
      entry.fetches += row.total_hits;
    } else if (category === "ai_training" || category === "ai_search") {
      entry.crawls += row.total_hits;
    }
    perCompany.set(company, entry);
  }

  const rows = Array.from(perCompany.entries())
    .map(([company, v]) => ({ company, ...v }))
    .filter((r) => r.crawls > 0 || r.fetches > 0)
    .sort((a, b) => b.crawls - a.crawls);

  if (rows.length === 0) return null;
  const maxCrawls = Math.max(...rows.map((r) => r.crawls), 1);

  return (
    <Panel title="AI crawls and user-triggered fetches" meta={`${rows.length} ${rows.length === 1 ? "company" : "companies"}`}>
      <p className="mb-3 text-xs leading-5 text-neutral-500">
        <span className="text-amber-300">Crawls</span> are bulk fetches for training and indexing.{" "}
        <span className="text-emerald-300">User-triggered AI fetches</span> are requests associated with an assistant interaction. They are not people, sessions or confirmed referrals. The ratio divides training/search crawler requests by these fetch requests.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.company}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="font-medium text-neutral-200">{r.company}</span>
              <span className="font-mono text-neutral-500">
                {r.crawls.toLocaleString()} crawls · {r.fetches.toLocaleString()} user-triggered fetches · {r.fetches > 0 ? `${(r.crawls / r.fetches).toFixed(1)}:1` : "—"}
              </span>
            </div>
            <div className="space-y-1">
              <div title="Crawls — bulk fetches by training/indexing bots (e.g. GPTBot, ClaudeBot, PerplexityBot)">
                <BarMeter value={(r.crawls / maxCrawls) * 100} color="bg-amber-400" />
              </div>
              <div title="User-triggered AI fetches — on-demand requests in an AI chat (e.g. ChatGPT-User, Claude-User, Perplexity-User)">
                <BarMeter value={r.fetches > 0 ? (r.fetches / maxCrawls) * 100 : 0} color="bg-emerald-400" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// Below this, a delta like 1→2 is indistinguishable from noise and isn't
// worth ranking alongside a real mover like 500→800.
const MOVER_NOISE_FLOOR = 10;

function MoverList({
  title,
  items,
  period,
  kind,
  project,
  category,
}: {
  title: string;
  items: Mover[];
  period: string;
  kind: "bot" | "page" | "project";
  project?: string;
  category?: string;
}) {
  const filteredItems = items.filter((item) => Math.max(item.current_count, item.previous_count) >= MOVER_NOISE_FLOOR);
  return (
    <div className="rounded-lg border border-neutral-800/90 bg-neutral-950 p-4">
      <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">{title}</h4>
      {filteredItems.length === 0 ? (
        <p className="text-xs text-neutral-400">No increases vs previous period.</p>
      ) : (
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const href = kind === "bot"
              ? botHref({ bot: item.key, project: project ?? item.project, category, period })
              : kind === "page"
                ? eventHref({ path: item.key, project: project ?? item.project, category, period })
                : eventHref({ project: item.key, category, period });
            const currentCount = item.current_count;
            const barWidth = Math.min((Math.abs(item.delta) / Math.max(currentCount, item.previous_count, 1)) * 100, 100);
            // % change vs the previous period's count — makes the "+N" bar
            // comparable across rows regardless of each row's raw scale.
            const pctChange = item.previous_count > 0 ? (item.delta / item.previous_count) * 100 : null;
            return (
              <Link key={`${item.project}:${item.key}`} href={href} className="block hover:bg-neutral-900/70 rounded p-1.5 -mx-1.5 transition-colors">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-200">
                      {kind === "bot" ? <BotName name={item.label} className="font-medium text-neutral-200" /> : item.label}
                    </span>
                    {kind !== "project" && <span className="block text-xs text-neutral-500">{item.project}</span>}
                  </span>
                  <span className="font-mono text-neutral-300 whitespace-nowrap text-xs">
                    {item.previous_count.toLocaleString()} → {item.current_count.toLocaleString()}
                    <span className="ml-1 text-neutral-500">{pctChange !== null ? `(${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(0)}%)` : "(new)"}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barWidth}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
