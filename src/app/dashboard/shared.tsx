import type { ReactNode } from "react";
import Link from "next/link";
import { categoryMeta, normalizeBotCategory } from "@/lib/categories";
import { TtlCache } from "@/lib/cache";
import type { DbClient } from "@/lib/db";

// Pure period/date-range helpers live in src/lib/period.ts (dependency-light,
// so they're unit-testable without pulling in next/link or DbClient). Every
// call site in this codebase imports them from this module, so import here
// (this file also uses LONG_RANGE_THRESHOLD_DAYS below) and re-export.
import {
  PERIODS,
  LONG_RANGE_THRESHOLD_DAYS,
  RAW_EVENT_LIMITS,
  roundToInterval,
  addDays,
  getPeriodRange,
  resolvePeriodRange,
  getPeriodDays,
  parsePeriod,
  getRawEventLimit,
  periodLabel,
  periodDescription,
} from "@/lib/period";

export {
  PERIODS,
  LONG_RANGE_THRESHOLD_DAYS,
  RAW_EVENT_LIMITS,
  roundToInterval,
  addDays,
  getPeriodRange,
  resolvePeriodRange,
  getPeriodDays,
  parsePeriod,
  getRawEventLimit,
  periodLabel,
  periodDescription,
};

export const STATS_CACHE_TTL_MS = 30_000;
export const META_CACHE_TTL_MS = 60_000;

// Module-level singletons: persist for the life of the server process (not
// per-request), matching the caching behavior of the pre-redesign page.tsx.
export const statsCache = new TtlCache();
export const metaCache = new TtlCache();

// Renders in whatever timezone the JS runtime is in — the viewer's local
// zone in the browser, or the server's zone during SSR (these components
// mostly render server-side, so there's no client tz to defer to). Either
// way, timeZoneName: "short" makes the value self-describing instead of
// silently mislabeling a non-Berlin viewer's time as their own local time.
export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatRelativeTime(date: Date | null, referenceTime: Date) {
  if (!date) return "Never";
  const seconds = Math.max(0, Math.floor((referenceTime.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// -- Shared metric conventions: the same metric (error rate, verified share)
// must look identical everywhere it appears — same rounding (integer, via
// pct() above) and the same "is this bad/good" color threshold — regardless
// of which tab renders it. --
export function errorRateAccent(errorRatePct: number): string {
  return errorRatePct >= 5 ? "text-orange-300" : "text-neutral-100";
}

export function verifiedAccent(verifiedSharePct: number): string {
  return verifiedSharePct >= 50 ? "text-emerald-300" : "text-neutral-100";
}

export function eventHref(params: {
  project?: string;
  bot?: string;
  path?: string;
  period: string;
}) {
  const query = new URLSearchParams({
    view: "events",
    period: params.period,
  });
  if (params.project) query.set("project", params.project);
  if (params.bot) query.set("bot", params.bot);
  if (params.path) query.set("path", params.path);
  return `/dashboard?${query.toString()}`;
}

export function botHref(params: { bot: string; project?: string; period: string }) {
  const query = new URLSearchParams({
    view: "bots",
    bot: params.bot,
    period: params.period,
  });
  if (params.project) query.set("project", params.project);
  return `/dashboard?${query.toString()}`;
}

export function overviewHref(params: { period: string; project?: string }) {
  const query = new URLSearchParams({ view: "overview", period: params.period });
  if (params.project) query.set("project", params.project);
  return `/dashboard?${query.toString()}`;
}

export function categoryHref(params: { view: string; period: string; project?: string; category?: string }) {
  const query = new URLSearchParams({ view: params.view, period: params.period });
  if (params.project) query.set("project", params.project);
  if (params.category) query.set("category", params.category);
  return `/dashboard?${query.toString()}`;
}

// -- Meta lookups (project list, latest heartbeat/event) shared by the shell
// and by views that need them, backed by the same TtlCache so repeat calls
// within the cache window are free. --
async function fetchMetaCached(db: DbClient, project?: string) {
  const cacheKey = `meta:${project ?? ""}`;
  const cached = metaCache.get<Awaited<ReturnType<DbClient["fetchMeta"]>>>(cacheKey);
  if (cached) return cached;
  const result = await db.fetchMeta(project);
  metaCache.set(cacheKey, result, META_CACHE_TTL_MS);
  return result;
}

export async function getMeta(db: DbClient, project?: string) {
  return fetchMetaCached(db, project);
}

// -- Shared visual primitives --

export function Panel({
  title,
  eyebrow,
  meta,
  children,
}: {
  title: string;
  eyebrow?: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-neutral-800/90 bg-neutral-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-neutral-800/80 px-3 py-2">
        <div>
          {eyebrow ? <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">{eyebrow}</p> : null}
          <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
        </div>
        {meta ? <span className="text-xs text-neutral-500">{meta}</span> : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  detail,
  accent = "text-neutral-100",
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-neutral-800/90 bg-neutral-950 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${accent}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-neutral-500">{detail}</p> : null}
    </div>
  );
}

// Shown in place of panels that only the raw bot_hits table can serve
// (path-level breakdowns, movers, hourly distribution) once a view switches
// to rollup-backed long-range mode (>90 day periods).
export function LongRangeCaption({ label = "Some panels are" }: { label?: string }) {
  return (
    <p className="text-xs italic text-neutral-600">{label} available for ranges up to {LONG_RANGE_THRESHOLD_DAYS} days.</p>
  );
}

export function BarMeter({ value, color = "bg-neutral-500" }: { value: number; color?: string }) {
  // A genuine zero renders no bar at all; the Math.max(3, ...) floor only
  // applies once there's a nonzero (but visually-too-thin) value to show.
  const width = value <= 0 ? 0 : Math.max(3, Math.min(value, 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function CategoryChip({ category }: { category: string }) {
  const style = categoryMeta(category);
  return (
    <span className={`inline-flex min-h-5 items-center gap-1.5 rounded border px-1.5 text-[10px] font-medium ${style.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function NormalizedCategoryChip({ botName, category }: { botName: string; category: string }) {
  return <CategoryChip category={normalizeBotCategory(botName, category)} />;
}

export function ConfidenceChip({ confidence }: { confidence: string }) {
  const verified = confidence === "verified";
  return (
    <span className={`inline-flex min-h-5 items-center rounded border px-1.5 text-[10px] font-medium ${
      verified
        ? "border-emerald-700/50 bg-emerald-950/25 text-emerald-300"
        : "border-amber-800/70 bg-amber-950/30 text-amber-300"
    }`}>
      {verified ? "Verified" : "UA only"}
    </span>
  );
}

export function StatusCodeChip({ statusCode }: { statusCode: number }) {
  const tone =
    statusCode >= 500 ? "border-rose-700/50 bg-rose-950/25 text-rose-300"
      : statusCode >= 400 ? "border-orange-700/50 bg-orange-950/25 text-orange-300"
        : statusCode >= 300 ? "border-sky-700/50 bg-sky-950/25 text-sky-300"
          : statusCode >= 200 ? "border-emerald-700/50 bg-emerald-950/25 text-emerald-300"
            : "border-neutral-700 bg-neutral-900 text-neutral-500";

  return (
    <span className={`inline-flex min-h-5 min-w-11 items-center justify-center rounded border px-1.5 font-mono text-[10px] font-medium tabular-nums ${tone}`}>
      {statusCode > 0 ? statusCode : "-"}
    </span>
  );
}

export function statusClassTone(statusClass: string) {
  const tones: Record<string, string> = {
    "2xx": "bg-emerald-400",
    "3xx": "bg-sky-400",
    "4xx": "bg-orange-400",
    "5xx": "bg-rose-400",
    unknown: "bg-neutral-600",
  };
  return tones[statusClass] ?? "bg-neutral-600";
}

export function statusClassColor(statusClass: string) {
  const colors: Record<string, string> = {
    "2xx": "#34d399",
    "3xx": "#38bdf8",
    "4xx": "#fb923c",
    "5xx": "#fb7185",
    unknown: "#737373",
  };
  return colors[statusClass] ?? "#737373";
}

export function statusClassLabel(statusClass: string) {
  return statusClass === "unknown" ? "not captured" : statusClass;
}

// -- Active filter chips (4.1): a row of removable chips for filters that
// aren't already visible as the active state of another control (project,
// bot). Category is intentionally excluded — the category chip row already
// shows its own active state. --
export function ActiveFilterChips({
  view,
  period,
  project,
  bot,
  category,
}: {
  view: string;
  period: string;
  project?: string;
  bot?: string;
  category?: string;
}) {
  const chips: { label: string; href: string }[] = [];
  if (project) {
    chips.push({ label: `project: ${project}`, href: categoryHref({ view, period, category }) });
  }
  if (bot) {
    const query = new URLSearchParams({ view, period });
    if (project) query.set("project", project);
    if (category) query.set("category", category);
    chips.push({ label: `bot: ${bot}`, href: `/dashboard?${query.toString()}` });
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="inline-flex min-h-6 items-center gap-1 rounded border border-neutral-800 bg-neutral-950 px-2 text-[10px] font-medium text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
        >
          {chip.label} <span className="text-neutral-600">&times;</span>
        </Link>
      ))}
    </div>
  );
}
