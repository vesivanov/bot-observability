"use client";

import type { ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartTooltip, activeBarStyle, barCursor, tooltipWrapperStyle } from "@/components/charts/chart-tooltip";
import { categoryMeta } from "@/lib/categories";
import { BotName } from "@/components/bot-name";

interface BotPeriodCount {
  period: string;
  bot_name: string;
  bot_category: string;
  count: number;
}

const OTHER_KEY = "Other";
const OTHER_COLOR = "#525252";
const SERIES_CAP = 6;

// Top N bots by total, with all remaining bots summed into a synthetic
// "Other" series (always last in the stack, neutral gray).
function buildStackedBotSeries(periods: string[], rows: BotPeriodCount[]) {
  const totals = new Map<string, number>();
  const categories = new Map<string, string>();
  for (const row of rows) {
    totals.set(row.bot_name, (totals.get(row.bot_name) ?? 0) + row.count);
    categories.set(row.bot_name, row.bot_category);
  }

  const rankedBots = Array.from(totals.keys()).sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const bots = rankedBots.slice(0, SERIES_CAP);
  const overflow = rankedBots.slice(SERIES_CAP);
  const hasOther = overflow.length > 0;
  const overflowSet = new Set(overflow);

  const byPeriod = new Map(rows.map((row) => [`${row.period}:${row.bot_name}`, row.count]));
  const data = periods.map((period) => {
    const entry: Record<string, string | number> = { period };
    for (const bot of bots) {
      entry[bot] = byPeriod.get(`${period}:${bot}`) ?? 0;
    }
    if (hasOther) {
      let otherTotal = 0;
      for (const bot of overflowSet) {
        otherTotal += byPeriod.get(`${period}:${bot}`) ?? 0;
      }
      entry[OTHER_KEY] = otherTotal;
    }
    return entry;
  });

  const series = hasOther ? [...bots, OTHER_KEY] : bots;
  return { bots, series, otherCount: overflow.length, categories, data };
}

export function StackedBotChart({
  title,
  periods,
  rows,
  granularity,
}: {
  title: string;
  periods: string[];
  rows: BotPeriodCount[];
  granularity: "day" | "week" | "month";
}) {
  const stacked = buildStackedBotSeries(periods, rows);
  return (
    <ChartPanel title={title} meta={`${stacked.bots.length}${stacked.otherCount > 0 ? `+${stacked.otherCount}` : ""} bots · ${periods.length} periods`}>
      {stacked.series.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">No bot activity in this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={granularity === "day" ? 300 : 220}>
          <BarChart data={stacked.data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: "#737373", fontSize: granularity === "week" ? 10 : 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(period: string) => periodLabel(period, granularity)}
              interval={granularity === "day" ? "preserveStartEnd" : 0}
            />
            <YAxis tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              content={<ChartTooltip formatLabel={(label) => periodLabel(String(label), granularity)} />}
              cursor={barCursor}
              isAnimationActive={false}
              wrapperStyle={tooltipWrapperStyle}
            />
            {stacked.series.map((bot) => {
              const isOther = bot === OTHER_KEY;
              const meta = isOther ? null : categoryMeta(stacked.categories.get(bot) ?? "unknown");
              return (
                <Bar
                  key={bot}
                  dataKey={bot}
                  stackId="bots"
                  fill={isOther ? OTHER_COLOR : meta!.color}
                  fillOpacity={isOther ? 0.55 : 0.82}
                  maxBarSize={42}
                  activeBar={activeBarStyle}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      )}
      {stacked.series.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          {stacked.bots.map((bot) => {
            const meta = categoryMeta(stacked.categories.get(bot) ?? "unknown");
            return (
              <span key={bot} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                <BotName name={bot} className="text-neutral-500" />
              </span>
            );
          })}
          {stacked.otherCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OTHER_COLOR }} />
              Other ({stacked.otherCount})
            </span>
          )}
        </div>
      ) : null}
    </ChartPanel>
  );
}

function periodLabel(period: string, granularity: "day" | "week" | "month") {
  const date = new Date(period + "T00:00:00");
  if (granularity === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function ChartPanel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="rounded border border-neutral-800/90 bg-neutral-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-neutral-800/80 px-3 py-2">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        {meta ? <span className="text-xs text-neutral-500">{meta}</span> : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
