import { NextResponse, type NextRequest } from "next/server";

// Legacy dashboard URL redirects (Phase 2.1). These run in middleware —
// before the React render pipeline starts — rather than via next/navigation's
// redirect() inside page.tsx. That's a deliberate deviation from putting the
// logic directly in page.tsx: this route also ships a loading.tsx fallback,
// and once that loading shell has been flushed to the client (which happens
// as soon as the async page component suspends on its first await, e.g.
// `await cookies()`), a redirect() thrown later in the same render can no
// longer change the already-sent 200 status. Next.js instead falls back to
// a client-side redirect for that request, which degrades non-JS clients and
// loses the clean 307. Middleware sidesteps the race entirely.
const KNOWN_VIEWS = new Set(["overview", "bots", "pages", "events"]);

// Remembers the last-used project/period across sessions, so a bare
// `/dashboard` visit (bookmark, new tab, browser restart) returns to where
// the user left off instead of always resetting to "All projects" / 7d.
const PROJECT_COOKIE = "dash_project";
const PERIOD_COOKIE = "dash_period";
const PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { searchParams } = url;
  let changed = false;

  const view = searchParams.get("view");
  if (view === "trends") {
    searchParams.set("view", "overview");
    changed = true;
  } else if (view === "ai") {
    searchParams.set("view", "bots");
    searchParams.set("category", "ai");
    changed = true;
  } else if (view === "status" || view === "health") {
    searchParams.set("view", "pages");
    changed = true;
  } else if (view === "bot") {
    searchParams.set("view", "bots");
    changed = true;
  } else if (view && !KNOWN_VIEWS.has(view)) {
    searchParams.set("view", "overview");
    changed = true;
  }

  // Restore preferences only for a bare dashboard visit. Explicit query
  // selections remain authoritative even behind a proxy/container origin.
  const bareVisit = searchParams.size === 0;
  if (bareVisit) {
    const cookieProject = request.cookies.get(PROJECT_COOKIE)?.value;
    if (!searchParams.has("project") && cookieProject !== undefined) {
      searchParams.set("project", cookieProject);
      changed = true;
    }
    const cookiePeriod = request.cookies.get(PERIOD_COOKIE)?.value;
    if (!searchParams.has("period") && cookiePeriod !== undefined) {
      searchParams.set("period", cookiePeriod);
      changed = true;
    }
  }

  // Next requires an absolute URL here, then makes same-origin redirects
  // relative in its response adapter. Keep the request origin so a reverse
  // proxy's internal host never becomes the browser's redirect destination.
  const response = changed ? NextResponse.redirect(url) : NextResponse.next();

  // Persist whatever the request ends up carrying so the next bare visit
  // picks up from here. Only an explicit param value (present in the URL,
  // even as "") updates the cookie — an omitted param (the "All projects"
  // convention above) never overwrites a previously-remembered value.
  const finalProject = searchParams.get("project");
  if (finalProject !== null) {
    response.cookies.set(PROJECT_COOKIE, finalProject, {
      maxAge: PREF_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  const finalPeriod = searchParams.get("period");
  if (finalPeriod !== null) {
    response.cookies.set(PERIOD_COOKIE, finalPeriod, {
      maxAge: PREF_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const config = {
  matcher: "/dashboard",
};
