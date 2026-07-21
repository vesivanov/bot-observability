"use client";

import type { ReactNode } from "react";
import type { TooltipContentProps, TooltipPayloadEntry, TooltipValueType } from "recharts";

export const tooltipWrapperStyle = {
  outline: "none",
  pointerEvents: "none",
  zIndex: 20,
} as const;

export const axisCursor = {
  stroke: "rgba(245, 245, 245, 0.26)",
  strokeWidth: 1,
} as const;

export const barCursor = {
  fill: "rgba(255, 255, 255, 0.055)",
} as const;

export const activeBarStyle = {
  fillOpacity: 1,
  stroke: "rgba(255, 255, 255, 0.38)",
  strokeWidth: 1,
} as const;

interface ChartTooltipProps
  extends Omit<Partial<TooltipContentProps<TooltipValueType, string | number>>, "labelFormatter"> {
  formatLabel?: (label: string | number | undefined, payload: TooltipPayloadEntry[]) => ReactNode;
  valueLabel?: string;
}

export function ChartTooltip({ active, label, payload, formatLabel, valueLabel }: ChartTooltipProps) {
  const visiblePayload =
    payload?.filter((item) => item.value !== null && item.value !== undefined && Number(item.value) !== 0) ?? [];

  if (!active || visiblePayload.length === 0) {
    return null;
  }

  return (
    <div className="min-w-36 rounded border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-1.5 font-medium text-neutral-300">
        {formatLabel ? formatLabel(label, visiblePayload) : label}
      </div>
      <div className="space-y-1">
        {visiblePayload.map((item, index) => (
          <div key={`${String(item.name)}-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-neutral-400">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color ?? "#a3a3a3" }} />
              <span className="truncate">{valueLabel ?? item.name}</span>
            </span>
            <span className="font-mono tabular-nums text-neutral-100">{Number(item.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
