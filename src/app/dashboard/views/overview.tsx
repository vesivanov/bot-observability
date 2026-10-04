import type { DashboardRange } from "@/lib/period";
import { getDb } from "@/app/dashboard/db";
import { EmptyTrafficState } from "@/components/empty-traffic-state";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  roundToInterval,
  getMeta,
} from "@/app/dashboard/shared";
import { OverviewView } from "@/components/overview-view";
import type { DbClient } from "@/lib/db";

async function getStats(db: DbClient, from: Date, to: Date, project?: string, category?: string) {
  const cacheKey = `stats:${from.toISOString()}:${to.toISOString()}:${project ?? ""}:${category ?? ""}`;
  const cached = statsCache.get<Awaited<ReturnType<DbClient["fetchStatsBatch"]>>>(cacheKey);
  if (cached) return cached;
  const result = await db.fetchStatsBatch(from, to, project, category);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

async function getRollupStats(db: DbClient, from: Date, to: Date, project?: string, category?: string) {
  const cacheKey = `rollup-stats:${from.toISOString()}:${to.toISOString()}:${project ?? ""}:${category ?? ""}`;
  const cached = statsCache.get<Awaited<ReturnType<DbClient["fetchRollupStats"]>>>(cacheKey);
  if (cached) return cached;
  const result = await db.fetchRollupStats(from, to, project, category);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

export async function OverviewViewServer({
  period,
  periodDays,
  range,
  projectFilter,
  categoryFilter,
}: {
  period: string;
  periodDays: number;
  range: DashboardRange;
  projectFilter?: string;
  categoryFilter?: string;
}) {
  const db = getDb();
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const { start: periodStart, end: periodEnd } = range;
  const previousPeriodStart = new Date(periodStart.getTime() - (periodEnd.getTime() - periodStart.getTime()));
  const isLongRange = range.aggregate;

  if (isLongRange) {
    // Long-range mode: the rollup grain (bot_hits_daily) can't serve
    // path-level panels (top pages, movers, hourly distribution) or exact
    // new-bot detection — OverviewView hides those and shows a caption.
    // The rollup reader converts the shared half-open bounds to UTC days.
    // The previous interval ends exactly where the selected interval starts.
    const previousRollupEnd = periodStart;
    const [currentRollup, previousRollup, meta] = await Promise.all([
      getRollupStats(db, periodStart, periodEnd, projectFilter, categoryFilter),
      getRollupStats(db, previousPeriodStart, previousRollupEnd, projectFilter, categoryFilter),
      getMeta(db, projectFilter),
    ]);

    const prevTotal = previousRollup.total;
    const trendPercent = prevTotal > 0 ? ((currentRollup.total - prevTotal) / prevTotal) * 100 : null;

    const stats = {
      total: currentRollup.total,
      errorHits: currentRollup.errorHits,
      knownStatusHits: currentRollup.knownStatusHits,
      categories: currentRollup.categories,
      topBotsWithConfidence: currentRollup.topBots,
      aiBotsWithConfidence: currentRollup.aiBotsWithConfidence,
      aiBotsAllWithConfidence: currentRollup.aiBotsAllWithConfidence,
      newBots: [],
      topPagesByProject: undefined,
    };
    const previousStats = {
      total: previousRollup.total,
      errorHits: previousRollup.errorHits,
      knownStatusHits: previousRollup.knownStatusHits,
      categories: previousRollup.categories,
      topBotsWithConfidence: previousRollup.topBots,
      aiBotsWithConfidence: [],
      newBots: [],
    };

    if (currentRollup.total === 0) {
      return (
        <div className="space-y-5">
          <EmptyTrafficState project={projectFilter} />
          <OverviewView
            stats={stats}
            previousStats={previousStats}
            dailyTrend={currentRollup.dailyTrend}
            dailyCategoryTrend={currentRollup.dailyCategoryTrend}
            trendPercent={trendPercent}
            period={period}
            periodDays={periodDays}
            projectFilter={projectFilter}
            categoryFilter={categoryFilter}
            latestHeartbeat={meta.latestHeartbeat}
            latestEvent={meta.latestEvent}
            rangeStart={periodStart}
            rangeEnd={periodEnd}
            referenceTime={now}
            isLongRange
          />
        </div>
      );
    }

    return (
      <OverviewView
        stats={stats}
        previousStats={previousStats}
        dailyTrend={currentRollup.dailyTrend}
        dailyCategoryTrend={currentRollup.dailyCategoryTrend}
        trendPercent={trendPercent}
        period={period}
        periodDays={periodDays}
        projectFilter={projectFilter}
        categoryFilter={categoryFilter}
        latestHeartbeat={meta.latestHeartbeat}
        latestEvent={meta.latestEvent}
        rangeStart={periodStart}
        rangeEnd={periodEnd}
        referenceTime={now}
        isLongRange
      />
    );
  }

  const [currentStats, previousStats, meta, extras] = await Promise.all([
    getStats(db, periodStart, periodEnd, projectFilter, categoryFilter),
    getStats(db, previousPeriodStart, periodStart, projectFilter, categoryFilter),
    getMeta(db, projectFilter),
    periodDays === 1 ? db.chronologicalHourlyCounts(periodStart, periodEnd, projectFilter, categoryFilter) : Promise.resolve([]),
  ]);

  const prevTotal = previousStats.total;
  const trendPercent = prevTotal > 0 ? ((currentStats.total - prevTotal) / prevTotal) * 100 : null;

  if (currentStats.total === 0) {
    return (
      <div className="space-y-5">
        <EmptyTrafficState project={projectFilter} />
        <OverviewView
          stats={currentStats}
          previousStats={previousStats}
          dailyTrend={currentStats.dailyTrend}
          dailyCategoryTrend={currentStats.dailyCategoryTrend}
          chronologicalHours={extras}
          trendPercent={trendPercent}
          period={period}
          periodDays={periodDays}
          projectFilter={projectFilter}
          categoryFilter={categoryFilter}
          latestHeartbeat={meta.latestHeartbeat}
          latestEvent={meta.latestEvent}
          rangeStart={periodStart}
          rangeEnd={periodEnd}
          referenceTime={now}
          isLongRange={false}
        />
      </div>
    );
  }

  return (
    <OverviewView
      stats={currentStats}
      previousStats={previousStats}
      dailyTrend={currentStats.dailyTrend}
      dailyCategoryTrend={currentStats.dailyCategoryTrend}
          chronologicalHours={extras}
      trendPercent={trendPercent}
      period={period}
      periodDays={periodDays}
      projectFilter={projectFilter}
      categoryFilter={categoryFilter}
      latestHeartbeat={meta.latestHeartbeat}
      latestEvent={meta.latestEvent}
      rangeStart={periodStart}
      rangeEnd={periodEnd}
      referenceTime={now}
      isLongRange={false}
    />
  );
}
