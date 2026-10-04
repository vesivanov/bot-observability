import Link from "next/link";
import { botCompany } from "@/lib/bot-companies";
import { normalizeBotCategory } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import { Panel, BarMeter, botHref, eventHref } from "@/app/dashboard/shared";
import type { BotConfidenceCount, Mover } from "@/lib/schema";

export function AiRequestComparison({ data }: { data: BotConfidenceCount[] }) {
  const perCompany = new Map<string, { crawls: number; fetches: number }>();
  for (const row of data) {
    const category = normalizeBotCategory(row.bot_name, row.bot_category);
    const company = botCompany(row.bot_name);
    const entry = perCompany.get(company) ?? { crawls: 0, fetches: 0 };
    if (category === "ai_agent") {
      entry.fetches += row.total_hits;
    } else if (category === "ai_training" || category === "ai_search") {
      entry.crawls += row.total_hits;
    }
    perCompany.set(company, entry);
  }

  const rows = Array.from(perCompany.entries())
    .map(([company, v]) => ({ company, ...v }))
    .filter((r) => r.crawls > 0 || r.fetches > 0)
    .sort((a, b) => b.crawls - a.crawls);

  if (rows.length === 0) return null;
  const maxCrawls = Math.max(...rows.flatMap((r) => [r.crawls, r.fetches]), 1);

  return (
    <Panel
      title="AI crawls and user-triggered fetches"
      meta={`${rows.length} ${rows.length === 1 ? "company" : "companies"}`}
    >
      <p className="mb-3 text-xs leading-5 text-neutral-500">
        <span className="text-amber-300">Crawls</span> are bulk fetches for
        training and indexing.{" "}
        <span className="text-emerald-300">User-triggered AI fetches</span> are
        requests associated with an assistant interaction. They are not people,
        sessions or confirmed referrals. The ratio divides training/search
        crawler requests by these fetch requests.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.company}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="font-medium text-neutral-200">{r.company}</span>
              <span className="font-mono text-neutral-500">
                {r.crawls.toLocaleString()} crawls ·{" "}
                {r.fetches.toLocaleString()} user-triggered fetches ·{" "}
                {r.fetches > 0 ? `${(r.crawls / r.fetches).toFixed(1)}:1` : "—"}
              </span>
            </div>
            <div className="space-y-1">
              <div title="Crawls — bulk fetches by training/indexing bots (e.g. GPTBot, ClaudeBot, PerplexityBot)">
                <BarMeter
                  value={(r.crawls / maxCrawls) * 100}
                  color="bg-amber-400"
                />
              </div>
              <div title="User-triggered AI fetches — on-demand requests in an AI chat (e.g. ChatGPT-User, Claude-User, Perplexity-User)">
                <BarMeter
                  value={r.fetches > 0 ? (r.fetches / maxCrawls) * 100 : 0}
                  color="bg-emerald-400"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// Below this, a delta like 1→2 is indistinguishable from noise and isn't
// worth ranking alongside a real mover like 500→800.
const MOVER_NOISE_FLOOR = 10;

export function MoverList({
  title,
  items,
  period,
  kind,
  project,
  category,
}: {
  title: string;
  items: Mover[];
  period: string;
  kind: "bot" | "page" | "project";
  project?: string;
  category?: string;
}) {
  const filteredItems = items.filter(
    (item) =>
      Math.max(item.current_count, item.previous_count) >= MOVER_NOISE_FLOOR,
  );
  return (
    <div className="rounded-lg border border-neutral-800/90 bg-neutral-950 p-4">
      <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">
        {title}
      </h4>
      {filteredItems.length === 0 ? (
        <p className="text-xs text-neutral-400">
          No material changes versus the previous period.
        </p>
      ) : (
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const href =
              kind === "bot"
                ? botHref({
                    bot: item.key,
                    project: project ?? item.project,
                    category,
                    period,
                  })
                : kind === "page"
                  ? eventHref({
                      path: item.key,
                      project: project ?? item.project,
                      category,
                      period,
                    })
                  : eventHref({ project: item.key, category, period });
            const currentCount = item.current_count;
            const barWidth = Math.min(
              (Math.abs(item.delta) /
                Math.max(currentCount, item.previous_count, 1)) *
                100,
              100,
            );
            // % change vs the previous period's count — makes the "+N" bar
            // comparable across rows regardless of each row's raw scale.
            const pctChange =
              item.previous_count > 0
                ? (item.delta / item.previous_count) * 100
                : null;
            return (
              <Link
                key={`${item.project}:${item.key}`}
                href={href}
                className="block hover:bg-neutral-900/70 rounded p-1.5 -mx-1.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-200">
                      {kind === "bot" ? (
                        <BotName
                          name={item.label}
                          className="font-medium text-neutral-200"
                        />
                      ) : (
                        item.label
                      )}
                    </span>
                    {kind !== "project" && (
                      <span className="block text-xs text-neutral-500">
                        {item.project}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-neutral-300 whitespace-nowrap text-xs">
                    {item.previous_count.toLocaleString()} →{" "}
                    {item.current_count.toLocaleString()}
                    <span className="ml-1 text-neutral-500">
                      {pctChange !== null
                        ? `(${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(0)}%)`
                        : "(new)"}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
