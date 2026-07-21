import Link from "next/link";
import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  roundToInterval,
  resolvePeriodRange,
  getRawEventLimit,
  formatDateTime,
  botHref,
  eventHref,
  getMeta,
  LONG_RANGE_THRESHOLD_DAYS,
  NormalizedCategoryChip,
  StatusCodeChip,
  ConfidenceChip,
} from "@/app/dashboard/shared";
import { BotName } from "@/components/bot-name";
import type { DbClient } from "@/lib/db";

async function fetchRawEventsData(db: DbClient, params: {
  botFilter: string;
  pathFilter: string;
  projectFilter: string;
  from: Date;
  to: Date;
  limit: number;
  offset: number;
}) {
  return db.queryFiltered({
    botName: params.botFilter || undefined,
    path: params.pathFilter || undefined,
    project: params.projectFilter || undefined,
    from: params.from,
    to: params.to,
    limit: params.limit + 1,
    offset: params.offset,
  });
}

export async function EventsViewServer({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const db = getDb();
  const botFilter = (searchParams.bot as string) ?? "";
  const pathFilter = (searchParams.path as string) ?? "";
  const projectFilter = (searchParams.project as string) ?? "";
  const limit = getRawEventLimit(searchParams.limit);
  const offset = Math.max(0, parseInt(Array.isArray(searchParams.offset) ? searchParams.offset[0] ?? "" : searchParams.offset ?? "", 10) || 0);

  const now = roundToInterval(new Date(), STATS_CACHE_TTL_MS);
  // Events stays raw-backed at any period length, so — unlike the other
  // views — it doesn't switch to a rollup; it simply clamps to the
  // long-range threshold to keep the underlying bot_hits scan bounded.
  const resolved = resolvePeriodRange(searchParams.period, now);
  const clamped = resolved.periodDays > LONG_RANGE_THRESHOLD_DAYS;
  const periodDays = clamped ? LONG_RANGE_THRESHOLD_DAYS : resolved.periodDays;
  const from = clamped ? new Date(resolved.end.getTime() - LONG_RANGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000) : resolved.start;
  const to = resolved.end;
  const period = clamped ? periodDays.toString() : resolved.raw;

  const cacheKey = `events:${botFilter}:${pathFilter}:${projectFilter}:${period}:${limit}:${offset}:${now.getTime()}`;
  const cached = statsCache.get<Awaited<ReturnType<typeof fetchRawEventsData>>>(cacheKey);
  const [rows, meta] = await Promise.all([
    cached ? Promise.resolve(cached) : fetchRawEventsData(db, { botFilter, pathFilter, projectFilter, from, to, limit, offset }),
    getMeta(db, undefined),
  ]);
  if (!cached) statsCache.set(cacheKey, rows, STATS_CACHE_TTL_MS);
  const allProjects = meta.allProjects;

  const hasMore = rows.length > limit;
  const displayRows = hasMore ? rows.slice(0, limit) : rows;
  const showClear = botFilter || pathFilter || projectFilter;

  function pageHref(newOffset: number) {
    const q = new URLSearchParams({ view: "events", period, limit: limit.toString() });
    if (botFilter) q.set("bot", botFilter);
    if (pathFilter) q.set("path", pathFilter);
    if (projectFilter) q.set("project", projectFilter);
    if (newOffset > 0) q.set("offset", newOffset.toString());
    return `/dashboard?${q.toString()}`;
  }

  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded border border-neutral-800/90 bg-neutral-950 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto]" method="GET" action="/dashboard">
        <input type="hidden" name="view" value="events" />
        <input type="hidden" name="period" value={period} />
        <label className="grid gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Bot name</span>
          <input
            name="bot"
            defaultValue={botFilter}
            placeholder="ClaudeBot"
            className="min-h-8 rounded border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-amber-600/70"
          />
        </label>
        <label className="grid gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Path</span>
          <input
            name="path"
            defaultValue={pathFilter}
            placeholder="/pricing"
            className="min-h-8 rounded border border-neutral-800 bg-neutral-950 px-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-amber-600/70"
          />
        </label>
        <label className="grid gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Project</span>
          <select name="project" defaultValue={projectFilter} className="min-h-8 rounded border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none focus:border-amber-600/70">
            <option value="">All projects</option>
            {allProjects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Limit</span>
          <select name="limit" defaultValue={limit.toString()} className="min-h-8 rounded border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none focus:border-amber-600/70">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
            <option value="500">500</option>
          </select>
        </label>
        <button type="submit" className="min-h-8 self-end rounded border border-amber-700/45 bg-amber-950/20 px-3 text-xs font-medium text-amber-100 hover:bg-amber-900/30">Filter</button>
        {showClear && (
          <Link href={`/dashboard?view=events&period=${encodeURIComponent(period)}`} className="inline-flex min-h-8 items-center self-end text-xs text-neutral-500 hover:text-neutral-200">Clear</Link>
        )}
      </form>

      {clamped && (
        <p className="text-xs italic text-neutral-600">Period clamped to {LONG_RANGE_THRESHOLD_DAYS} days for raw event queries.</p>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Showing {offset + 1}–{offset + displayRows.length}{hasMore ? "+" : ""}</span>
        <div className="flex items-center gap-2">
          {offset > 0 && (
            <Link href={pageHref(Math.max(0, offset - limit))} className="rounded border border-neutral-800 px-2 py-1 hover:bg-neutral-800 hover:text-neutral-200">← Prev</Link>
          )}
          {hasMore && (
            <Link href={pageHref(offset + limit)} className="rounded border border-neutral-800 px-2 py-1 hover:bg-neutral-800 hover:text-neutral-200">Next →</Link>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-neutral-800/90">
        <table className="w-full text-xs">
          <thead className="text-neutral-500">
            <tr className="border-b border-neutral-800">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Bot</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">Path</th>
              <th className="px-3 py-2 text-left font-medium">Method</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-400">{formatDateTime(r.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">{r.project_name}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-neutral-100">
                  <BotName name={r.bot_name} href={botHref({ bot: r.bot_name, project: r.project_name, period })} className="hover:text-white" />
                </td>
                <td className="whitespace-nowrap px-3 py-2"><NormalizedCategoryChip botName={r.bot_name} category={r.bot_category} /></td>
                <td className="max-w-[220px] truncate px-3 py-2 font-mono text-neutral-300">
                  <Link className="hover:text-white" href={eventHref({ project: r.project_name, path: r.path, period })}>{r.path}</Link>
                </td>
                <td className="px-3 py-2 text-neutral-500">{r.method}</td>
                <td className="whitespace-nowrap px-3 py-2"><StatusCodeChip statusCode={r.status_code} /></td>
                <td className="whitespace-nowrap px-3 py-2"><ConfidenceChip confidence={r.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayRows.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">No events found for the given filters.</p>
        )}
      </div>
    </div>
  );
}
