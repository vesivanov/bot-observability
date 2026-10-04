"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusCodeChip, botHref, eventHref } from "@/app/dashboard/shared";
import { BotName } from "@/components/bot-name";
import type {
  ProjectStatusBreakdown,
  BotStatusCodeCount,
  PageStatusCodeCount,
} from "@/lib/schema";

type Mode = "project" | "bot" | "page";

export function StatusBreakdownToggle({
  projectStatuses,
  botStatusCodes,
  pageStatusCodes,
  period,
  projectFilter,
  categoryFilter,
  botFilter,
}: {
  projectStatuses: ProjectStatusBreakdown[];
  botStatusCodes: BotStatusCodeCount[];
  pageStatusCodes: PageStatusCodeCount[];
  period: string;
  projectFilter?: string;
  categoryFilter?: string;
  botFilter?: string;
}) {
  const [mode, setMode] = useState<Mode>("project");
  const linkToBotHref = (botName: string) =>
    botHref({
      bot: botName,
      project: projectFilter,
      category: categoryFilter,
      period,
    });
  const linkToEventHref = (params: {
    project?: string;
    path?: string;
    status?: string;
    bot?: string;
  }) =>
    eventHref({
      project: projectFilter,
      bot: botFilter,
      ...params,
      category: categoryFilter,
      period,
    });

  return (
    <div>
      <div className="chart-segments mb-4">
        {[
          { key: "project" as const, label: "By project" },
          { key: "bot" as const, label: "By bot" },
          { key: "page" as const, label: "By page" },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            aria-pressed={mode === option.key}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "project" &&
        (projectStatuses.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No captured project/status rows yet.
          </p>
        ) : (
          <div className="responsive-data-table">
            <table className="data-table w-full">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Project</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Requests</th>
                  <th className="px-2 py-2 text-left font-medium">Top path</th>
                </tr>
              </thead>
              <tbody>
                {projectStatuses.map((row) => (
                  <tr
                    key={`${row.project}:${row.status_code}`}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    <td
                      data-label="Project"
                      className="whitespace-nowrap px-2 py-2 text-neutral-300"
                    >
                      {row.project || "-"}
                    </td>
                    <td
                      data-label="Status"
                      className="whitespace-nowrap px-2 py-2"
                    >
                      <Link
                        href={linkToEventHref({
                          project: row.project,
                          status: String(row.status_code),
                        })}
                      >
                        <StatusCodeChip statusCode={row.status_code} />
                      </Link>
                    </td>
                    <td
                      data-label="Requests"
                      className="px-2 py-2 text-right font-mono text-neutral-100"
                    >
                      {row.count.toLocaleString()}
                    </td>
                    <td
                      data-label="Top path"
                      className="max-w-[220px] truncate px-2 py-2 font-mono text-neutral-400"
                    >
                      {row.top_path ? (
                        <Link
                          className="hover:text-white"
                          href={linkToEventHref({
                            project: row.project,
                            path: row.top_path,
                            status: String(row.status_code),
                          })}
                        >
                          {row.top_path}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {mode === "bot" &&
        (botStatusCodes.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No captured bot/status rows yet.
          </p>
        ) : (
          <div className="responsive-data-table">
            <table className="data-table w-full">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Bot</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Requests</th>
                  <th className="px-2 py-2 text-left font-medium">Top path</th>
                </tr>
              </thead>
              <tbody>
                {botStatusCodes.map((row) => (
                  <tr
                    key={`${row.bot_name}:${row.bot_category}:${row.status_code}`}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    <td
                      data-label="Bot"
                      className="whitespace-nowrap px-2 py-2 font-medium text-neutral-100"
                    >
                      <BotName
                        name={row.bot_name}
                        href={linkToBotHref(row.bot_name)}
                        className="hover:text-white"
                      />
                    </td>
                    <td
                      data-label="Status"
                      className="whitespace-nowrap px-2 py-2"
                    >
                      <Link
                        href={linkToEventHref({
                          bot: row.bot_name,
                          status: String(row.status_code),
                        })}
                      >
                        <StatusCodeChip statusCode={row.status_code} />
                      </Link>
                    </td>
                    <td
                      data-label="Requests"
                      className="px-2 py-2 text-right font-mono text-neutral-100"
                    >
                      {row.count.toLocaleString()}
                    </td>
                    <td
                      data-label="Top path"
                      className="max-w-[220px] truncate px-2 py-2 font-mono text-neutral-400"
                    >
                      {row.top_path ? (
                        <Link
                          className="inline-evidence-link"
                          href={linkToEventHref({
                            bot: row.bot_name,
                            path: row.top_path,
                            status: String(row.status_code),
                          })}
                        >
                          {row.top_path}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {mode === "page" &&
        (pageStatusCodes.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No captured page/status rows yet.
          </p>
        ) : (
          <div className="responsive-data-table">
            <table className="data-table w-full">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="px-2 py-2 text-left font-medium">Path</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Requests</th>
                  <th className="px-2 py-2 text-left font-medium">Top bot</th>
                </tr>
              </thead>
              <tbody>
                {pageStatusCodes.map((row) => (
                  <tr
                    key={`${row.project}:${row.path}:${row.status_code}`}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    <td
                      data-label="Path"
                      className="max-w-[210px] truncate px-2 py-2 font-mono text-neutral-300"
                    >
                      <Link
                        className="hover:text-white"
                        href={linkToEventHref({
                          project: row.project,
                          path: row.path,
                          status: String(row.status_code),
                        })}
                      >
                        {row.path || "-"}
                      </Link>
                    </td>
                    <td
                      data-label="Status"
                      className="whitespace-nowrap px-2 py-2"
                    >
                      <Link
                        href={linkToEventHref({
                          project: row.project,
                          path: row.path,
                          status: String(row.status_code),
                        })}
                      >
                        <StatusCodeChip statusCode={row.status_code} />
                      </Link>
                    </td>
                    <td
                      data-label="Requests"
                      className="px-2 py-2 text-right font-mono text-neutral-100"
                    >
                      {row.count.toLocaleString()}
                    </td>
                    <td
                      data-label="Top bot"
                      className="whitespace-nowrap px-2 py-2 text-neutral-400"
                    >
                      {row.top_bot ? (
                        <BotName
                          name={row.top_bot}
                          className="text-neutral-400"
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
