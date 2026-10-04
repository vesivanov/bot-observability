import Link from "next/link";
import { getDb } from "../db";
import { Panel, dashboardHref, eventHref, statsCache, STATS_CACHE_TTL_MS, LongRangeCaption, pct } from "../shared";
import type { DashboardRange } from "@/lib/period";
import type { DashboardQuery } from "@/lib/query-context";
import { RequestEvidence } from "@/components/request-evidence";
import { InvestigationFilters } from "@/components/investigation-filters";
import { DailyTrendChart } from "@/components/charts/daily-trend-chart";
import { BotName } from "@/components/bot-name";
import { fillDatePeriods } from "@/lib/date-buckets";

export async function PagesViewServer({ context, range }: { context: DashboardQuery; range: DashboardRange }) {
  if (range.aggregate) return <div className="empty-investigation">
    <h2>Page detail requires retained requests</h2>
    <LongRangeCaption label="Paths, exact responses and page activity are" />
    <Link className="pagination-link" href={dashboardHref(context, { period: "7", offset: 0 })}>View the last 7 days</Link>
    <Link className="evidence-link" href={eventHref(context)}>Inspect retained requests within this range →</Link>
  </div>;
  const params = { from: range.start, to: range.end, project: context.project, category: context.category, botName: context.bot, path: context.path, prefix: context.prefix, status: context.status, offset: context.offset };
  const db = getDb();
  const key = JSON.stringify(["pages", params]);
  const data = statsCache.get<Awaited<ReturnType<typeof db.requestAnalysis>>>(key) ?? await db.requestAnalysis(params);
  statsCache.set(key, data, STATS_CACHE_TTL_MS);
  const summary = data.summary;
  const daily = new Map(data.daily.map(row => [row.date, row.count]));
  return <div className="space-y-3">
    {context.path && <div className="page-detail-heading">
      <Link href={dashboardHref(context, { path: undefined, offset: 0 })} className="inline-evidence-link">← Page ranking</Link>
      <h2>{context.path}</h2>
      <p>{context.project || "Across selected projects"} · Observed requests for this exact path</p>
    </div>}
    <InvestigationFilters context={context} codes={data.statusCodes} bots={data.botNames} />
    <div className="investigation-summary" aria-label="Selected request totals">
      <span><strong>{summary.total_hits.toLocaleString()}</strong> requests</span>
      <span><strong>{data.pageCount.toLocaleString()}</strong> observed {data.pageCount === 1 ? "page" : "pages"}</span>
      <span><strong>{data.bots.length}</strong> bot identities</span>
      <span><strong>{summary.redirect_hits.toLocaleString()}</strong> redirects</span>
      <span><strong>{summary.error_hits.toLocaleString()}</strong> errors</span>
      <span><strong>{(summary.total_hits - summary.known_status_hits).toLocaleString()}</strong> missing status</span>
      <Link className="inline-evidence-link" href={eventHref({ ...context, offset: undefined })}>Matching requests →</Link>
    </div>
    {context.path ? <>
      <Panel title="Bots requesting this page" meta="Selected responses and dates">
        <div className="page-bot-list">
          <div className="page-bot-row page-bot-labels"><span>Bot</span><span>Requests</span><span>Share</span><span>Evidence</span></div>
          {data.bots.map(bot => <div key={bot.bot_name} className="page-bot-row">
            <BotName name={bot.bot_name} href={dashboardHref(context, { view: "bots", bot: bot.bot_name })} />
            <strong>{bot.total_hits.toLocaleString()}</strong>
            <span>{pct(bot.total_hits, summary.total_hits)}%</span>
            <Link className="inline-evidence-link" href={eventHref({ ...context, bot: bot.bot_name, offset: undefined })}>Requests →</Link>
          </div>)}
          {!data.bots.length && <p className="evidence-caption">No retained requests match these filters. Try another response or bot.</p>}
        </div>
      </Panel>
      <Panel title="Page activity" meta="Selected responses · UTC · boundary days may be partial">
        <DailyTrendChart data={fillDatePeriods(range.start, range.end).map(date => ({ date, count: daily.get(date) ?? 0 }))} />
      </Panel>
    </> : <RequestEvidence analysis={data} context={context} showStatuses={false} />}
    {!context.path && <details className="analysis-disclosure"><summary>Response activity over time</summary><Panel title="Request activity" meta="Selected responses · UTC · boundary days may be partial"><DailyTrendChart data={fillDatePeriods(range.start, range.end).map(date => ({ date, count: daily.get(date) ?? 0 }))} /></Panel></details>}
    <details className="measurement-note"><summary>About page and response data</summary><p>Counts use sample weighting. Pages are distinct project + path combinations observed in retained requests, not a complete site inventory. Different hosts within a project are combined; host details are available in the request log. Redirects are responses, not necessarily failures. Redirect destinations are not collected. Missing status means the sender did not capture the outcome.</p></details>
  </div>;
}
