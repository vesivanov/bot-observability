import type { BotHitRow } from "@/lib/schema";

export function RequestDetails({ row }: { row: BotHitRow }) {
  const sample = Number(row.sample_rate);
  return <details className="request-detail"><summary>Details</summary><dl>
    <dt>Full path</dt><dd className="font-mono">{row.path}</dd>
    <dt>Host</dt><dd>{row.host || "Not captured"}</dd>
    <dt>Environment</dt><dd>{row.environment || "Not captured"}</dd>
    <dt>Method</dt><dd>{row.method}</dd>
    <dt>User agent</dt><dd>{row.user_agent || "Not captured"}</dd>
    <dt>Identification</dt><dd>{row.confidence === "verified" ? "DNS verified" : "User-agent match; sender not independently verified"}</dd>
    <dt>Sampling</dt><dd>{sample > 0 && sample < 1 ? `${sample * 100}% captured · this record represents approximately ${(1 / sample).toLocaleString()} requests` : "Unsampled · one recorded request"}</dd>
  </dl></details>;
}
