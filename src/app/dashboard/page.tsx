import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/app/dashboard/db";
import {
  parsePeriod,
  periodDescription,
  formatDateTime,
  getMeta,
  ActiveFilterChips,
} from "@/app/dashboard/shared";
import { PeriodPicker } from "@/components/period-picker";
import { ViewSkeleton } from "@/app/dashboard/skeletons";
import { OverviewViewServer } from "@/app/dashboard/views/overview";
import { BotsViewServer } from "@/app/dashboard/views/bots";
import { HealthViewServer } from "@/app/dashboard/views/health";
import { EventsViewServer } from "@/app/dashboard/views/events";
import { categoryMeta, CATEGORY_ORDER } from "@/lib/categories";
import {
  getBotLogToken,
  isSessionValid,
  isStrongSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { LEGEND_GROUPS } from "@/lib/bot-legend";

const DATABASE_URL = process.env.DATABASE_URL;

const NAV_LINKS = [
  { key: "overview", label: "Overview" },
  { key: "bots", label: "Bots" },
  { key: "health", label: "Health" },
  { key: "events", label: "Raw Events" },
];

const KNOWN_VIEWS = new Set(NAV_LINKS.map((l) => l.key));

function navHref(view: string, period: string, projectFilter: string, categoryFilter: string) {
  const query = new URLSearchParams({ view, period });
  if (projectFilter) query.set("project", projectFilter);
  if (categoryFilter) query.set("category", categoryFilter);
  return `/dashboard?${query.toString()}`;
}

async function ProjectOptions() {
  const db = getDb();
  const meta = await getMeta(db, undefined);
  return (
    <>
      <option value="">All projects</option>
      {meta.allProjects.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </>
  );
}

async function LatestEventLabel({ projectFilter }: { projectFilter: string }) {
  const db = getDb();
  const meta = await getMeta(db, projectFilter || undefined);
  return <>Latest event {meta.latestEvent ? formatDateTime(meta.latestEvent) : "not seen"}</>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const botLogToken = getBotLogToken();
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!isSessionValid(session ?? null, botLogToken)) {
    const error = sp.error as string;
    const errorMessage = error === "invalid" ? "Invalid token. Please try again."
      : error === "rate_limited" ? "Too many login attempts. Please wait a minute."
      : error === "not_configured" ? "Login is not configured." : null;

    return (
      <div className="max-w-md mx-auto mt-32 text-center">
        {!isStrongSecret(botLogToken) ? (
          <>
            <h2 className="text-xl font-semibold mb-4">Dashboard authentication is not configured</h2>
            <p className="text-neutral-400 text-sm">Set BOT_LOG_TOKEN to a value of at least 32 characters.</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
            <p className="text-neutral-400 mb-6 text-sm">Enter your access token to continue.</p>
            {errorMessage ? (
              <p className="mb-4 text-sm text-rose-400">{errorMessage}</p>
            ) : null}
            <form action="/login" method="POST" className="flex gap-2 justify-center">
              <input name="token" type="password" placeholder="Access token" className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm w-64 text-foreground" />
              <button type="submit" className="bg-neutral-700 hover:bg-neutral-600 rounded px-4 py-2 text-sm font-medium transition-colors">Submit</button>
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

  // Legacy view redirects run in src/proxy.ts, ahead of this render — see the
  // comment there for why. This is a defensive fallback only, in case a
  // request somehow reaches the page without going through it.
  const view = KNOWN_VIEWS.has(rawView) ? rawView : "overview";
  const categoryFilter = (sp.category as string) ?? "";
  const botFilter = (sp.bot as string) ?? "";

  const viewCacheKey = JSON.stringify({ view, period, projectFilter, categoryFilter, botFilter, offset: sp.offset ?? "", limit: sp.limit ?? "", path: sp.path ?? "" });

  return (
    <div className="mx-auto max-w-7xl px-5 py-5 text-sm sm:px-6">
      <div className="mb-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-white">Crawler activity</h1>
              <form action="/logout" method="POST">
                <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-200">Sign out</button>
              </form>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {projectFilter ? `Filtered to ${projectFilter}` : "All projects"} · {periodDescription(periodDays)} ·{" "}
              <Suspense fallback="Latest event…">
                <LatestEventLabel projectFilter={projectFilter} />
              </Suspense>
            </p>
          </div>
          <form method="GET" action="/dashboard" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="view" value={view} />
            {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
            {botFilter && <input type="hidden" name="bot" value={botFilter} />}
            {view === "overview" && typeof sp.trend === "string" && <input type="hidden" name="trend" value={sp.trend} />}
            {view === "overview" && typeof sp.cats === "string" && <input type="hidden" name="cats" value={sp.cats} />}
            {view === "overview" && typeof sp.gran === "string" && <input type="hidden" name="gran" value={sp.gran} />}
            <PeriodPicker currentPeriod={period} />
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">Project</span>
              <select
                name="project"
                defaultValue={projectFilter}
                className="min-h-8 max-w-48 rounded border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none focus:border-amber-600/70"
              >
                <Suspense fallback={<option value="">All projects</option>}>
                  <ProjectOptions />
                </Suspense>
              </select>
            </label>
            <button type="submit" className="min-h-8 rounded border border-amber-700/45 bg-amber-950/20 px-3 text-xs font-medium text-amber-100 hover:bg-amber-900/30">Apply</button>
          </form>
        </div>

        <div className="overflow-x-auto border-b border-neutral-800">
          <div className="flex min-w-max items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.key}
                href={navHref(l.key, period, projectFilter, categoryFilter)}
                className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4 ${
                  view === l.key
                    ? "border-amber-300 text-amber-100"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {(() => {
          // "unknown" has no meaningful filter action, and "ai_crawler" is a
          // legacy internal bucket that isn't worth surfacing as its own
          // user-facing chip (it overlaps confusingly with "All AI" /
          // "AI training" for the same activity). Neither gets a chip.
          const visibleCategories = CATEGORY_ORDER.filter((c) => c !== "unknown" && c !== "ai_crawler");
          // If a deep link points at a category with no rendered chip (e.g.
          // ?category=unknown or ?category=ai_crawler), fall back to
          // highlighting "All" so the user isn't left with nothing active.
          const categoryFilterHasChip = categoryFilter === "ai" || visibleCategories.some((c) => c === categoryFilter);
          const allActive = !categoryFilter || !categoryFilterHasChip;
          return (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link
                href={navHref(view, period, projectFilter, "")}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                  allActive
                    ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                    : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                All
              </Link>
              <Link
                href={navHref(view, period, projectFilter, "ai")}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                  categoryFilter === "ai"
                    ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                    : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300"
                }`}
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
                    href={navHref(view, period, projectFilter, cat)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                      active
                        ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                        : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </Link>
                );
              })}
            </div>
          );
        })()}

        <ActiveFilterChips view={view} period={period} project={projectFilter || undefined} bot={botFilter || undefined} category={categoryFilter || undefined} />
      </div>

      <Suspense key={viewCacheKey} fallback={<ViewSkeleton view={view} />}>
        {view === "overview" && (
          <OverviewViewServer period={period} periodDays={periodDays} projectFilter={projectFilter || undefined} categoryFilter={categoryFilter || undefined} />
        )}
        {view === "bots" && (
          <BotsViewServer period={period} periodDays={periodDays} projectFilter={projectFilter || undefined} categoryFilter={categoryFilter || undefined} botFilter={botFilter || undefined} />
        )}
        {view === "health" && (
          <HealthViewServer period={period} periodDays={periodDays} projectFilter={projectFilter || undefined} categoryFilter={categoryFilter || undefined} />
        )}
        {view === "events" && (
          <EventsViewServer searchParams={sp} />
        )}
      </Suspense>

      <details className="mt-12 border-t border-neutral-800 pt-4 group">
        <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300 select-none">
          Legend &mdash; Bot Categories &amp; Descriptions
        </summary>
        <div className="mt-4 space-y-3">
          {LEGEND_GROUPS.map(g => (
            <div key={g.label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${g.color}`}>{g.label}</span>
                <span className="text-[10px] text-neutral-600">{g.description}</span>
              </div>
              <p className="text-[10px] text-neutral-500 italic mb-2">{g.impact}</p>
              <div className="flex flex-col gap-y-1">
                {g.subs.map(s => (
                  <div key={s.label} className="text-[11px] leading-relaxed">
                    <span className="text-neutral-500 font-medium">{s.label}:</span>{' '}
                    <span className="text-neutral-400">{s.examples}</span>
                    <span className="text-neutral-600"> — {s.what}</span>
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
