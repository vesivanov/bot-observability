"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartTooltip, axisCursor, tooltipWrapperStyle, chartAxisTick, formatChartCount } from "./chart-tooltip";
import type { DailyCount } from "@/lib/schema";

export function HourlyTrendChart({ data, from, to }: { data: DailyCount[]; from: Date; to: Date }) {
  const counts = new Map(data.map((row) => [row.date, row.count]));
  const series = [];
  for (let timestamp = Math.floor(from.getTime() / 3_600_000) * 3_600_000; timestamp < to.getTime(); timestamp += 3_600_000) {
    const date = new Date(timestamp).toISOString().replace(".000Z", "Z");
    series.push({ date, count: counts.get(date) ?? 0 });
  }
  return <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
      <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
      <XAxis dataKey="date" tick={chartAxisTick} minTickGap={32} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={(s) => new Date(s).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} />
      <YAxis tick={chartAxisTick} tickFormatter={formatChartCount} axisLine={false} tickLine={false} width={48} />
      <Tooltip content={<ChartTooltip valueLabel="Requests" formatLabel={(s) => `${String(s).replace("T", " ")} UTC`} />} cursor={axisCursor} wrapperStyle={tooltipWrapperStyle} isAnimationActive={false} />
      <Area dataKey="count" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer>;
}
