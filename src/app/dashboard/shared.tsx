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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
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
  if (total <= 0 || part <= 0) return 0;
  const percentage = (part / total) * 100;
  return percentage < 0.1 ? Number(percentage.toPrecision(1)) : Math.round(percentage * 10) / 10;
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

// A reporter that stops sending a real status_code degrades silently: the
// ingestion route defaults a missing/invalid value to 0 rather than
// rejecting the hit (see src/app/api/bot-hit/route.ts statusCode()), so a
// broken reporter still shows up as normal traffic everywhere except this
// one ratio. This happened for real on three separate sites at once
// (2026-08-10 through 2026-09-04) and went unnoticed for weeks because nothing
// on this dashboard changed color when "Known status" quietly went to 0% —
// give it the same bad/good threshold treatment as every other health metric.
export function knownStatusAccent(knownStatusPct: number): string {
  if (knownStatusPct < 50) return "text-rose-300";
  if (knownStatusPct < 90) return "text-orange-300";
  return "text-neutral-100";
}

import { dashboardHref, type DashboardQuery } from "@/lib/query-context";
import { requestStatusLabel } from "@/lib/request-status";
export { dashboardHref, readDashboardQuery } from "@/lib/query-context";

export function eventHref(params: DashboardQuery) {
  return dashboardHref({ ...params, view: "events" });
}

export function botHref(params: DashboardQuery & { bot: string }) {
  return dashboardHref({ ...params, view: "bots" });
}

export function overviewHref(params: DashboardQuery) {
  return dashboardHref({ ...params, view: "overview" });
}

export function categoryHref(params: DashboardQuery) {
  return dashboardHref(params);
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
    <section className="data-panel">
      <div className="data-panel-header">
        <div>
          {eyebrow ? <p className="data-panel-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {meta ? <span className="data-panel-meta">{meta}</span> : null}
      </div>
      <div className="data-panel-body">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  detail,
  accent = "text-neutral-100",
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  href?: string;
}) {
  const contents = <>
    <p className="stat-label">{label}</p>
    <p className={`stat-value ${value.length > 14 && /[a-z]/i.test(value) ? "stat-value-text" : ""} ${accent}`}>{value}</p>
    {detail ? <p className="stat-detail">{detail}</p> : null}
  </>;
  if (href) return <Link href={href} className="stat-tile stat-tile-link">{contents}</Link>;
  return (
    <div className="stat-tile">
      {contents}
    </div>
  );
}

// Shown in place of panels that only the raw bot_hits table can serve
// (path-level breakdowns, movers, hourly distribution) once a view switches
// to rollup-backed long-range mode (>90 day periods).
export function LongRangeCaption({ label = "Some panels are" }: { label?: string }) {
  return (
    <p className="text-xs italic text-neutral-600">{label} available only from retained raw requests. Daily aggregates preserve counts, but cannot recreate paths or exact request times.</p>
  );
}

export function BarMeter({ value, color = "bg-neutral-500" }: { value: number; color?: string }) {
  // A genuine zero renders no bar at all; the Math.max(3, ...) floor only
  // applies once there's a nonzero (but visually-too-thin) value to show.
  const width = value <= 0 ? 0 : Math.max(3, Math.min(value, 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
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
    <span title="Verified means successful forward-confirmed reverse DNS for a supported bot. UA only includes unsupported, unchecked or unconfirmed requests." className={`inline-flex min-h-5 items-center rounded border px-1.5 text-xs font-medium ${
      verified
        ? "border-emerald-700/50 bg-emerald-950/25 text-emerald-300"
        : "border-neutral-700 bg-neutral-900 text-neutral-400"
    }`}>
      {verified ? "Verified" : "UA only"}
    </span>
  );
}

export function StatusCodeChip({ statusCode }: { statusCode: number }) {
  const known = statusCode >= 200 && statusCode < 600;
  const tone = !known ? "border-neutral-700 bg-neutral-900 text-neutral-400" :
    statusCode >= 500 ? "border-rose-700/50 bg-rose-950/25 text-rose-300"
      : statusCode >= 400 ? "border-orange-700/50 bg-orange-950/25 text-orange-300"
        : statusCode >= 300 ? "border-sky-700/50 bg-sky-950/25 text-sky-300"
          : statusCode >= 200 ? "border-emerald-700/50 bg-emerald-950/25 text-emerald-300"
            : "border-neutral-700 bg-neutral-900 text-neutral-500";

  return (
    <span className={`inline-flex min-h-5 min-w-11 items-center justify-center rounded border px-1.5 font-mono text-[10px] font-medium tabular-nums ${tone}`}>
      {known ? statusCode : "Unknown"}
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
export function ActiveFilterChips({ hideProject = false, ...context }: DashboardQuery & { hideProject?: boolean }) {
  const chips: { label: string; href: string }[] = [];
  for (const key of ["project", "bot", "path", "prefix", "status"] as const) {
    if (hideProject && key === "project") continue;
    if (context[key]) chips.push({ label: `${key}: ${key === "status" ? requestStatusLabel(context[key]) : context[key]}`, href: dashboardHref(context, { [key]: undefined }) });
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-neutral-800 px-3 text-xs font-medium text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
        >
          {chip.label} <span className="text-neutral-600">&times;</span>
        </Link>
      ))}
    </div>
  );
}
