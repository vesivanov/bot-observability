import { DashboardFilters } from "@/components/dashboard-filters";
import { QueryForm } from "@/components/query-form";
import { FilterSelect } from "@/components/filter-select";
import { CategoryPicker } from "@/components/category-picker";
import { ConnectionPanel } from "@/components/connection-panel";
import { ConnectionButton } from "@/components/connection-button";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/app/dashboard/db";
import {
  parsePeriod,
  dashboardHref,
  readDashboardQuery,
  periodDescription,
  formatDateTime,
  formatRelativeTime,
  getMeta,
  ActiveFilterChips,
} from "@/app/dashboard/shared";
import { PeriodPicker } from "@/components/period-picker";
import { ViewSkeleton } from "@/app/dashboard/skeletons";
import { OverviewViewServer } from "@/app/dashboard/views/overview";
import { BotsViewServer } from "@/app/dashboard/views/bots";
import { PagesViewServer } from "@/app/dashboard/views/pages";
import { EventsViewServer } from "@/app/dashboard/views/events";
import { categoryMeta, CATEGORY_ORDER } from "@/lib/categories";
import {
  getAdminToken,
  isSessionValid,
  isStrongSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { resolveDashboardRange, roundToInterval } from "@/lib/period";
import { LEGEND_GROUPS } from "@/lib/bot-legend";

const DATABASE_URL = process.env.DATABASE_URL;

const NAV_LINKS = [
  { key: "overview", label: "Overview" },
  { key: "bots", label: "Bots" },
  { key: "pages", label: "Pages" },
  { key: "events", label: "Request log" },
];

const KNOWN_VIEWS = new Set(NAV_LINKS.map((l) => l.key));

function ProjectSelect({ selected, projects = [] }: { selected: string; projects?: string[] }) {
  return <FilterSelect key={selected} label="Project" name="project" defaultValue={selected} options={[
    { value: "", label: "All projects" },
    ...Array.from(new Set([selected, ...projects])).filter(Boolean).map((project) => ({ value: project, label: project })),
  ]} />;
}

async function ProjectSelector({ selected }: { selected: string }) {
  const meta = await getMeta(getDb(), undefined);
  return <ProjectSelect selected={selected} projects={meta.allProjects} />;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const adminToken = getAdminToken();
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!isSessionValid(session ?? null, adminToken)) {
    const error = sp.error as string;
    const errorMessage = error === "invalid" ? "Invalid token. Please try again."
      : error === "rate_limited" ? "Too many login attempts. Please wait a minute."
      : error === "not_configured" ? "Login is not configured." : null;

    return (
      <div className="auth-shell">
        {!isStrongSecret(adminToken) ? (
          <>
            <h2 className="text-xl font-semibold mb-4">Dashboard authentication is not configured</h2>
            <p className="text-neutral-400 text-sm">Set BOT_ADMIN_TOKEN to a value of at least 32 characters.</p>
          </>
        ) : (
          <>
            <h2 className="font-semibold mb-3">Dashboard access</h2>
            <p className="text-sm">Enter your access token to view crawler activity.</p>
            {errorMessage ? (
              <p className="mb-4 text-sm text-rose-400">{errorMessage}</p>
            ) : null}
            <form action="/login" method="POST">
              <label className="filter-field"><span className="field-label">Access token</span><input name="token" type="password" required autoComplete="current-password" className="filter-control" /></label>
              <button type="submit" className="apply-button">Sign in</button>
            </form>
          </>
        )}
      </div>
    );
  }

  if (!DATABASE_URL) {
    return (
      <div className="max-w-md mx-auto mt-32 text-center">
        <h2 className="text-xl font-semibold mb-2">DATABASE_URL not set</h2>
        <p className="text-neutral-400 text-sm">Set the DATABASE_URL environment variable to connect to your database.</p>
      </div>
    );
  }

  const rawView = (sp.view as string) ?? "overview";
  const projectFilter = (sp.project as string) ?? "";
  const parsedPeriod = parsePeriod(sp.period);
  const period = parsedPeriod.raw;
  const periodDays = parsedPeriod.days;
  const metadata = await getMeta(getDb(), projectFilter || undefined);
  const range = resolveDashboardRange(period, roundToInterval(new Date(), 30_000), metadata.rawDetailFrom);

  // Legacy view redirects run in src/proxy.ts, ahead of this render — see the
  // comment there for why. This is a defensive fallback only, in case a
  // request somehow reaches the page without going through it.
  const view = KNOWN_VIEWS.has(rawView) ? rawView : "overview";
  const categoryFilter = (sp.category as string) ?? "";
  const botFilter = (sp.bot as string) ?? "";

  const context = { ...readDashboardQuery(sp), view };
  const pathFilter = view !== "overview" ? context.path : undefined;

  const viewCacheKey = JSON.stringify(context);

  return (
    <div className="dashboard-shell">
      <div className="dashboard-top">
        <div className="dashboard-controls">
        <div className="dashboard-heading">
          <div>
            <h1>{{ overview: "Crawler overview", bots: "Bot activity", pages: "Page activity", events: "Request log" }[view]}</h1>
            <p>
              {projectFilter || "All projects"} <span className="text-neutral-600">/</span> {range.preset ? periodDescription(periodDays) : "Custom UTC range"}{range.aggregate && " · Daily aggregates"}{categoryFilter && ` · ${categoryFilter === "ai" ? "All AI" : categoryMeta(categoryFilter).label}`}
            </p>
          </div>

        </div>
          <DashboardFilters><QueryForm key={viewCacheKey} context={context} className="dashboard-toolbar">
            <input type="hidden" name="view" value={view} />
            {view !== "overview" && botFilter && <input type="hidden" name="bot" value={botFilter} />}
            {view !== "overview" && context.status && <input type="hidden" name="status" value={context.status} />}
            {pathFilter && <input type="hidden" name="path" value={pathFilter} />}
            {view !== "overview" && context.prefix && <input type="hidden" name="prefix" value={context.prefix} />}
            {view === "events" && <input type="hidden" name="limit" value={context.limit} />}
            {view === "overview" && typeof sp.trend === "string" && <input type="hidden" name="trend" value={sp.trend} />}
            {view === "overview" && typeof sp.cats === "string" && <input type="hidden" name="cats" value={sp.cats} />}
            {view === "overview" && typeof sp.gran === "string" && <input type="hidden" name="gran" value={sp.gran} />}
            <Suspense fallback={<ProjectSelect selected={projectFilter} />}>
              <ProjectSelector selected={projectFilter} />
            </Suspense>
            <PeriodPicker key={period} currentPeriod={period} />
            <CategoryPicker context={context} />
            <button type="submit" className="apply-button">Apply filters</button>
          </QueryForm></DashboardFilters>
        </div>
          <div className="selection-detail">
            <span>{formatDateTime(range.start)} → {range.aggregate ? formatDateTime(new Date(range.end.getTime() - 1)) : `before ${formatDateTime(range.end)}`}</span>
            <ConnectionButton receipt={metadata.latestEvent ? `Last request ${formatRelativeTime(metadata.latestEvent, new Date())}` : "Connect website"}><Suspense fallback={<p>Loading connection…</p>}><ConnectionPanel project={projectFilter || undefined} /></Suspense></ConnectionButton>
          </div>

        <nav className="dashboard-tabs" aria-label="Dashboard views">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.key}
                href={dashboardHref(context, { view: l.key })}
                className="dashboard-tab"
                aria-current={view === l.key ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}
        </nav>

        {(() => {
          // "unknown" has no meaningful filter action, and "ai_crawler" is a
          // legacy internal bucket that isn't worth surfacing as its own
          // user-facing chip (it overlaps confusingly with "All AI" /
          // "AI training" for the same activity). Neither gets a chip.
          const visibleCategories = CATEGORY_ORDER.filter((c) => c !== "ai_crawler" || categoryFilter === c);
          // If a deep link points at a category with no rendered chip (e.g.
          // ?category=unknown or ?category=ai_crawler), fall back to
          // highlighting "All" so the user isn't left with nothing active.

          const allActive = !categoryFilter;
          return (
            <nav className="category-filters" aria-label="Crawler categories">
              <Link
                href={dashboardHref(context, { category: undefined })}
                className="category-chip" aria-current={allActive ? "true" : undefined}
              >
                All
              </Link>
              <Link
                href={dashboardHref(context, { category: "ai" })}
                className="category-chip" aria-current={categoryFilter === "ai" ? "true" : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                All AI
              </Link>
              {visibleCategories.map((cat) => {
                const meta = categoryMeta(cat);
                const active = categoryFilter === cat;
                return (
                  <Link
                    key={cat}
                    href={dashboardHref(context, { category: cat })}
                    className="category-chip" aria-current={active ? "true" : undefined}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </Link>
                );
              })}
            </nav>
          );
        })()}

        <ActiveFilterChips {...context} hideProject bot={view !== "overview" ? botFilter : undefined} status={view !== "overview" ? context.status : undefined} path={pathFilter} prefix={view !== "overview" ? context.prefix : undefined} />
      </div>

      <Suspense key={viewCacheKey} fallback={<ViewSkeleton view={view} />}>
        {view === "overview" && (
          <OverviewViewServer period={period} periodDays={periodDays} range={range} projectFilter={projectFilter || undefined} categoryFilter={categoryFilter || undefined} />
        )}
        {view === "bots" && (
          <BotsViewServer period={period} periodDays={periodDays} range={range} projectFilter={projectFilter || undefined} categoryFilter={categoryFilter || undefined} botFilter={botFilter || undefined} statusFilter={context.status} offset={context.offset} pathFilter={pathFilter} prefixFilter={context.prefix} />
        )}
        {view === "pages" && <PagesViewServer context={context} range={range} />}
        {view === "events" && (
          <EventsViewServer searchParams={sp} range={range} />
        )}
      </Suspense>

      <details className="mt-6 border-t border-neutral-800 pt-3 group">
        <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300 select-none">
          Legend &mdash; Bot Categories &amp; Descriptions
        </summary>
        <div className="mt-4 space-y-3">
          {LEGEND_GROUPS.map(g => (
            <div key={g.label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${g.color}`}>{g.label}</span>
                <span className="text-xs text-neutral-400">{g.description}</span>
              </div>
              <p className="text-xs text-neutral-500 italic mb-2">{g.impact}</p>
              <div className="flex flex-col gap-y-1">
                {g.subs.map(s => (
                  <div key={s.label} className="text-xs leading-relaxed">
                    <span className="text-neutral-500 font-medium">{s.label}:</span>{' '}
                    <span className="text-neutral-400">{s.examples}</span>
                    <span className="text-neutral-400"> — {s.what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
