"use client";

import Link from "next/link";
import { HourlyTrendChart } from "@/components/charts/hourly-trend-chart";
import { dashboardHref } from "@/lib/query-context";
import { DailyTrendDashboard } from "@/components/charts/daily-trend-chart";
import { CrawlerMixBars } from "@/components/charts/crawler-mix-bars";
import { AttentionStrip } from "@/components/attention-strip";
import { categoryLabel, categoryMeta, normalizeBotCategory } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import {
  Panel,
  StatTile,
  BarMeter,
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
  BotConfidenceCount,
  ProjectPageCount,
  NewBot,
} from "@/lib/schema";

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
  chronologicalHours = [],
  trendPercent,
  period,
  periodDays,
  projectFilter,
  categoryFilter,
  referenceTime,
  rangeStart,
  rangeEnd,
  isLongRange = false,
}: {
  // Long-range (rollup-backed) stats lack topPagesByProject — the rollup
  // grain excludes paths, so the short page ranking is hidden in aggregate mode.
  stats: PeriodStats & { topPagesByProject?: ProjectPageCount[] };
  previousStats: PeriodStats | null;
  dailyTrend: DailyCount[];
  dailyCategoryTrend: DailyCategoryCount[];
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


  const rowCategoryHref = (category: string) => categoryHref({ view: "overview", period, project: projectFilter, category });

  return (
    <div className="space-y-5">
      <div className="metrics-grid overview-metrics">
        <StatTile
          href={eventHref({period,project:projectFilter,category:categoryFilter})}
          label="Request volume"
          detail={`${trendLabel} vs previous equal period · estimated if sampled`}
          value={stats.total.toLocaleString()}
        />
        <StatTile
          href={dashboardHref({view:"bots",period,project:projectFilter,category:"ai"})}
          label="AI share"
          value={`${aiPct.toFixed(1)}%`}
          detail={`${Math.round(aiCount).toLocaleString()} AI requests`}
        />
        <StatTile
          href={dashboardHref({view:"pages",period,project:projectFilter,category:categoryFilter,status:"errors"})}
          label="Error rate"
          value={stats.knownStatusHits > 0 ? `${errorRate}%` : "Unknown"}
          detail={`${Math.round(stats.errorHits).toLocaleString()} errors · ${pct(stats.knownStatusHits, stats.total)}% known`}
          accent={errorRateAccent(errorRate)}
        />

      </div>

      <AttentionStrip current={stats} previous={previousStats} trendPercent={trendPercent} period={period} project={projectFilter} category={categoryFilter} />

      <div className="overview-traffic-grid">
      <Panel title="Request traffic" meta={periodDays === 1 && !isLongRange ? "Hourly · UTC" : "Daily · UTC"}>
        {periodDays === 1 && !isLongRange && rangeStart && rangeEnd
          ? <HourlyTrendChart data={chronologicalHours} from={rangeStart} to={rangeEnd} />
          : <DailyTrendDashboard dailyTrend={dailyTrend} categoryTrend={dailyCategoryTrend} periodDays={periodDays} referenceTime={rangeEnd ?? referenceTime} rangeStart={rangeStart} />}
      </Panel>

      <Panel title="Crawler mix" meta={topCategory ? `${categoryLabel(topCategory.bot_category)} leads` : `${Math.round(stats.total).toLocaleString()} requests`}>
        <CrawlerMixBars data={stats.categories} total={stats.total} categoryHref={rowCategoryHref} />
      </Panel>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isLongRange ? "" : "lg:grid-cols-2"}`}>
        <Panel title="Top bots" meta="Top 8 · share of all selected requests">
          {stats.topBotsWithConfidence.length === 0 ? (
            <p className="text-sm text-neutral-500">No bot activity in this period.</p>
          ) : (
            <>
              <div className="ranked-list">
                {(() => {
                  const maxHits = Math.max(...stats.topBotsWithConfidence.slice(0, 8).map((b) => b.total_hits), 1);
                  return stats.topBotsWithConfidence.slice(0, 8).map((b) => (
                    <div key={`${b.bot_name}:${b.bot_category}`} className="ranked-row">
                      <span className="ranked-identity">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${normalizeBotCategoryDot(b.bot_name, b.bot_category)}`} />
                        <BotName name={b.bot_name} href={botHref({ bot: b.bot_name, project: projectFilter, category: categoryFilter, period })} className="truncate font-medium text-neutral-100 hover:text-white" />
                      </span>
                      <BarMeter value={(b.total_hits / maxHits) * 100} />
                      <span className="ranked-value">{Math.round(b.total_hits).toLocaleString()}<small>{pct(b.total_hits, stats.total)}%</small></span>
                    </div>
                  ));
                })()}
              </div>
              <Link href={dashboardHref({ view: "bots", period, project: projectFilter, category: categoryFilter })} className="evidence-link">View all bots →</Link>
            </>
          )}
        </Panel>

        {!isLongRange && stats.topPagesByProject && (
          <Panel title="Top pages" meta={`Top ${Math.min(8, stats.topPagesByProject.length)} observed paths`}>
            {stats.topPagesByProject.length === 0 ? (
              <p className="text-sm text-neutral-500">No page activity in this period.</p>
            ) : (
              <>
                <div className="ranked-list">
                  {stats.topPagesByProject.slice(0, 8).map((p) => (
                    <div key={`${p.project}:${p.path}`} className="ranked-row ranked-page-row">
                      <span className="ranked-page-identity"><Link href={dashboardHref({ view: "pages", project: p.project, path: p.path, category: categoryFilter, period })} className="text-neutral-200 hover:text-white">{p.path}</Link><small>{p.project}</small></span>
                      <span className="ranked-value">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <Link href={dashboardHref({ view: "pages", period, project: projectFilter, category: categoryFilter })} className="evidence-link">Explore pages and responses →</Link>
              </>
            )}
          </Panel>
        )}
      </div>

      <details className="measurement-note"><summary>How to read these numbers</summary><p>Volume uses sample weighting; sampled totals are estimates. The error rate divides reported 4xx/5xx responses by requests with a known outcome. UTC charts include partial days at the selection boundaries. AI requests do not measure people, sessions, citations or referrals. Pages represent observed paths.</p></details>
    </div>
  );
}

function normalizeBotCategoryDot(botName: string, category: string) {
  return categoryMeta(normalizeBotCategory(botName, category)).dot;
}
