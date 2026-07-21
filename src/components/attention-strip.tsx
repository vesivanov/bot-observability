import Link from "next/link";
import { buildAttentionFindings, type PeriodStats } from "@/lib/attention-findings";

export { buildAttentionFindings } from "@/lib/attention-findings";
export type { PeriodStats, Finding } from "@/lib/attention-findings";

export function AttentionStrip({
  current,
  previous,
  trendPercent,
  period,
  project,
}: {
  current: PeriodStats;
  previous: PeriodStats | null;
  trendPercent: number | null;
  period: string;
  project?: string;
}) {
  const findings = buildAttentionFindings({ current, previous, trendPercent, period, project });
  if (findings.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {findings.map((finding) => (
        <Link
          key={finding.key}
          href={finding.href}
          className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
            finding.tone === "rose"
              ? "border-rose-800/40 bg-rose-950/15 text-rose-200 hover:bg-rose-950/25"
              : "border-amber-700/40 bg-amber-950/15 text-amber-200 hover:bg-amber-950/25"
          }`}
        >
          {finding.text}
        </Link>
      ))}
    </div>
  );
}
