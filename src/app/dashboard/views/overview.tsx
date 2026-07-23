import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  metaCache,
  STATS_CACHE_TTL_MS,
  META_CACHE_TTL_MS,
  roundToInterval,
  resolvePeriodRange,
  addDays,
  getMeta,
  LONG_RANGE_THRESHOLD_DAYS,
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

async function fetchOverviewExtras(db: DbClient, params: {
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart: Date;
  project?: string;
  category?: string;
}) {
  const [botMovers, pageMovers, projectMovers, hourlyData] = await Promise.all([
    db.movers({
      dimension: "bot",
      currentFrom: params.periodStart,
      currentTo: params.periodEnd,
      previousFrom: params.previousPeriodStart,
      previousTo: params.periodStart,
      project: params.project,
      category: params.category,
      limit: 5,
    }),
    db.movers({
      dimension: "page",
      currentFrom: params.periodStart,
      currentTo: params.periodEnd,
      previousFrom: params.previousPeriodStart,
      previousTo: params.periodStart,
      project: params.project,
      category: params.category,
      limit: 5,
    }),
    db.movers({
      dimension: "project",
      currentFrom: params.periodStart,
      currentTo: params.periodEnd,
      previousFrom: params.previousPeriodStart,
      previousTo: params.periodStart,
      project: params.project,
      category: params.category,
      limit: 5,
    }),
    db.hourlyCounts(params.periodStart, params.periodEnd, params.project, params.category),
  ]);
  return { botMovers, pageMovers, projectMovers, hourlyData };
}

async function getOverviewExtras(db: DbClient, params: {
  period: string;
  now: Date;
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart: Date;
  project?: string;
  category?: string;
}) {
  // Keyed on the raw period string (not periodDays) so a preset and a custom
  // range with the same day-count never collide — they can resolve to
  // different start/end windows.
  const cacheKey = `overview-extras:${params.project ?? ""}:${params.category ?? ""}:${params.period}:${params.now.getTime()}`;
  const cached = metaCache.get<Awaited<ReturnType<typeof fetchOverviewExtras>>>(cacheKey);
  if (cached) return cached;
  const result = await fetchOverviewExtras(db, params);
  metaCache.set(cacheKey, result, META_CACHE_TTL_MS);
  return result;
}

export async function OverviewViewServer({
  period,
  periodDays,
  projectFilter,
  categoryFilter,
}: {
  period: string;
  periodDays: number;
  projectFilter?: string;
  categoryFilter?: string;
}) {
  const db = getDb();
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const { start: periodStart, end: periodEnd } = resolvePeriodRange(period, now);
  const previousPeriodStart = addDays(periodStart, -periodDays);
  const isLongRange = periodDays > LONG_RANGE_THRESHOLD_DAYS;

  if (isLongRange) {
    // Long-range mode: the rollup grain (bot_hits_daily) can't serve
    // path-level panels (top pages, movers, hourly distribution) or exact
    // new-bot detection — OverviewView hides those and shows a caption.
    // fetchRollupStats buckets by UTC calendar day with both bounds
    // inclusive, so passing `periodStart` as both the current window's lower
    // bound and the previous window's upper bound would double-count that
    // calendar day. Back the previous window's upper bound off by one day so
    // the two windows partition the rollup's day granularity without overlap.
    const previousRollupEnd = addDays(periodStart, -1);
    const [currentRollup, previousRollup, meta] = await Promise.all([
      getRollupStats(db, periodStart, periodEnd, projectFilter, categoryFilter),
      getRollupStats(db, previousPeriodStart, previousRollupEnd, projectFilter, categoryFilter),
      getMeta(db, projectFilter),
    ]);

    const prevTotal = previousRollup.total;
    const trendPercent = prevTotal > 0 ? ((currentRollup.total - prevTotal) / prevTotal) * 100 : null;

    return (
      <OverviewView
        stats={{
          total: currentRollup.total,
          errorHits: currentRollup.errorHits,
          knownStatusHits: currentRollup.knownStatusHits,
          categories: currentRollup.categories,
          topBotsWithConfidence: currentRollup.topBots,
          aiBotsWithConfidence: currentRollup.aiBotsWithConfidence,
          aiBotsAllWithConfidence: currentRollup.aiBotsAllWithConfidence,
          newBots: [],
          topPagesByProject: undefined,
        }}
        previousStats={{
          total: previousRollup.total,
          errorHits: previousRollup.errorHits,
          knownStatusHits: previousRollup.knownStatusHits,
          categories: previousRollup.categories,
          topBotsWithConfidence: previousRollup.topBots,
          aiBotsWithConfidence: [],
          newBots: [],
        }}
        dailyTrend={currentRollup.dailyTrend}
        dailyCategoryTrend={currentRollup.dailyCategoryTrend}
        hourlyData={[]}
        trendPercent={trendPercent}
        period={period}
        periodDays={periodDays}
        projectFilter={projectFilter}
        categoryFilter={categoryFilter}
        latestHeartbeat={meta.latestHeartbeat}
        latestEvent={meta.latestEvent}
        referenceTime={periodEnd}
        movers={{ bots: [], pages: [], projects: [] }}
        isLongRange
      />
    );
  }

  const [currentStats, previousStats, meta, extras] = await Promise.all([
    getStats(db, periodStart, periodEnd, projectFilter, categoryFilter),
    getStats(db, previousPeriodStart, periodStart, projectFilter, categoryFilter),
    getMeta(db, projectFilter),
    getOverviewExtras(db, { period, now, periodStart, periodEnd, previousPeriodStart, project: projectFilter, category: categoryFilter }),
  ]);

  const prevTotal = previousStats.total;
  const trendPercent = prevTotal > 0 ? ((currentStats.total - prevTotal) / prevTotal) * 100 : null;

  return (
    <OverviewView
      stats={currentStats}
      previousStats={previousStats}
      dailyTrend={currentStats.dailyTrend}
      dailyCategoryTrend={currentStats.dailyCategoryTrend}
      hourlyData={extras.hourlyData}
      trendPercent={trendPercent}
      period={period}
      periodDays={periodDays}
      projectFilter={projectFilter}
      categoryFilter={categoryFilter}
      latestHeartbeat={meta.latestHeartbeat}
      latestEvent={meta.latestEvent}
      referenceTime={periodEnd}
      movers={{ bots: extras.botMovers, pages: extras.pageMovers, projects: extras.projectMovers }}
      isLongRange={false}
    />
  );
}
