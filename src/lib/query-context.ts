import { getRawEventLimit, parsePeriod } from "./period";

export type DashboardQuery = {
  view?: string;
  period: string;
  project?: string;
  category?: string;
  bot?: string;
  path?: string;
  limit?: number;
  offset?: number;
};

export function readDashboardQuery(params: Record<string, string | string[] | undefined>): DashboardQuery {
  const value = (key: string) => Array.isArray(params[key]) ? params[key][0] : params[key];
  return {
    view: value("view"),
    period: parsePeriod(params.period).raw,
    project: value("project") || undefined,
    category: value("category") || undefined,
    bot: value("bot") || undefined,
    path: value("path") || undefined,
    limit: getRawEventLimit(params.limit),
    offset: Math.max(0, Number.parseInt(value("offset") ?? "", 10) || 0),
  };
}

export function dashboardHref(context: DashboardQuery, changes: Partial<DashboardQuery> = {}) {
  const selected = { ...context, ...changes };
  // Changing scope starts at the first result; tab navigation keeps the
  // filters supported by its destination. Custom date bounds stay in period.
  if (["period", "project", "category", "bot", "path", "limit"].some((key) =>
    key in changes && changes[key as keyof DashboardQuery] !== context[key as keyof DashboardQuery]
  )) selected.offset = 0;
  const view = selected.view ?? "overview";
  const query = new URLSearchParams({ view, period: selected.period });
  for (const key of ["project", "category"] as const) {
    if (selected[key]) query.set(key, selected[key]);
  }
  if ((view === "bots" || view === "events") && selected.bot) query.set("bot", selected.bot);
  if (view === "events") {
    if (selected.path) query.set("path", selected.path);
    if (selected.limit) query.set("limit", String(selected.limit));
    if (selected.offset && selected.offset > 0) query.set("offset", String(selected.offset));
  }
  return `/dashboard?${query.toString()}`;
}
