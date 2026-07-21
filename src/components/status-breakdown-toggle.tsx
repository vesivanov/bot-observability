"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusCodeChip, botHref, eventHref } from "@/app/dashboard/shared";
import { BotName } from "@/components/bot-name";
import type { ProjectStatusBreakdown, BotStatusCodeCount, PageStatusCodeCount } from "@/lib/schema";

type Mode = "project" | "bot" | "page";

export function StatusBreakdownToggle({
  projectStatuses,
  botStatusCodes,
  pageStatusCodes,
  period,
  projectFilter,
}: {
  projectStatuses: ProjectStatusBreakdown[];
  botStatusCodes: BotStatusCodeCount[];
  pageStatusCodes: PageStatusCodeCount[];
  period: string;
  projectFilter?: string;
}) {
  const [mode, setMode] = useState<Mode>("project");
  const linkToBotHref = (botName: string) => botHref({ bot: botName, project: projectFilter, period });
  const linkToEventHref = (params: { project?: string; path?: string }) => eventHref({ ...params, period });

  return (
    <div>
      <div className="mb-3 inline-flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
        {([
          { key: "project" as const, label: "By project" },
          { key: "bot" as const, label: "By bot" },
          { key: "page" as const, label: "By page" },
        ]).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            className={`min-h-7 rounded-sm px-3 text-xs font-medium transition-colors ${
              mode === option.key
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            aria-pressed={mode === option.key}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "project" && (
        projectStatuses.length === 0 ? (
          <p className="text-sm text-neutral-500">No captured project/status rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Project</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Hits</th>
                  <th className="px-2 py-2 text-left font-medium">Top path</th>
                </tr>
              </thead>
              <tbody>
                {projectStatuses.map((row) => (
                  <tr key={`${row.project}:${row.status_code}`} className="border-t border-neutral-800 hover:bg-neutral-900">
                    <td className="whitespace-nowrap px-2 py-2 text-neutral-300">{row.project || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-2"><StatusCodeChip statusCode={row.status_code} /></td>
                    <td className="px-2 py-2 text-right font-mono text-neutral-100">{row.count.toLocaleString()}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 font-mono text-neutral-400">
                      {row.top_path ? <Link className="hover:text-white" href={linkToEventHref({ project: row.project, path: row.top_path })}>{row.top_path}</Link> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {mode === "bot" && (
        botStatusCodes.length === 0 ? (
          <p className="text-sm text-neutral-500">No captured bot/status rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Bot</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Hits</th>
                  <th className="px-2 py-2 text-left font-medium">Top path</th>
                </tr>
              </thead>
              <tbody>
                {botStatusCodes.map((row) => (
                  <tr key={`${row.bot_name}:${row.bot_category}:${row.status_code}`} className="border-t border-neutral-800 hover:bg-neutral-900">
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-neutral-100">
                      <BotName name={row.bot_name} href={linkToBotHref(row.bot_name)} className="hover:text-white" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2"><StatusCodeChip statusCode={row.status_code} /></td>
                    <td className="px-2 py-2 text-right font-mono text-neutral-100">{row.count.toLocaleString()}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 font-mono text-neutral-400">{row.top_path || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {mode === "page" && (
        pageStatusCodes.length === 0 ? (
          <p className="text-sm text-neutral-500">No captured page/status rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Path</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Hits</th>
                  <th className="px-2 py-2 text-left font-medium">Top bot</th>
                </tr>
              </thead>
              <tbody>
                {pageStatusCodes.map((row) => (
                  <tr key={`${row.project}:${row.path}:${row.status_code}`} className="border-t border-neutral-800 hover:bg-neutral-900">
                    <td className="max-w-[210px] truncate px-2 py-2 font-mono text-neutral-300">
                      <Link className="hover:text-white" href={linkToEventHref({ project: row.project, path: row.path })}>{row.path || "-"}</Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2"><StatusCodeChip statusCode={row.status_code} /></td>
                    <td className="px-2 py-2 text-right font-mono text-neutral-100">{row.count.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-neutral-400">{row.top_bot ? <BotName name={row.top_bot} className="text-neutral-400" /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
