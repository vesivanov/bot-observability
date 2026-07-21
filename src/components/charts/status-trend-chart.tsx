"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartTooltip, axisCursor, tooltipWrapperStyle } from "@/components/charts/chart-tooltip";
import { statusClassColor, statusClassLabel } from "@/app/dashboard/shared";

interface DailyStatusCount {
  date: string;
  status_class: string;
  count: number;
}

const CLASSES = ["2xx", "3xx", "4xx", "5xx", "unknown"];

function formatDateLabel(label: string | number | undefined) {
  const date = new Date(String(label) + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function StatusTrendChart({ data }: { data: DailyStatusCount[] }) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-neutral-500">No status data</div>;
  }

  const dates = Array.from(new Set(data.map((row) => row.date))).sort();
  const byDateClass = new Map(data.map((row) => [`${row.date}:${row.status_class}`, row.count]));
  const series = dates.map((date) => {
    const entry: Record<string, string | number> = { date };
    for (const cls of CLASSES) {
      entry[cls] = byDateClass.get(`${date}:${cls}`) ?? 0;
    }
    return entry;
  });
  const presentClasses = CLASSES.filter((cls) => data.some((row) => row.status_class === cls && row.count > 0));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d) => {
            const date = new Date(d + "T00:00:00");
            return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          content={<ChartTooltip formatLabel={formatDateLabel} />}
          cursor={axisCursor}
          isAnimationActive={false}
          wrapperStyle={tooltipWrapperStyle}
        />
        {presentClasses.map((cls) => (
          <Area
            key={cls}
            type="monotone"
            dataKey={cls}
            name={statusClassLabel(cls)}
            stackId="status"
            stroke={statusClassColor(cls)}
            strokeWidth={1.5}
            fill={statusClassColor(cls)}
            fillOpacity={0.32}
            dot={false}
            activeDot={{ r: 3, stroke: "#120f08", strokeWidth: 1 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
