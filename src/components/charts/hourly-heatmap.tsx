"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartTooltip, activeBarStyle, barCursor, tooltipWrapperStyle } from "@/components/charts/chart-tooltip";

interface HourlyCount {
  hour: number;
  count: number;
}

const HOUR_LABELS = [
  "12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a",
  "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p",
];

export function HourlyHeatmap({ data }: { data: HourlyCount[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const fullData = Array.from({ length: 24 }, (_, i) => {
    const existing = data.find((d) => d.hour === i);
    return { hour: i, count: existing?.count ?? 0 };
  });

  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-neutral-500 text-sm">No data</div>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={fullData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            tick={{ fill: "#737373", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(h: number) => HOUR_LABELS[h]}
            interval={2}
          />
          <YAxis hide />
          <Tooltip
            content={<ChartTooltip valueLabel="Hits" formatLabel={(h) => HOUR_LABELS[Number(h)] ?? h} />}
            cursor={barCursor}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={24} activeBar={activeBarStyle}>
            {fullData.map((entry, i) => {
              const intensity = maxCount > 0 ? entry.count / maxCount : 0;
              const opacity = 0.22 + intensity * 0.68;
              return (
                <Cell
                  key={i}
                  fill="#fbbf24"
                  fillOpacity={opacity}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-1 mt-1">
        <span className="text-[10px] text-neutral-600">Low</span>
        <div className="flex gap-px">
          {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div
              key={v}
              className="h-2 w-4"
              style={{ backgroundColor: "#fbbf24", opacity: 0.22 + v * 0.68 }}
            />
          ))}
        </div>
        <span className="text-[10px] text-neutral-600">High</span>
      </div>
    </div>
  );
}
