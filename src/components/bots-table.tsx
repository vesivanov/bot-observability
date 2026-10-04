"use client";

import {
  dashboardHref,
  botHref,
  eventHref,
  formatDateTime,
  pct,
} from "@/app/dashboard/shared";
import { useState } from "react";
import Link from "next/link";
import { FilterSelect } from "./filter-select";
import { normalizeBotCategory, categoryShortLabel } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/sortable-table";
import type { BotDetail, BotRequestOutcomes } from "@/lib/schema";

// Client component: SortableTable's columns carry render closures, which
// can't cross the server/client boundary as props — so this must be a
// client component that builds its own column definitions locally.
export function BotsTable({
  bots,
  outcomes = [],
  period,
  projectFilter,
  categoryFilter,
  statusFilter,
  pathFilter,
  prefixFilter,  aggregate = false,
}: {
  bots: BotDetail[];
  outcomes?: BotRequestOutcomes[];
  period: string;
  projectFilter?: string;
  categoryFilter?: string;
  statusFilter?: string;
  pathFilter?: string;
  prefixFilter?: string;
  aggregate?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState("");
  const metrics = new Map(outcomes.map((row) => [row.bot_name, row]));
  const visibleBots = bots.filter((bot) => {
    if (!bot.bot_name.toLowerCase().includes(search.toLowerCase()))
      return false;
    const row = metrics.get(bot.bot_name);
    return (
      !focus ||
      (!!row &&
        (focus === "redirects"
          ? row.redirect_hits > 0
          : focus === "errors"
            ? row.error_hits > 0
            : row.known_status_hits < row.total_hits))
    );
  });
  const scope = {
    period,
    project: projectFilter,
    category: categoryFilter,
    status: statusFilter,
    path: pathFilter,
    prefix: prefixFilter,
  };

  const columns: SortableColumn<BotDetail>[] = [
    {
      key: "bot",
      label: "Bot",
      sortable: true,
      sortAccessor: (b) => b.bot_name.toLowerCase(),
      render: (b) => (
        <div className="bot-name-cell"><BotName
          name={b.bot_name}
          href={botHref({ ...scope, bot: b.bot_name })}
        /><small>{categoryShortLabel(normalizeBotCategory(b.bot_name, b.bot_category))}</small></div>
      ),
    },
    {
      key: "hits",
      label: "Requests",
      align: "right",
      sortable: true,
      sortAccessor: (b) => b.total_hits,
      render: (b) => (
        <Link
          className="inline-evidence-link font-mono"
          href={eventHref({ ...scope, bot: b.bot_name })}
        >
          {b.total_hits.toLocaleString()}
        </Link>
      ),
    },
    {
      key: "lastSeen",
      label: aggregate ? "Last UTC day" : "Last request",
      align: "right",
      sortable: true,
      sortAccessor: (b) => new Date(b.last_seen).getTime(),
      render: (b) => (
        <span className="text-xs text-neutral-500">
          {aggregate ? b.last_seen.slice(0, 10) : formatDateTime(b.last_seen)}
        </span>
      ),
    },
  ];

  if (!aggregate)
    columns.splice(
      2,
      0,
      {
        key: "pages",
        label: "Pages",
        align: "right",
        sortable: true,
        sortAccessor: (b) => metrics.get(b.bot_name)?.unique_pages ?? 0,
        render: (b) => (
          <Link
            className="inline-evidence-link font-mono"
            href={dashboardHref({ ...scope, view: "pages", bot: b.bot_name })}
          >
            {metrics.get(b.bot_name)?.unique_pages.toLocaleString() ?? "—"}
          </Link>
        ),
      },
      ...(
        [
          {
            key: "redirects",
            label: "Redirects",
            field: "redirect_hits",
            status: "3xx",
          },
          {
            key: "errors",
            label: "Errors",
            field: "error_hits",
            status: "errors",
          },
        ] as const
      ).map((option) => ({
        key: option.key,
        label: option.label,
        align: "right" as const,
        sortable: true,
        sortAccessor: (b: BotDetail) =>
          metrics.get(b.bot_name)?.[option.field] ?? 0,
        render: (b: BotDetail) => {
          const count = metrics.get(b.bot_name)?.[option.field] ?? 0;
          return count ? (
            <Link
              className="inline-evidence-link font-mono"
              href={dashboardHref({
                ...scope,
                view: "pages",
                bot: b.bot_name,
                status: statusFilter ?? option.status,
              })}
            >
              {count.toLocaleString()}{" "}
              <span className="text-neutral-500">
                {pct(count, metrics.get(b.bot_name)?.known_status_hits ?? 0)}%
              </span>
            </Link>
          ) : (
            <span className="text-neutral-500">—</span>
          );
        },
      })),
    );

  return (
    <div className="space-y-3">
      <div className="bot-table-tools">
        <label className="filter-field">
          <span className="field-label">Find a bot</span>
          <input
            type="search"
            className="filter-control"
            placeholder="Search bot identities"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!aggregate && (
          <FilterSelect
            label="Filter this table"
            value={focus}
            onChange={setFocus}
            options={[
              { value: "", label: "All bots" },
              { value: "redirects", label: "With redirects" },
              { value: "errors", label: "With errors" },
              { value: "unknown", label: "Uncaptured outcomes" },
            ]}
          />
        )}
        {(search || focus) && <span>
          {visibleBots.length} of {bots.length} bot identities in this table
        </span>}
      </div>
      <SortableTable
        columns={columns}
        rows={visibleBots}
        rowKey={(b) =>
          `${b.bot_name}:${normalizeBotCategory(b.bot_name, b.bot_category)}`
        }
        defaultSortKey="hits"
      />
      {!visibleBots.length && (
        <p className="evidence-caption">No bots match this search and focus.</p>
      )}
      {!aggregate && (
        <p className="evidence-caption">
          Redirect and error percentages use requests with a captured outcome.
        </p>
      )}
    </div>
  );
}
