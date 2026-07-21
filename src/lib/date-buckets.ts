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
export function fillDatePeriods(periodDays: number, referenceTime: Date): string[] {
  const endUtcMidnight = Date.UTC(
    referenceTime.getUTCFullYear(),
    referenceTime.getUTCMonth(),
    referenceTime.getUTCDate()
  );
  const startUtcMidnight = endUtcMidnight - Math.max(periodDays - 1, 0) * 86_400_000;

  return Array.from({ length: periodDays }, (_, index) => {
    return dateKey(new Date(startUtcMidnight + index * 86_400_000));
  });
}
