import { RequestDetails } from "@/components/request-details";
import { QueryForm } from "@/components/query-form";
import { FilterSelect } from "@/components/filter-select";
import type { DashboardRange } from "@/lib/period";
import Link from "next/link";
import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  roundToInterval,
  resolvePeriodRange,
  readDashboardQuery,
  dashboardHref,
  formatDateTime,
  botHref,
  eventHref,
  getMeta,
  LONG_RANGE_THRESHOLD_DAYS,
  StatusCodeChip,
} from "@/app/dashboard/shared";
import { BotName } from "@/components/bot-name";
import { EmptyTrafficState } from "@/components/empty-traffic-state";
import type { DbClient } from "@/lib/db";

async function fetchRawEventsData(db: DbClient, params: {
  botFilter: string;
  pathFilter: string;
  projectFilter: string;
  categoryFilter: string;
  statusFilter?: string;
  prefixFilter?: string;
  from: Date;
  to: Date;
  limit: number;
  offset: number;
}) {
  return db.queryFiltered({
    botName: params.botFilter || undefined,
    path: params.pathFilter || undefined,
    prefix: params.prefixFilter,
    project: params.projectFilter || undefined,
    category: params.categoryFilter || undefined,
    status: params.statusFilter,
    from: params.from,
    to: params.to,
    limit: params.limit + 1,
    offset: params.offset,
  });
}

export async function EventsViewServer({
  searchParams,
  range,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  range?: DashboardRange;
}) {
  const db = getDb();
  const context = readDashboardQuery(searchParams);
  const botFilter = context.bot ?? "";
  const pathFilter = context.path ?? "";
  const projectFilter = context.project ?? "";
  const categoryFilter = context.category ?? "";
  const statusFilter = context.status;
  const prefixFilter = context.prefix;
  const limit = context.limit ?? 50;
  const offset = context.offset ?? 0;

  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  // Events stays raw-backed at any period length, so — unlike the other
  // views — it doesn't switch to a rollup; it simply clamps to the
  // long-range threshold to keep the underlying bot_hits scan bounded.
  const resolved = range ? { ...range, start: range.requestedStart, end: range.requestedEnd } : resolvePeriodRange(searchParams.period, now);
  const clamped = resolved.periodDays > LONG_RANGE_THRESHOLD_DAYS;
  const from = clamped ? new Date(resolved.end.getTime() - LONG_RANGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000) : resolved.start;
  const to = resolved.end;
  const period = resolved.raw;

  const cacheKey = JSON.stringify(["events", botFilter, pathFilter, projectFilter, categoryFilter, statusFilter, prefixFilter, from.toISOString(), to.toISOString(), limit, offset]);
  const cached = statsCache.get<Awaited<ReturnType<typeof fetchRawEventsData>>>(cacheKey);
  const [rows, meta] = await Promise.all([
    cached ? Promise.resolve(cached) : fetchRawEventsData(db, { botFilter, pathFilter, projectFilter, categoryFilter, statusFilter, prefixFilter, from, to, limit, offset }),
    getMeta(db, undefined),
  ]);
  if (!cached) statsCache.set(cacheKey, rows, STATS_CACHE_TTL_MS);

  const hasMore = rows.length > limit;
  const displayRows = hasMore ? rows.slice(0, limit) : rows;
  const showClear = botFilter || pathFilter || projectFilter || categoryFilter || statusFilter || prefixFilter;
  const isEmptyDb = displayRows.length === 0 && !showClear && offset === 0;

  function pageHref(newOffset: number) {
    return dashboardHref({ ...context, view: "events", offset: newOffset });
  }

  return (
    <div className="space-y-4">
      {isEmptyDb && <EmptyTrafficState project={projectFilter || undefined} />}
      <QueryForm key={cacheKey} context={context} className="event-filters">
        <input type="hidden" name="view" value="events" />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="project" value={projectFilter} />
        {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
        {prefixFilter && <input type="hidden" name="prefix" value={prefixFilter} />}
        <label className="grid gap-1">
          <span className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Bot name</span>
          <input
            name="bot"
            defaultValue={botFilter}
            placeholder="ClaudeBot"
            className="filter-control"
          />
        </label>
        <label className="grid gap-1">
          <span className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Path</span>
          <input
            name="path"
            defaultValue={pathFilter}
            placeholder="/pricing"
            className="filter-control font-mono"
          />
        </label>
        <FilterSelect name="status" label="Response status" defaultValue={statusFilter ?? ""} options={[
          { value: "", label: "All outcomes" },
          ...["2xx", "3xx", "4xx", "5xx", "errors", "unknown"].map((value) => ({ value, label: value === "unknown" ? "Not captured" : value === "errors" ? "4xx + 5xx" : value })),
          ...Array.from(new Set(["200", "301", "302", "304", "307", "308", "403", "404", "410", "429", "500", "502", "503", ...(statusFilter && /^\d+$/.test(statusFilter) ? [statusFilter] : [])])).map((value) => ({value, label: value})),
        ]} />
        <FilterSelect name="limit" label="Rows per page" defaultValue={limit.toString()} options={[25,50,100,250,500].map((value) => ({ value: String(value), label: String(value) }))} />
        <button type="submit" className="apply-button self-end">Filter requests</button>
        {showClear && (
          <Link href={dashboardHref(context, { view: "events", bot: undefined, path: undefined, prefix: undefined, status: undefined, offset: 0 })} className="quiet-button inline-flex items-center self-end">Clear request filters</Link>
        )}
      </QueryForm>

      {meta.rawDetailFrom && resolved.start < meta.rawDetailFrom && <p className="text-sm text-neutral-400">Raw detail before {meta.rawDetailFrom.toISOString().slice(0, 10)} is unavailable. The selected range is unchanged; Overview and Bots retain daily aggregate evidence.</p>}
      {clamped && (
        <p className="text-xs italic text-neutral-400">The selected range is preserved. Raw request detail is queried for the last {LONG_RANGE_THRESHOLD_DAYS} days within that range; older daily totals remain available in Overview.</p>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Showing {displayRows.length ? offset + 1 : 0}–{offset + displayRows.length}{hasMore ? "+" : ""}</span>
        <div className="flex items-center gap-2">
          {offset > 0 && (
            <Link href={pageHref(Math.max(0, offset - limit))} className="pagination-link">← Previous</Link>
          )}
          {hasMore && (
            <Link href={pageHref(offset + limit)} className="pagination-link">Next →</Link>
          )}
        </div>
      </div>

      <div className="mobile-request-list" aria-label="Request evidence">
        {displayRows.map((r) => <article key={r.id} className="request-card">
          <div className="request-card-heading"><BotName name={r.bot_name} href={botHref({ ...context, path: r.path, bot: r.bot_name, project: r.project_name, category: categoryFilter, status: statusFilter, period })} /><Link href={eventHref({ ...context, project: r.project_name, status: r.status_code >= 200 && r.status_code < 600 ? String(r.status_code) : "unknown" })} aria-label={`Filter status ${r.status_code || "not captured"}`}><StatusCodeChip statusCode={r.status_code} /></Link></div>
          <Link className="request-card-path" href={dashboardHref({ ...context, view: "pages", project: r.project_name, path: r.path, offset: 0 })}>{r.path}</Link>
          <div className="request-card-meta"><span>{r.project_name}</span><time dateTime={r.created_at}>{formatDateTime(r.created_at)}</time></div>
          <RequestDetails row={r} />
        </article>)}
        {displayRows.length === 0 && <p className="py-8 text-center text-sm text-neutral-500">No requests found for the given filters.</p>}
      </div>

      <div className="data-table-container desktop-request-table">
        <table className="data-table w-full text-xs">
          <thead className="text-neutral-500">
            <tr className="border-b border-neutral-800">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Bot</th>
              <th className="px-3 py-2 text-left font-medium">Path</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-400">{formatDateTime(r.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{r.project_name}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-100">
                  <BotName name={r.bot_name} href={botHref({ ...context, path: r.path, bot: r.bot_name, project: r.project_name, category: categoryFilter, status: statusFilter, period })} className="hover:text-white" />
                </td>
                <td className="request-log-path px-3 py-2 font-mono text-neutral-300">
                  <Link className="hover:text-white" href={dashboardHref({ ...context, view: "pages", project: r.project_name, path: r.path, offset: 0 })}>{r.path}</Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2"><Link href={eventHref({ ...context, project: r.project_name, status: r.status_code >= 200 && r.status_code < 600 ? String(r.status_code) : "unknown" })} aria-label={`Filter status ${r.status_code || "not captured"}`}><StatusCodeChip statusCode={r.status_code} /></Link></td>
                <td className="request-details-cell px-3 py-2"><RequestDetails row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayRows.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">No requests found for the given filters.</p>
        )}
      </div>
    </div>
  );
}
