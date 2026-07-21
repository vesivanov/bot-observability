"use client";

import { BarMeter, botHref, formatDateTime } from "@/app/dashboard/shared";
import { normalizeBotCategory, categoryShortLabel } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import type { BotDetail } from "@/lib/schema";

// Client component: SortableTable's columns carry render closures, which
// can't cross the server/client boundary as props — so this must be a
// client component that builds its own column definitions locally.
export function BotsTable({ bots, period, projectFilter }: { bots: BotDetail[]; period: string; projectFilter?: string }) {
  const totalHits = bots.reduce((sum, bot) => sum + bot.total_hits, 0);
  const maxHits = Math.max(...bots.map((bot) => bot.total_hits), 1);

  const columns: SortableColumn<BotDetail>[] = [
    {
      key: "bot",
      label: "Bot",
      sortable: true,
      sortAccessor: (b) => b.bot_name.toLowerCase(),
      render: (b) => (
        <BotName name={b.bot_name} href={botHref({ bot: b.bot_name, project: projectFilter, period })} />
      ),
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      sortAccessor: (b) => categoryShortLabel(normalizeBotCategory(b.bot_name, b.bot_category)),
      render: (b) => <span className="text-xs text-neutral-400">{categoryShortLabel(normalizeBotCategory(b.bot_name, b.bot_category))}</span>,
    },
    {
      key: "hits",
      label: "Hits",
      align: "right",
      sortable: true,
      sortAccessor: (b) => b.total_hits,
      render: (b) => <span className="font-mono">{b.total_hits.toLocaleString()}</span>,
    },
    {
      key: "share",
      label: "Share",
      align: "right",
      sortable: true,
      sortAccessor: (b) => b.total_hits,
      render: (b) => (
        <div className="flex items-center justify-end gap-2">
          <div className="w-16"><BarMeter value={(b.total_hits / maxHits) * 100} /></div>
          <span className="font-mono text-xs text-neutral-500">{totalHits > 0 ? Math.round((b.total_hits / totalHits) * 100) : 0}%</span>
        </div>
      ),
    },
    {
      key: "verified",
      label: "Verified %",
      align: "right",
      sortable: true,
      sortAccessor: (b) => (b.total_hits > 0 ? b.verified_hits / b.total_hits : 0),
      render: (b) => (
        <span className={`font-mono text-xs ${b.total_hits > 0 && b.verified_hits / b.total_hits >= 0.5 ? "text-emerald-300" : "text-neutral-500"}`}>
          {b.total_hits > 0 ? Math.round((b.verified_hits / b.total_hits) * 100) : 0}%
        </span>
      ),
    },
    {
      key: "lastSeen",
      label: "Last seen",
      align: "right",
      sortable: true,
      sortAccessor: (b) => new Date(b.last_seen).getTime(),
      render: (b) => <span className="text-xs text-neutral-500">{formatDateTime(b.last_seen)}</span>,
    },
  ];

  return (
    <SortableTable
      columns={columns}
      rows={bots}
      rowKey={(b) => `${b.bot_name}:${b.bot_category}`}
      defaultSortKey="hits"
    />
  );
}
