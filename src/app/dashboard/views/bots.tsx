import Link from "next/link";
import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  roundToInterval,
  resolvePeriodRange,
  formatDateTime,
  eventHref,
  pct,
  verifiedAccent,
  Panel,
  StatTile,
  NormalizedCategoryChip,
  StatusCodeChip,
  ConfidenceChip,
  LongRangeCaption,
  LONG_RANGE_THRESHOLD_DAYS,
} from "@/app/dashboard/shared";
import { normalizeBotCategory } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import { StackedBotChart } from "@/components/charts/stacked-bot-chart";
import { DailyTrendChart } from "@/components/charts/daily-trend-chart";
import { fillDatePeriods } from "@/lib/date-buckets";
import { BotsTable } from "@/components/bots-table";
import type { DbClient } from "@/lib/db";
import type { BotDetail } from "@/lib/schema";

async function getBotsData(db: DbClient, period: string, from: Date, to: Date, projectFilter: string | undefined, isLongRange: boolean) {
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const cacheKey = `bots:${isLongRange ? "rollup" : "raw"}:${period}:${projectFilter ?? ""}:${now.getTime()}`;
  const cached = statsCache.get<BotDetail[]>(cacheKey);
  if (cached) return cached;
  const result = isLongRange
    ? await db.allBotDetailsRollup(from, to, projectFilter)
    : await db.allBotDetails(from, to, projectFilter);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

async function fetchBotActivityData(db: DbClient, from: Date, to: Date, projectFilter?: string, category?: string) {
  return db.botPeriodCounts({ from, to, granularity: "day", project: projectFilter, category, limit: 12 });
}

async function getBotActivityData(db: DbClient, period: string, from: Date, to: Date, projectFilter?: string, category?: string) {
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const cacheKey = `bot-activity:${period}:${projectFilter ?? ""}:${category ?? ""}:${now.getTime()}`;
  const cached = statsCache.get<Awaited<ReturnType<typeof fetchBotActivityData>>>(cacheKey);
  if (cached) return cached;
  const result = await fetchBotActivityData(db, from, to, projectFilter, category);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

async function fetchBotDetailData(db: DbClient, botName: string, from: Date, to: Date, projectFilter?: string) {
  const [report, pages, rows, activity] = await Promise.all([
    db.botDetailReport(botName, from, to, projectFilter),
    db.topPagesForBot(botName, from, to, 8, projectFilter),
    db.queryFiltered({ botName, project: projectFilter, from, to, limit: 25 }),
    db.botPeriodCounts({ from, to, granularity: "day", project: projectFilter, botName, limit: 1 }),
  ]);
  return { report, pages, rows, activity };
}

async function getBotDetailData(db: DbClient, botName: string, period: string, from: Date, to: Date, projectFilter?: string) {
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const cacheKey = `bot-detail:${botName}:${period}:${projectFilter ?? ""}:${now.getTime()}`;
  const cached = statsCache.get<Awaited<ReturnType<typeof fetchBotDetailData>>>(cacheKey);
  if (cached) return cached;
  const result = await fetchBotDetailData(db, botName, from, to, projectFilter);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

async function BotDetailPanel({
  botName,
  period,
  periodDays,
  from,
  to,
  projectFilter,
}: {
  botName: string;
  period: string;
  periodDays: number;
  from: Date;
  to: Date;
  projectFilter?: string;
}) {
  const db = getDb();
  const { report, pages, rows, activity } = await getBotDetailData(db, botName, period, from, to, projectFilter);

  if (!report) {
    return (
      <div className="space-y-2">
        <Link href={`/dashboard?view=bots&period=${encodeURIComponent(period)}${projectFilter ? `&project=${projectFilter}` : ""}`} className="text-xs text-neutral-500 hover:text-neutral-300">← All bots</Link>
        <p className="text-sm text-neutral-500">No events found for {botName} in the selected period.</p>
      </div>
    );
  }

  // Zero-fill the per-bot daily series against the same reference end (`to`)
  // views elsewhere use, so custom-range buckets align.
  const activityByDate = new Map(activity.map((row) => [row.period, row.count]));
  const activitySeries = fillDatePeriods(periodDays, to).map((date) => ({ date, count: activityByDate.get(date) ?? 0 }));

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/dashboard?view=bots&period=${encodeURIComponent(period)}${projectFilter ? `&project=${projectFilter}` : ""}`} className="text-xs text-neutral-500 hover:text-neutral-300">← All bots</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <BotName name={report.bot_name} className="text-xl font-semibold tracking-tight text-white" />
          <NormalizedCategoryChip botName={report.bot_name} category={report.bot_category} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Last seen {formatDateTime(report.last_seen)}
          {report.first_seen ? <> · First seen {formatDateTime(report.first_seen)}</> : null}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total hits" value={report.total_hits.toLocaleString()} />
        <StatTile label="Verified share" value={`${pct(report.verified_hits, report.total_hits)}%`} detail={`${report.ua_only_hits.toLocaleString()} UA-only hits`} accent={verifiedAccent(pct(report.verified_hits, report.total_hits))} />
        <StatTile label="Projects hit" value={report.projects_hit.toLocaleString()} />
        <StatTile label="Top project" value={report.top_project || "-"} />
      </div>

      <Panel title="Activity" eyebrow="daily hits">
        <DailyTrendChart data={activitySeries} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Top pages for this bot" eyebrow="paths">
          <div className="space-y-1">
            {pages.map((p) => (
              <Link key={`${p.project}:${p.path}`} href={eventHref({ project: p.project, bot: botName, path: p.path, period })} className="block rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2 hover:bg-neutral-900/70">
                <div className="flex items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm text-neutral-100">{p.path}</span>
                    <span className="mt-1 block text-xs text-neutral-500">{p.project}</span>
                  </span>
                  <span className="font-mono text-sm font-semibold text-neutral-100">{p.count.toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <section>
          <Panel title="Recent events" eyebrow="sample" meta="25 latest">
            <div className="space-y-1">
              {rows.map((r) => (
                <div key={r.id} className="rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-neutral-500">{formatDateTime(r.created_at)}</span>
                    <span className="flex items-center gap-1.5">
                      <StatusCodeChip statusCode={r.status_code} />
                      <ConfidenceChip confidence={r.confidence} />
                    </span>
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-neutral-200">{r.path}</p>
                  <p className="mt-1 text-xs text-neutral-500">{r.project_name}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Link href={eventHref({ bot: botName, project: projectFilter, period })} className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-300">Open all raw events</Link>
        </section>
      </div>
    </div>
  );
}

export async function BotsViewServer({
  period,
  periodDays,
  projectFilter,
  categoryFilter,
  botFilter,
}: {
  period: string;
  periodDays: number;
  projectFilter?: string;
  categoryFilter?: string;
  botFilter?: string;
}) {
  const db = getDb();
  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  const { start: from, end: to } = resolvePeriodRange(period, now);
  const isLongRange = periodDays > LONG_RANGE_THRESHOLD_DAYS;

  const [bots, activity] = await Promise.all([
    getBotsData(db, period, from, to, projectFilter, isLongRange),
    (botFilter || isLongRange) ? Promise.resolve(null) : getBotActivityData(db, period, from, to, projectFilter, categoryFilter),
  ]);

  const filteredBots = categoryFilter === "ai"
    ? bots.filter((b) => normalizeBotCategory(b.bot_name, b.bot_category).startsWith("ai_"))
    : categoryFilter
      ? bots.filter((b) => normalizeBotCategory(b.bot_name, b.bot_category) === categoryFilter)
      : bots;

  return (
    <div className="space-y-4">
      {botFilter && (
        <Panel title={botFilter} eyebrow="bot detail">
          <BotDetailPanel botName={botFilter} period={period} periodDays={periodDays} from={from} to={to} projectFilter={projectFilter} />
        </Panel>
      )}

      {!botFilter && isLongRange && <LongRangeCaption label="The daily bot activity chart is" />}

      {!botFilter && !isLongRange && activity && activity.length > 0 && (
        <StackedBotChart
          title="Daily bot hits by bot"
          periods={fillDatePeriods(periodDays, to)}
          rows={activity}
          granularity="day"
        />
      )}

      {filteredBots.length === 0 ? (
        <Panel title="All bot identities">
          <p className="text-sm text-neutral-500">No bots detected in this period{categoryFilter ? ` for category "${categoryFilter}"` : ""}.</p>
        </Panel>
      ) : (
        <BotsTable bots={filteredBots} period={period} projectFilter={projectFilter} />
      )}
    </div>
  );
}
