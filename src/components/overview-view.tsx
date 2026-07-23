"use client";

import Link from "next/link";
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
  periodLabel,
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
  trendPercent,
  period,
  periodDays,
  projectFilter,
  categoryFilter,
  latestHeartbeat,
  latestEvent,
  referenceTime,
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
  trendPercent: number | null;
  period: string;
  periodDays: number;
  projectFilter?: string;
  categoryFilter?: string;
  latestHeartbeat: Date | null;
  latestEvent: Date | null;
  referenceTime: Date;
  movers: Movers;
  isLongRange?: boolean;
}) {
  const aiCount = stats.categories
    .filter((c) => c.bot_category.startsWith("ai_"))
    .reduce((s, c) => s + c.count, 0);
  const aiPct = stats.total > 0 ? (aiCount / stats.total) * 100 : 0;
  const errorRate = pct(stats.errorHits, stats.knownStatusHits);

  const minutesSinceHeartbeat = latestHeartbeat
    ? (referenceTime.getTime() - latestHeartbeat.getTime()) / 60000
    : Number.POSITIVE_INFINITY;
  const healthStatus = !latestHeartbeat ? "Missing" : minutesSinceHeartbeat > 120 ? "Stale" : "Healthy";
  const healthAccent = healthStatus === "Healthy" ? "text-emerald-300" : healthStatus === "Stale" ? "text-orange-300" : "text-rose-300";
  const topCategory = [...stats.categories].sort((a, b) => b.count - a.count)[0];
  const trendLabel = trendPercent === null
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label={`Bot hits (${periodLabel(periodDays)})`}
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
          detail={`${aiCount.toLocaleString()} hits`}
        />
        <StatTile
          label="Error rate"
          value={`${errorRate}%`}
          detail={`${stats.errorHits.toLocaleString()} 4xx/5xx hits`}
          accent={errorRateAccent(errorRate)}
        />
        <StatTile
          label="Data health"
          value={healthStatus}
          detail={`Heartbeat ${formatRelativeTime(latestHeartbeat, referenceTime)} · Event ${formatRelativeTime(latestEvent, referenceTime)}`}
          accent={healthAccent}
        />
      </div>

      <AttentionStrip current={stats} previous={previousStats} trendPercent={trendPercent} period={period} project={projectFilter} />

      {periodDays !== 1 && (
        // The 24h preset zero-fills to a single bucket, which reads as a
        // near-blank area chart. "Time of day" below already covers hourly
        // distribution for this period, so skip the redundant near-empty panel.
        <Panel title="Daily trend" meta={periodLabel(periodDays)}>
          <DailyTrendDashboard dailyTrend={dailyTrend} categoryTrend={dailyCategoryTrend} periodDays={periodDays} referenceTime={referenceTime} />
        </Panel>
      )}

      <Panel title="Crawler mix" meta={topCategory ? `${categoryLabel(topCategory.bot_category)} leads` : `${stats.total.toLocaleString()} hits`}>
        <CrawlerMixBars data={stats.categories} total={stats.total} categoryHref={rowCategoryHref} />
      </Panel>

      {showAiBreakdown && (
        <AiBotsBreakdown
          data={stats.aiBotsWithConfidence}
          label={breakdownLabel}
          period={period}
          projectFilter={projectFilter}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 ${isLongRange ? "" : "lg:grid-cols-2"}`}>
        <Panel title="Top bots" meta={`${stats.topBotsWithConfidence.length} bots`}>
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
                        <BotName name={b.bot_name} href={botHref({ bot: b.bot_name, period })} className="truncate font-medium text-neutral-100 hover:text-white" />
                      </span>
                      <BarMeter value={(b.total_hits / maxHits) * 100} />
                      <span className="text-right font-mono text-neutral-100">{b.total_hits.toLocaleString()}</span>
                    </div>
                  ));
                })()}
              </div>
              <Link href={`/dashboard?view=bots&period=${encodeURIComponent(period)}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}`} className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-300">View all bots →</Link>
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
                      <span className="truncate rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500" title={p.project}>{p.project}</span>
                      <Link href={eventHref({ project: p.project, path: p.path, period })} className="truncate font-mono text-neutral-200 hover:text-white" title={p.path}>{p.path}</Link>
                      <span className="text-right font-mono text-neutral-100">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <details className="mt-3 group">
                  <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-300">View all pages</summary>
                  <div className="mt-2 space-y-1">
                    {stats.topPagesByProject.map((p) => (
                      <div key={`all:${p.project}:${p.path}`} className="grid gap-3 rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2 md:grid-cols-[2fr_1fr] md:items-center">
                        <div className="min-w-0">
                          <Link className="block truncate font-mono text-sm text-neutral-100 hover:text-white" href={eventHref({ project: p.project, path: p.path, period })}>{p.path}</Link>
                          <p className="mt-1 text-xs text-neutral-500">
                            <span className="rounded bg-neutral-900 px-1.5 py-0.5">{p.project}</span>
                            <span className="mx-1.5">·</span>
                            Top bot {p.top_bot ? <BotName name={p.top_bot} href={botHref({ project: p.project, bot: p.top_bot, period })} className="text-neutral-300 hover:text-white" /> : "-"}
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

      {!isLongRange && (
        <Panel title="Time of day" meta="Bot hit distribution by hour">
          <HourlyHeatmap data={hourlyData} />
        </Panel>
      )}

      {isLongRange && (
        <LongRangeCaption label="Top pages, movers, and hourly distribution are" />
      )}

      <AiCrawlsVsVisits data={stats.aiBotsAllWithConfidence ?? stats.aiBotsWithConfidence} />

      {!isLongRange && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-100">What changed</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <MoverList title="Bots rising" items={movers.bots} period={period} kind="bot" />
            <MoverList title="Pages rising" items={movers.pages} period={period} kind="page" />
            <MoverList title="Projects rising" items={movers.projects} period={period} kind="project" />
          </div>
        </section>
      )}
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
}: {
  data: BotConfidenceCount[];
  label: string;
  period: string;
  projectFilter?: string;
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
                      href={botHref({ bot: b.bot_name, project: projectFilter, period })}
                      className="truncate font-medium text-neutral-100 hover:text-white"
                    />
                  </span>
<span className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
                      <span className="rounded bg-neutral-900 px-1 py-px">{company}</span>
                      <span className={verifiedShare >= 50 ? "text-emerald-300" : "text-amber-300"}>
                        {verifiedShare}% verified
                      </span>
                    </span>
                </span>
              </span>
<BarMeter value={(b.total_hits / maxHits) * 100} color={categoryMeta(normalizeBotCategory(b.bot_name, b.bot_category)).bar} />
                <span className="text-right">
                  <span className="block font-mono text-neutral-100">{b.total_hits.toLocaleString()}</span>
                  <span className="block text-[10px] text-neutral-500">hits</span>
                </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// "AI crawls vs. visits" — client-side aggregation of stats.aiBotsWithConfidence
// (already fetched, no new queries) grouped by operating company. Crawls =
// hits normalizing to ai_training/ai_search/ai_crawler; visits = ai_agent
// hits. Hidden when there's no AI activity in the period.
function AiCrawlsVsVisits({ data }: { data: BotConfidenceCount[] }) {
  const perCompany = new Map<string, { crawls: number; visits: number }>();
  for (const row of data) {
    const category = normalizeBotCategory(row.bot_name, row.bot_category);
    const company = botCompany(row.bot_name);
    const entry = perCompany.get(company) ?? { crawls: 0, visits: 0 };
    if (category === "ai_agent") {
      entry.visits += row.total_hits;
    } else if (category === "ai_training" || category === "ai_search") {
      entry.crawls += row.total_hits;
    }
    perCompany.set(company, entry);
  }

  const rows = Array.from(perCompany.entries())
    .map(([company, v]) => ({ company, ...v }))
    .filter((r) => r.crawls > 0 || r.visits > 0)
    .sort((a, b) => b.crawls - a.crawls);

  if (rows.length === 0) return null;
  const maxCrawls = Math.max(...rows.map((r) => r.crawls), 1);

  return (
    <Panel title="AI crawls vs. visits" meta={`${rows.length} ${rows.length === 1 ? "company" : "companies"}`}>
      <p className="mb-3 text-xs leading-5 text-neutral-500">
        <span className="text-amber-300">Crawls</span> are bulk fetches for training and indexing.{" "}
        <span className="text-emerald-300">Visits</span> are on-demand fetches a user triggers live in an AI chat — a signal of real user intent, not browser page-views. Ratio is crawls per visit.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.company}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="font-medium text-neutral-200">{r.company}</span>
              <span className="font-mono text-neutral-500">
                {r.crawls.toLocaleString()} crawls · {r.visits.toLocaleString()} visits · {r.visits > 0 ? `${(r.crawls / r.visits).toFixed(1)}:1` : "—"}
              </span>
            </div>
            <div className="space-y-1">
              <div title="Crawls — bulk fetches by training/indexing bots (e.g. GPTBot, ClaudeBot, PerplexityBot)">
                <BarMeter value={(r.crawls / maxCrawls) * 100} color="bg-amber-400" />
              </div>
              <div title="Visits — on-demand fetches triggered live by a user in an AI chat (e.g. ChatGPT-User, Claude-User, Perplexity-User)">
                <BarMeter value={r.visits > 0 ? (r.visits / maxCrawls) * 100 : 0} color="bg-emerald-400" />
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
}: {
  title: string;
  items: Mover[];
  period: string;
  kind: "bot" | "page" | "project";
}) {
  const filteredItems = items.filter((item) => item.current_count >= MOVER_NOISE_FLOOR);
  return (
    <div className="rounded-lg border border-neutral-800/90 bg-neutral-950 p-4">
      <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">{title}</h4>
      {filteredItems.length === 0 ? (
        <p className="text-xs text-neutral-600">No increases vs previous period.</p>
      ) : (
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const href = kind === "bot"
              ? botHref({ bot: item.key, project: item.project, period })
              : kind === "page"
                ? eventHref({ path: item.key, project: item.project, period })
                : eventHref({ project: item.key, period });
            const currentCount = item.current_count;
            const barWidth = Math.min((item.delta / Math.max(currentCount, 1)) * 100, 100);
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
                    {kind !== "project" && <span className="block text-[10px] text-neutral-500">{item.project}</span>}
                  </span>
                  <span className="font-mono text-neutral-300 whitespace-nowrap text-xs">
                    +{item.delta.toLocaleString()}
                    <span className="ml-1 text-neutral-500">{pctChange !== null ? `(+${pctChange.toFixed(0)}%)` : "(new)"}</span>
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
