import Link from "next/link";
import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  roundToInterval,
  resolvePeriodRange,
  eventHref,
  botHref,
  pct,
  errorRateAccent,
  Panel,
  StatTile,
  BarMeter,
  NormalizedCategoryChip,
  StatusCodeChip,
  statusClassTone,
  statusClassLabel,
  LongRangeCaption,
  LONG_RANGE_THRESHOLD_DAYS,
} from "@/app/dashboard/shared";
import { BotName } from "@/components/bot-name";
import { StatusTrendChart } from "@/components/charts/status-trend-chart";
import { StatusBreakdownToggle } from "@/components/status-breakdown-toggle";
import type { DbClient } from "@/lib/db";
import type { StatusBucket } from "@/lib/schema";

async function fetchStatusData(db: DbClient, from: Date, to: Date, projectFilter?: string, category?: string) {
  return db.fetchStatusBatch(from, to, projectFilter, category);
}

async function getStatusData(db: DbClient, from: Date, to: Date, projectFilter?: string, category?: string) {
  const cacheKey = `status:${from.toISOString()}:${to.toISOString()}:${projectFilter ?? ""}:${category ?? ""}`;
  const cached = statsCache.get<Awaited<ReturnType<typeof fetchStatusData>>>(cacheKey);
  if (cached) return cached;
  const result = await fetchStatusData(db, from, to, projectFilter, category);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

async function getRollupStatusData(db: DbClient, from: Date, to: Date, projectFilter?: string, category?: string) {
  const cacheKey = `rollup-status:${from.toISOString()}:${to.toISOString()}:${projectFilter ?? ""}:${category ?? ""}`;
  const cached = statsCache.get<Awaited<ReturnType<DbClient["fetchRollupStats"]>>>(cacheKey);
  if (cached) return cached;
  const result = await db.fetchRollupStats(from, to, projectFilter, category);
  statsCache.set(cacheKey, result, STATS_CACHE_TTL_MS);
  return result;
}

export async function HealthViewServer({
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
  const { start: from, end: to } = resolvePeriodRange(period, now);
  const isLongRange = periodDays > LONG_RANGE_THRESHOLD_DAYS;

  if (isLongRange) {
    // Long-range mode: bot_hits_daily has no path/sensitive-path measure, so
    // only the status trend + status-class mix can be served from the
    // rollup — everything else (exact codes, breakdowns, triage, failing
    // paths, sensitive paths) is raw-only and hidden with a caption.
    const rollup = await getRollupStatusData(db, from, to, projectFilter, categoryFilter);

    const bucketTotals = new Map<string, number>();
    for (const row of rollup.dailyStatus) {
      bucketTotals.set(row.status_class, (bucketTotals.get(row.status_class) ?? 0) + row.count);
    }
    const clientErrorHits = bucketTotals.get("4xx") ?? 0;
    const serverErrorHits = bucketTotals.get("5xx") ?? 0;
    const unknownCount = Math.max(0, rollup.total - rollup.knownStatusHits);
    const buckets: StatusBucket[] = ["2xx", "3xx", "4xx", "5xx"]
      .map((status_class) => ({ status_class, count: bucketTotals.get(status_class) ?? 0 }))
      .concat(unknownCount > 0 ? [{ status_class: "unknown", count: unknownCount }] : []);
    const maxBucket = Math.max(...buckets.map((b) => b.count), 1);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Known status" value={`${pct(rollup.knownStatusHits, rollup.total)}%`} detail={`${rollup.knownStatusHits.toLocaleString()} of ${rollup.total.toLocaleString()} hits`} />
          <StatTile label="Error rate" value={`${pct(rollup.errorHits, rollup.knownStatusHits)}%`} detail={`${rollup.errorHits.toLocaleString()} 4xx/5xx hits`} accent={errorRateAccent(pct(rollup.errorHits, rollup.knownStatusHits))} />
          <StatTile label="4xx hits" value={clientErrorHits.toLocaleString()} detail="Client errors" accent={clientErrorHits > 0 ? "text-orange-300" : "text-neutral-300"} />
          <StatTile label="5xx hits" value={serverErrorHits.toLocaleString()} detail="Server errors" accent={serverErrorHits > 0 ? "text-rose-300" : "text-neutral-300"} />
        </div>

        <Panel title="Status trend" eyebrow="daily, stacked by class">
          <StatusTrendChart data={rollup.dailyStatus} />
        </Panel>

        <Panel title="Status classes" eyebrow="response mix">
          {buckets.length === 0 ? (
            <p className="text-sm text-neutral-500">No bot hits in this period.</p>
          ) : (
            <div className="space-y-2">
              {["2xx", "3xx", "4xx", "5xx", "unknown"].map((statusClass) => {
                const count = buckets.find((bucket) => bucket.status_class === statusClass)?.count ?? 0;
                return (
                  <div key={statusClass}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-mono text-neutral-300">{statusClassLabel(statusClass)}</span>
                      <span className="font-mono text-neutral-500">{count.toLocaleString()} · {pct(count, rollup.total)}%</span>
                    </div>
                    <BarMeter value={(count / maxBucket) * 100} color={statusClassTone(statusClass)} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <LongRangeCaption label="Exact status codes, breakdowns, per-bot triage, failing paths, and sensitive-path detection are" />
      </div>
    );
  }

  const data = await getStatusData(db, from, to, projectFilter, categoryFilter);

  const { summary, buckets, dailyStatus, statusCodes, botStatusCodes, pageStatusCodes, projectStatuses, failingPaths, botStatuses, sensitiveHits } = data;
  const errorHits = summary.client_error_hits + summary.server_error_hits;
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Known status" value={`${pct(summary.known_status_hits, summary.total_hits)}%`} detail={`${summary.known_status_hits.toLocaleString()} of ${summary.total_hits.toLocaleString()} hits`} />
        <StatTile label="Error rate" value={`${pct(errorHits, summary.known_status_hits)}%`} detail={`${errorHits.toLocaleString()} 4xx/5xx hits`} accent={errorRateAccent(pct(errorHits, summary.known_status_hits))} />
        <StatTile label="4xx hits" value={summary.client_error_hits.toLocaleString()} detail="Client errors" accent={summary.client_error_hits > 0 ? "text-orange-300" : "text-neutral-300"} />
        <StatTile label="5xx hits" value={summary.server_error_hits.toLocaleString()} detail="Server errors" accent={summary.server_error_hits > 0 ? "text-rose-300" : "text-neutral-300"} />
        <StatTile label="Sensitive paths" value={summary.sensitive_path_hits.toLocaleString()} detail="Admin/login/.env/API patterns" accent={summary.sensitive_path_hits > 0 ? "text-orange-300" : "text-neutral-300"} />
      </div>

      <Panel title="Status trend" eyebrow="daily, stacked by class">
        <StatusTrendChart data={dailyStatus} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Status classes" eyebrow="response mix">
          {buckets.length === 0 ? (
            <p className="text-sm text-neutral-500">No bot hits in this period.</p>
          ) : (
            <div className="space-y-2">
              {["2xx", "3xx", "4xx", "5xx", "unknown"].map((statusClass) => {
                const count = buckets.find((bucket) => bucket.status_class === statusClass)?.count ?? 0;
                return (
                  <div key={statusClass}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-mono text-neutral-300">{statusClassLabel(statusClass)}</span>
                      <span className="font-mono text-neutral-500">{count.toLocaleString()} · {pct(count, summary.total_hits)}%</span>
                    </div>
                    <BarMeter value={(count / maxBucket) * 100} color={statusClassTone(statusClass)} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Exact status codes" eyebrow="top codes" meta={`${statusCodes.length} codes`}>
          {statusCodes.length === 0 ? (
            <p className="text-sm text-neutral-500">No captured status codes yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {statusCodes.map((row) => (
                <span
                  key={row.status_code}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px]"
                  title={`Top: ${row.top_project || "-"} · ${row.top_bot || "-"} · ${row.top_path || "-"}`}
                >
                  <StatusCodeChip statusCode={row.status_code} />
                  <span className="font-mono text-neutral-400">{row.count.toLocaleString()}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Breakdown" eyebrow="group by dimension">
        <StatusBreakdownToggle
          projectStatuses={projectStatuses}
          botStatusCodes={botStatusCodes}
          pageStatusCodes={pageStatusCodes}
          period={period}
          projectFilter={projectFilter}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Bots with errors or UA-only hits" eyebrow="triage" meta={`${botStatuses.length} bots`}>
          {botStatuses.length === 0 ? (
            <p className="text-sm text-neutral-500">No bot status issues in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-neutral-500">
                  <tr className="border-b border-neutral-800">
                    <th className="px-2 py-2 text-left font-medium">Bot</th>
                    <th className="px-2 py-2 text-left font-medium">Type</th>
                    <th className="px-2 py-2 text-right font-medium">Errors</th>
                    <th className="px-2 py-2 text-right font-medium">Error rate</th>
                    <th className="px-2 py-2 text-right font-medium">UA only</th>
                    <th className="px-2 py-2 text-right font-medium">Top status</th>
                  </tr>
                </thead>
                <tbody>
                  {botStatuses.map((bot) => (
                    <tr key={`${bot.bot_name}:${bot.bot_category}`} className="border-t border-neutral-800 hover:bg-neutral-900">
                      <td className="px-2 py-2 font-medium text-neutral-100">
                        <BotName name={bot.bot_name} href={botHref({ bot: bot.bot_name, project: projectFilter, period })} className="hover:text-white" />
                      </td>
                      <td className="px-2 py-2"><NormalizedCategoryChip botName={bot.bot_name} category={bot.bot_category} /></td>
                      <td className="px-2 py-2 text-right font-mono text-orange-300">{bot.error_hits.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-400">{pct(bot.error_hits, bot.total_hits)}%</td>
                      <td className="px-2 py-2 text-right font-mono text-amber-300">{bot.ua_only_hits.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right"><StatusCodeChip statusCode={bot.top_status_code} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Top failing paths" eyebrow="4xx and 5xx" meta={`${failingPaths.length} paths`}>
          {failingPaths.length === 0 ? (
            <p className="text-sm text-neutral-500">No 4xx or 5xx bot hits in this period.</p>
          ) : (
            <div className="space-y-1">
              {failingPaths.map((path) => (
                <Link key={`${path.project}:${path.status_code}:${path.path}`} href={eventHref({ project: path.project, path: path.path, period })} className="block rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2 hover:bg-neutral-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs text-neutral-100">{path.path}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{path.project} · {path.top_bot ? <BotName name={path.top_bot} className="text-neutral-500" /> : "Unknown bot"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusCodeChip statusCode={path.status_code} />
                      <span className="font-mono text-xs font-semibold text-neutral-100">{path.count.toLocaleString()}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sensitive and API paths" eyebrow="worth reviewing" meta={`${sensitiveHits.length} paths`}>
        {sensitiveHits.length === 0 ? (
          <p className="text-sm text-neutral-500">No sensitive or API-route bot hits in this period.</p>
        ) : (
          <div className="space-y-1">
            {sensitiveHits.map((hit) => (
              <Link key={`${hit.project}:${hit.path}`} href={eventHref({ project: hit.project, path: hit.path, period })} className="block rounded border border-neutral-800/90 bg-neutral-950 px-3 py-2 hover:bg-neutral-900/70">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-neutral-100">{hit.path}</span>
                    <span className="mt-1 block text-xs text-neutral-500">{hit.project} · {hit.top_bot ? <BotName name={hit.top_bot} className="text-neutral-500" /> : "Unknown bot"}</span>
                  </span>
                  <span className="font-mono text-xs font-semibold text-neutral-100">{hit.count.toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
