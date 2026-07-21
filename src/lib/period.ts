// Pure period/date-range helpers extracted out of src/app/dashboard/shared.tsx
// so they can be unit tested without pulling in next/link or the DbClient
// type chain (see src/app/dashboard/shared.tsx, which re-exports everything
// here — no call sites elsewhere need to change).

export const PERIODS = [
  { value: "1", label: "24h" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1y" },
];

// Long-range mode kicks in once a period spans more than this many days —
// views switch from raw bot_hits scans to the bot_hits_daily rollup and hide
// path-level panels that the rollup grain can't serve (see Phase 4 plan).
export const LONG_RANGE_THRESHOLD_DAYS = 90;

// Custom "YYYY-MM-DD_YYYY-MM-DD" period values are capped at this span.
const MAX_CUSTOM_SPAN_DAYS = 400;

const PRESET_DAYS = new Set(PERIODS.map((p) => parseInt(p.value, 10)));

export const RAW_EVENT_LIMITS = new Set([25, 50, 100, 250, 500]);

export function roundToInterval(date: Date, intervalMs: number): Date {
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function getPeriodRange(periodDays: number, now = new Date()) {
  const end = new Date(now);
  const start = addDays(end, -periodDays);
  return { start, end };
}

// Resolves a raw `period` URL value to a concrete query range. Presets keep
// the rolling-window semantics views have always used (start/end derived
// from a cache-friendly rounded `now`); custom ranges use parsePeriod's
// fixed start/end directly, unaffected by `now`.
export function resolvePeriodRange(period: string | string[] | undefined, now: Date) {
  const parsed = parsePeriod(period);
  if (parsed.preset) {
    const { start, end } = getPeriodRange(parsed.days, now);
    return { periodDays: parsed.days, start, end, preset: true, raw: parsed.raw };
  }
  return { periodDays: parsed.days, start: parsed.start, end: parsed.end, preset: false, raw: parsed.raw };
}

export function getPeriodDays(value: string | string[] | undefined): number {
  return parsePeriod(value).days;
}

// Overloads the `period` URL param: either a preset ("7") or a custom range
// "YYYY-MM-DD_YYYY-MM-DD". Presets keep today's rolling-window semantics —
// callers should recompute start/end from `days` via getPeriodRange (using a
// rounded "now") rather than trust `start`/`end` here, which are only
// authoritative for custom ranges. Anything invalid falls back to the 7d
// preset.
export function parsePeriod(value: string | string[] | undefined): {
  raw: string;
  days: number;
  start: Date;
  end: Date;
  preset: boolean;
} {
  const raw = (Array.isArray(value) ? value[0] : value) ?? "";
  const asPresetDays = parseInt(raw, 10);
  if (raw !== "" && String(asPresetDays) === raw && PRESET_DAYS.has(asPresetDays)) {
    const { start, end } = getPeriodRange(asPresetDays);
    return { raw, days: asPresetDays, start, end, preset: true };
  }

  const customMatch = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (customMatch) {
    const [, startStr, endStr] = customMatch;
    const start = new Date(`${startStr}T00:00:00.000Z`);
    const end = new Date(`${endStr}T23:59:59.999Z`);
    const spanDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start.getTime() < end.getTime() && spanDays <= MAX_CUSTOM_SPAN_DAYS) {
      return { raw, days: Math.round(spanDays), start, end, preset: false };
    }
  }

  const { start, end } = getPeriodRange(7);
  return { raw: "7", days: 7, start, end, preset: true };
}

export function getRawEventLimit(value: string | string[] | undefined): number {
  const parsed = parseInt(Array.isArray(value) ? value[0] ?? "" : value ?? "50", 10);
  return RAW_EVENT_LIMITS.has(parsed) ? parsed : 50;
}

export function periodLabel(periodDays: number) {
  return periodDays === 1 ? "24h" : `${periodDays}d`;
}

export function periodDescription(periodDays: number) {
  return periodDays === 1 ? "Last 24 hours" : `Last ${periodDays} days`;
}
