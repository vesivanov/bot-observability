import { getRawEventLimit, parsePeriod } from "./period";
import { parseRequestStatus } from "./request-status";

export type DashboardQuery = {
  view?: string;
  period: string;
  project?: string;
  category?: string;
  bot?: string;
  path?: string;
  prefix?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export function readDashboardQuery(
  params: Record<string, string | string[] | undefined>,
): DashboardQuery {
  const value = (key: string) =>
    Array.isArray(params[key]) ? params[key][0] : params[key];
  return {
    view: value("view"),
    period: parsePeriod(params.period).raw,
    project: value("project") || undefined,
    category: value("category") || undefined,
    bot: value("bot") || undefined,
    path: value("path") || undefined,
    prefix: value("prefix") || undefined,
    status: parseRequestStatus(value("status")),
    limit: getRawEventLimit(params.limit),
    offset: Math.max(0, Number.parseInt(value("offset") ?? "", 10) || 0),
  };
}

export function dashboardHref(
  context: DashboardQuery,
  changes: Partial<DashboardQuery> = {},
) {
  const selected = { ...context, ...changes };
  // Changing scope starts at the first result; tab navigation keeps the
  // filters supported by its destination. Custom date bounds stay in period.
  if (
    [
      "view",
      "period",
      "project",
      "category",
      "bot",
      "path",
      "prefix",
      "status",
      "limit",
    ].some(
      (key) =>
        key in changes &&
        changes[key as keyof DashboardQuery] !==
          context[key as keyof DashboardQuery],
    )
  )
    selected.offset = 0;
  const view = selected.view === "health" ? "pages" : selected.view ?? "overview";
  const query = new URLSearchParams({ view, period: selected.period });
  for (const key of ["project", "category"] as const) {
    if (selected[key]) query.set(key, selected[key]);
  }
  if (["bots", "pages", "events"].includes(view)) {
    if (selected.bot) query.set("bot", selected.bot);
    if (selected.path) query.set("path", selected.path);
    if (selected.prefix) query.set("prefix", selected.prefix);
    if (parseRequestStatus(selected.status))
      query.set("status", selected.status!);
    if (selected.offset && selected.offset > 0)
      query.set("offset", String(selected.offset));
  }
  if (view === "events") {
    if (selected.limit) query.set("limit", String(selected.limit));
  }
  return `/dashboard?${query.toString()}`;
}
