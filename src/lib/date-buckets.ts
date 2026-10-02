// Server-safe date-bucketing helpers shared between server view components
// and client chart components. Kept out of any "use client" module so server
// components can call them directly.

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Builds the list of UTC calendar-day keys the query layer buckets on. Every
// step here must stay in UTC (Date.UTC / getUTC*) rather than local-time
// setters (setHours/setDate) — on a Node process running behind UTC (e.g.
// America/*), a local-time midnight is still "yesterday" in UTC, which used
// to silently drop the most recent day from per-bot charts.
export function fillDatePeriods(startOrDays: Date | number, end: Date): string[] {
  const start = typeof startOrDays === "number" ? new Date(end.getTime() - startOrDays * 86_400_000) : startOrDays;
  if (start >= end) return [];
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastIncluded = new Date(end.getTime() - 1);
  const last = Date.UTC(lastIncluded.getUTCFullYear(), lastIncluded.getUTCMonth(), lastIncluded.getUTCDate());
  return Array.from({ length: (last - first) / 86_400_000 + 1 }, (_, index) => dateKey(new Date(first + index * 86_400_000)));
}
