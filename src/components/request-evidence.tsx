import Link from "next/link";
import {
  Panel,
  StatusCodeChip,
  dashboardHref,
  eventHref,
  formatDateTime,
  pct,
} from "@/app/dashboard/shared";
import { requestStatusLabel } from "@/lib/request-status";
import type { DashboardQuery } from "@/lib/query-context";
import type { RequestAnalysis } from "@/lib/schema";

export function StatusLinks({
  codes,
  context,
}: {
  codes: RequestAnalysis["statusCodes"];
  context: DashboardQuery;
}) {
  const total = codes.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="status-links" aria-label="Inspect response status">
      <Link
        href={dashboardHref(context, { status: "all" })}
        className="status-link"
        aria-current={!context.status || context.status === "all" ? "true" : undefined}
      >
        <span>All outcomes</span>
        <strong>{total.toLocaleString()}</strong>
      </Link>
      {codes.map((row) => {
        const status = row.status_code ? String(row.status_code) : "unknown";
        return (
          <Link
            key={status}
            href={dashboardHref(context, { status })}
            className="status-link"
            aria-current={context.status === status ? "true" : undefined}
            aria-label={`Inspect ${requestStatusLabel(status)}: ${row.count.toLocaleString()} requests`}
          >
            <StatusCodeChip statusCode={row.status_code} />
            <strong>{row.count.toLocaleString()}</strong>
            <small>{pct(row.count, total)}%</small>
          </Link>
        );
      })}
    </div>
  );
}

export function RequestEvidence({
  analysis,
  context,
  showStatuses = true,
}: {
  analysis: RequestAnalysis;
  context: DashboardQuery;
  showStatuses?: boolean;
}) {
  const offset = context.offset ?? 0;
  const rows = analysis.pages.slice(0, 25);
  const hasMore = analysis.pages.length > 25;
  return (
    <div className="space-y-3">
      {showStatuses && (
        <Panel
          title="Response outcomes"
          meta="Select a status to inspect its pages"
        >
          <StatusLinks codes={analysis.statusCodes} context={context} />
        </Panel>
      )}
      <Panel
        title={
          context.status === "successful" ? "Successfully fetched paths" : "Requested paths"
        }
        meta={`${analysis.pageCount.toLocaleString()} observed ${analysis.pageCount === 1 ? "path" : "paths"} · ${analysis.summary.total_hits.toLocaleString()} ${analysis.summary.total_hits === 1 ? "request" : "requests"}`}
      >
        {context.status && context.status !== "all" && (
          <p className="evidence-caption">
            {context.status === "successful" ? "Only non-API GET requests with a reported 2xx response are included. Redirect hops and HEAD requests are excluded." : `Only requests with outcome ${requestStatusLabel(context.status)} are included below.`}{" "}
            <Link
              href={eventHref({
                ...context,
                offset: undefined,
              })}
              className="inline-evidence-link"
            >
              Inspect matching requests →
            </Link>
          </p>
        )}
        <div className="responsive-data-table">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Path</th>
                <th className="text-right">Requests</th>
                <th className="text-right">Bots</th>
                <th className="text-right">Redirects</th>
                <th className="text-right">Errors</th>
                <th className="text-right">Last request</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.project}:${row.path}`}>
                  <td data-label="Path" className="evidence-path">
                    <Link
                      href={dashboardHref(context, {
                        view: "pages",
                        project: row.project,
                        path: row.path,
                        status: context.status ?? "all",
                        offset: 0,
                      })}
                      className="inline-evidence-link"
                    >
                      {row.path || "/"}
                    </Link>
                    {!context.project && <small>{row.project}</small>}
                  </td>
                  <td data-label="Requests" className="text-right font-mono">
                    <Link
                      className="inline-evidence-link"
                      href={eventHref({
                        ...context,
                        project: row.project,
                        path: row.path,
                        offset: undefined,
                      })}
                    >
                      {row.total_hits.toLocaleString()}
                    </Link>
                  </td>
                  <td data-label="Bots" className="text-right font-mono">{row.bot_count}</td>
                  <td data-label="Redirects" className="text-right font-mono">
                    {row.redirect_hits ? (
                      <Link
                        className="inline-evidence-link"
                        href={dashboardHref({
                          ...context,
                          view: "pages",
                          project: row.project,
                          path: row.path,
                          status: context.status && !["all", "3xx"].includes(context.status) ? context.status : "redirects",
                          offset: undefined,
                        })}
                      >
                        {row.redirect_hits.toLocaleString()}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Errors" className="text-right font-mono">
                    {row.error_hits ? (
                      <Link
                        className="inline-evidence-link"
                        href={dashboardHref({
                          ...context,
                          view: "pages",
                          project: row.project,
                          path: row.path,
                          status: context.status && context.status !== "all" ? context.status : "errors",
                          offset: undefined,
                        })}
                      >
                        {row.error_hits.toLocaleString()}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    data-label="Last request"
                    className="text-right text-neutral-400"
                  >
                    {formatDateTime(row.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="evidence-caption">
            No retained requests match this selection.
          </p>
        )}
        <div className="evidence-pagination">
          <span>
            Paths {rows.length ? offset + 1 : 0}–{offset + rows.length} of{" "}
            {analysis.pageCount.toLocaleString()}
          </span>
          <div>
            {offset > 0 && (
              <Link
                className="pagination-link"
                href={dashboardHref(context, {
                  offset: Math.max(0, offset - 25),
                })}
              >
                ← Previous
              </Link>
            )}
            {hasMore && (
              <Link
                className="pagination-link"
                href={dashboardHref(context, { offset: offset + 25 })}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
