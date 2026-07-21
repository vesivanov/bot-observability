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

export function proxy(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const view = searchParams.get("view");
  if (!view) return NextResponse.next();

  const url = request.nextUrl.clone();

  if (view === "trends" || view === "pages") {
    url.searchParams.set("view", "overview");
    return NextResponse.redirect(url);
  }
  if (view === "ai") {
    url.searchParams.set("view", "bots");
    url.searchParams.set("category", "ai");
    return NextResponse.redirect(url);
  }
  if (view === "status") {
    url.searchParams.set("view", "health");
    return NextResponse.redirect(url);
  }
  if (view === "bot") {
    url.searchParams.set("view", "bots");
    return NextResponse.redirect(url);
  }
  if (!KNOWN_VIEWS.has(view)) {
    url.searchParams.set("view", "overview");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard",
};
