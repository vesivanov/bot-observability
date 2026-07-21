// Dimension-matched loading fallbacks. Server-safe (no client hooks needed) —
// rendered synchronously while the real Suspense-boundary content streams in.

import type { CSSProperties } from "react";

function Block({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded bg-neutral-900 ${className}`} style={style} />;
}

export function KpiRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <Block key={i} className="h-[76px] border border-neutral-800/90" />
      ))}
    </div>
  );
}

export function ChartPanelSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="rounded border border-neutral-800/90 bg-neutral-950 p-3">
      <Block className="mb-3 h-4 w-32" />
      <Block style={{ height }} className="w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded border border-neutral-800/90 bg-neutral-950">
      <Block className="h-10 w-full rounded-none border-b border-neutral-800/80" />
      <div className="divide-y divide-neutral-900">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-10 items-center px-3">
            <Block className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <KpiRowSkeleton />
      <ChartPanelSkeleton height={260} />
      <ChartPanelSkeleton height={200} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableSkeleton rows={8} />
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}

export function BotsSkeleton() {
  return (
    <div className="space-y-4">
      <ChartPanelSkeleton height={260} />
      <TableSkeleton rows={12} />
    </div>
  );
}

export function HealthSkeleton() {
  return (
    <div className="space-y-4">
      <KpiRowSkeleton />
      <ChartPanelSkeleton height={220} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableSkeleton rows={6} />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}

export function EventsSkeleton() {
  return (
    <div className="space-y-4">
      <Block className="h-24 w-full border border-neutral-800/90" />
      <TableSkeleton rows={12} />
    </div>
  );
}

export function ViewSkeleton({ view }: { view: string }) {
  if (view === "bots") return <BotsSkeleton />;
  if (view === "health") return <HealthSkeleton />;
  if (view === "events") return <EventsSkeleton />;
  return <OverviewSkeleton />;
}
