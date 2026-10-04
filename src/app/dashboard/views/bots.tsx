import type { DashboardRange } from "@/lib/period";
import Link from "next/link";
import { getDb } from "@/app/dashboard/db";
import {
  statsCache,
  STATS_CACHE_TTL_MS,
  dashboardHref,
  eventHref,
  formatDateTime,
  Panel,
  NormalizedCategoryChip,
  LongRangeCaption,
} from "@/app/dashboard/shared";
import { normalizeBotCategory } from "@/lib/categories";
import { BotName } from "@/components/bot-name";
import { StackedBotChart } from "@/components/charts/stacked-bot-chart";
import { DailyTrendChart } from "@/components/charts/daily-trend-chart";
import { HourlyHeatmap } from "@/components/charts/hourly-heatmap";
import { AiRequestComparison, MoverList } from "@/components/bot-analysis";
import { InvestigationFilters } from "@/components/investigation-filters";
import { RequestEvidence } from "@/components/request-evidence";
import { fillDatePeriods } from "@/lib/date-buckets";
import { BotsTable } from "@/components/bots-table";
import type { BotDetailReport } from "@/lib/schema";

export async function BotsViewServer({
  period,
  range,
  projectFilter,
  categoryFilter,
  botFilter,
  statusFilter,
  pathFilter,
  prefixFilter,
  offset = 0,
}: {
  period: string;
  periodDays: number;
  range: DashboardRange;
  projectFilter?: string;
  categoryFilter?: string;
  botFilter?: string;
  statusFilter?: string;
  pathFilter?: string;
  prefixFilter?: string;
  offset?: number;
}) {
  const db = getDb();
  const { start: from, end: to, aggregate } = range;
  const context = {
    view: "bots",
    period,
    project: projectFilter,
    category: categoryFilter,
    bot: botFilter,
    status: statusFilter,
    path: pathFilter,
    prefix: prefixFilter,
    offset,
  };
  const key = JSON.stringify([
    "bots-investigation",
    from,
    to,
    aggregate,
    projectFilter,
    categoryFilter,
    botFilter,
    statusFilter,
    pathFilter,
    prefixFilter,
    offset,
  ]);
  const fetchData = async () => {
    const [identities, analysis] = await Promise.all([
      aggregate
        ? db.allBotDetailsRollup(from, to, projectFilter)
        : db.allBotDetails(
            from,
            to,
            projectFilter,
            categoryFilter,
            statusFilter,
            pathFilter,
            prefixFilter,
          ),
      aggregate
        ? Promise.resolve(null)
        : db.requestAnalysis({
            from,
            to,
            project: projectFilter,
            category: categoryFilter,
            botName: botFilter,
            status: statusFilter,
            path: pathFilter,
            prefix: prefixFilter,
            offset,
          }),
    ]);
    const bots = identities.filter(
      (row) =>
        !categoryFilter ||
        (categoryFilter === "ai"
          ? normalizeBotCategory(row.bot_name, row.bot_category).startsWith(
              "ai_",
            )
          : normalizeBotCategory(row.bot_name, row.bot_category) ===
            categoryFilter),
    );
    const [rawReport, activity] = botFilter
      ? await Promise.all([
          aggregate
            ? Promise.resolve(null)
            : db.botDetailReport(
                botFilter,
                from,
                to,
                projectFilter,
                categoryFilter,
              ),
          aggregate
            ? db.botDailyRollup(
                botFilter,
                from,
                to,
                projectFilter,
                categoryFilter,
              )
            : Promise.resolve([]),
        ])
      : [null, []];
    let report = rawReport;
    if (aggregate && botFilter) {
      const matches = bots.filter((row) => row.bot_name === botFilter);
      if (matches.length) {
        const total = matches.reduce((sum, row) => sum + row.total_hits, 0);
        const verified = matches.reduce(
          (sum, row) => sum + row.verified_hits,
          0,
        );
        const projects = Array.from(
          new Set(matches.flatMap((row) => row.projects.split(", "))),
        );
        report = {
          ...matches[0],
          total_hits: total,
          verified_hits: verified,
          ua_only_hits: total - verified,
          projects_hit: projects.length,
          top_project: "",
          top_page: "",
          first_seen: "",
          last_seen: matches
            .map((row) => row.last_seen)
            .sort()
            .at(-1)!,
        } satisfies BotDetailReport;
      }
    }
    const previousFrom = new Date(
      from.getTime() - (to.getTime() - from.getTime()),
    );
    const extras =
      !botFilter && !aggregate && !statusFilter && !pathFilter && !prefixFilter
        ? await Promise.all([
            db.botPeriodCounts({
              from,
              to,
              granularity: "day",
              project: projectFilter,
              category: categoryFilter,
            }),
            db.hourlyCounts(from, to, projectFilter, categoryFilter),
            db.movers({
              dimension: "bot",
              currentFrom: from,
              currentTo: to,
              previousFrom,
              previousTo: from,
              project: projectFilter,
              category: categoryFilter,
              limit: 8,
            }),
          ])
        : null;
    return { bots, analysis, report, activity, extras };
  };
  const data =
    statsCache.get<Awaited<ReturnType<typeof fetchData>>>(key) ??
    (await fetchData());
  statsCache.set(key, data, STATS_CACHE_TTL_MS);
  const { bots, analysis, report, activity, extras } = data;

  if (aggregate && (statusFilter || pathFilter || prefixFilter))
    return (
      <div className="evidence-caption">
        Path and exact outcome filters require retained request detail.{" "}
        <Link
          className="inline-evidence-link"
          href={dashboardHref(context, { status: undefined, path: undefined, prefix: undefined })}
        >
          Show aggregate bot activity for all outcomes
        </Link>{" "}
        or{" "}
        <Link className="inline-evidence-link" href={eventHref(context)}>
          inspect available matching raw requests
        </Link>
        .
      </div>
    );

  if (botFilter) {
    if (!report)
      return (
        <div>
          <Link
            className="evidence-link"
            href={dashboardHref(context, { bot: undefined })}
          >
            ← All bots
          </Link>
          <p className="evidence-caption">
            No activity found for {botFilter} in this selection.
          </p>
        </div>
      );
    const counts = new Map(
      activity.map((row) => [
        "period" in row ? row.period : row.date,
        row.count,
      ]),
    );
    if (analysis) { counts.clear(); for (const row of analysis.daily) counts.set(row.date, row.count); }
    const daily = fillDatePeriods(from, to).map((date) => ({
      date,
      count: counts.get(date) ?? 0,
    }));
    return (
      <div className="space-y-3">
        <div className="bot-detail-heading">
          <div>
            <Link
              className="inline-evidence-link"
              href={dashboardHref(context, {
                bot: undefined,
                offset: 0,
              })}
            >
              ← All bots
            </Link>
            <h2>
              <BotName name={report.bot_name} />
              <NormalizedCategoryChip
                botName={report.bot_name}
                category={report.bot_category}
              />
            </h2>
            <p>
              {aggregate
                ? "Last selected UTC day"
                : "Last request in selection"}{" "}
              {aggregate
                ? report.last_seen.slice(0, 10)
                : analysis ? (analysis.summary.last_seen ? formatDateTime(analysis.summary.last_seen) : "none") : formatDateTime(report.last_seen)}{" "}
              · Selected project, path and responses
            </p>
          </div>
          <Link
            className="pagination-link"
            href={eventHref({ ...context, offset: undefined })}
          >
            Matching requests →
          </Link>
        </div>
        {!aggregate && <InvestigationFilters context={context} codes={analysis?.statusCodes} showBot={false} />}
        <div className="investigation-summary">
          <span><strong>{(analysis?.summary.total_hits ?? report.total_hits).toLocaleString()}</strong> requests</span>
          <Link className="inline-evidence-link" href={dashboardHref(context, { view: "pages" })}><strong>{analysis?.pageCount.toLocaleString() ?? "—"}</strong> observed pages →</Link>
          {analysis && <span><strong>{analysis.summary.error_hits.toLocaleString()}</strong> errors</span>}
          {!projectFilter && <span><strong>{analysis?.projects.length ?? report.projects_hit}</strong> projects</span>}
        </div>
        <details className="measurement-note"><summary>Identity verification</summary><p>DNS verification is available for supported identities only. {report.verified_hits.toLocaleString()} of {report.total_hits.toLocaleString()} requests across all responses in this project/date/category selection were DNS verified; the others were identified by user-agent matching. A UA match alone does not verify the sender.</p></details>
        {analysis ? (
          <RequestEvidence analysis={analysis} context={context} showStatuses={false} />
        ) : (
          <LongRangeCaption label="Exact outcomes and requested pages are" />
        )}
        <details className="analysis-disclosure"><summary>Daily activity</summary>
        <Panel title="Daily activity" meta="Selected responses · UTC">
          <DailyTrendChart data={daily} />
        </Panel>
        </details>
        {analysis && !projectFilter && (
          <Panel
            title="Projects requested"
            meta={statusFilter ? "Selected outcome" : "All outcomes"}
          >
            <div className="project-request-list">
              {analysis.projects.map((row) => (
                <Link
                  key={row.project}
                  className="project-request-row"
                  href={dashboardHref(context, { project: row.project })}
                >
                  <span>{row.project}</span>
                  <strong>{row.count.toLocaleString()}</strong>
                </Link>
              ))}
            </div>
          </Panel>
        )}
      </div>
    );
  }

  const total = bots.reduce((sum, row) => sum + row.total_hits, 0);
  const aiData = bots
    .filter((row) =>
      normalizeBotCategory(row.bot_name, row.bot_category).startsWith("ai_"),
    )
    .map((row) => ({
      ...row,
      ua_only_hits: row.total_hits - row.verified_hits,
    }));
  return (
    <div className="space-y-3">
      <div className="investigation-summary">
        <span><strong>{bots.length}</strong> bot identities</span>
        <span><strong>{total.toLocaleString()}</strong> requests</span>
        <Link className="inline-evidence-link" href={dashboardHref(context, { view: "pages" })}>{analysis?.pageCount.toLocaleString() ?? "—"} observed pages →</Link>
      </div>
      <Panel
        title="Bot analysis"
        meta="Open an identity for pages and response outcomes"
      >
        <BotsTable
          bots={bots}
          outcomes={analysis?.bots}
          period={period}
          projectFilter={projectFilter}
          categoryFilter={categoryFilter}
          statusFilter={statusFilter}
          aggregate={aggregate}
          pathFilter={pathFilter}
          prefixFilter={prefixFilter}
        />
      </Panel>

      <details className="analysis-disclosure"><summary>Activity patterns and comparisons</summary>
      {extras && (
        <div className="bot-analysis-grid">
          <StackedBotChart
            title="Daily activity by bot"
            periods={fillDatePeriods(from, to)}
            rows={extras[0]}
            granularity="day"
          />
          <Panel title="Request timing" meta="Combined requests by UTC hour">
            <HourlyHeatmap data={extras[1]} />
          </Panel>
        </div>
      )}
      <AiRequestComparison data={aiData} />
      {extras && (
        <Panel
          title="Bot changes"
          meta="Compared with the preceding equal-length period"
        >
          <MoverList
            title="Largest changes"
            items={extras[2]}
            period={period}
            project={projectFilter}
            category={categoryFilter}
            kind="bot"
          />
        </Panel>
      )}
      </details>
      {aggregate && (
        <LongRangeCaption label="Page and exact response analysis are" />
      )}
      <p className="evidence-caption">
        Request counts use sample weighting. Observed pages describe crawler
        requests, not a complete site inventory. DNS verification is available
        only for supported crawler identities.
      </p>
    </div>
  );
}
