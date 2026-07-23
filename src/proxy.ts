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
const KNOWN_VIEWS = new Set(["overview", "bots", "health", "events"]);

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
  if (view === "trends" || view === "pages") {
    searchParams.set("view", "overview");
    changed = true;
  } else if (view === "ai") {
    searchParams.set("view", "bots");
    searchParams.set("category", "ai");
    changed = true;
  } else if (view === "status") {
    searchParams.set("view", "health");
    changed = true;
  } else if (view === "bot") {
    searchParams.set("view", "bots");
    changed = true;
  } else if (view && !KNOWN_VIEWS.has(view)) {
    searchParams.set("view", "overview");
    changed = true;
  }

  // Every in-app link/form (navHref, botHref, the Apply form, etc.) always
  // carries `period`, but deliberately omits `project` when it's "" (All
  // projects) — that's the existing convention this whole codebase uses for
  // "no filter". So an absent `project` param can't by itself distinguish
  // "fresh visit, please restore my last project" from "mid-session
  // navigation while All projects is the active choice". The Referer header
  // does distinguish them: only a request that did NOT come from this same
  // /dashboard page (a bookmark, a new tab, a pasted link, browser restore)
  // should have cookie values injected here.
  const referer = request.headers.get("referer");
  const isInternalNav = (() => {
    if (!referer) return false;
    try {
      const refUrl = new URL(referer);
      return refUrl.origin === url.origin && refUrl.pathname === url.pathname;
    } catch {
      return false;
    }
  })();

  if (!isInternalNav) {
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
