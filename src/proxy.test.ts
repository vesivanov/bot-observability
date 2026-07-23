import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function makeRequest(path: string, opts: { cookie?: string; referer?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.referer) headers.referer = opts.referer;
  return new NextRequest(new URL(path, "https://example.com"), { headers });
}

describe("proxy — legacy view redirects", () => {
  it("passes through a request with no view param", () => {
    const res = proxy(makeRequest("/dashboard"));
    expect(res.status).not.toBe(307);
  });

  it("redirects trends/pages to overview", () => {
    const res = proxy(makeRequest("/dashboard?view=trends"));
    expect(new URL(res.headers.get("location")!).searchParams.get("view")).toBe("overview");
  });

  it("redirects ai to bots + category=ai", () => {
    const res = proxy(makeRequest("/dashboard?view=ai"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("view")).toBe("bots");
    expect(location.searchParams.get("category")).toBe("ai");
  });

  it("redirects an unknown view to overview", () => {
    const res = proxy(makeRequest("/dashboard?view=nonsense"));
    expect(new URL(res.headers.get("location")!).searchParams.get("view")).toBe("overview");
  });
});

describe("proxy — remembering last project/period", () => {
  it("does nothing on a first-ever bare visit with no cookies", () => {
    const res = proxy(makeRequest("/dashboard"));
    expect(res.status).not.toBe(307);
    expect(res.cookies.get("dash_project")).toBeUndefined();
    expect(res.cookies.get("dash_period")).toBeUndefined();
  });

  it("restores remembered project/period on a bare visit with no referer", () => {
    const res = proxy(makeRequest("/dashboard", { cookie: "dash_project=acme; dash_period=30" }));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("project")).toBe("acme");
    expect(location.searchParams.get("period")).toBe("30");
  });

  it("restores remembered project/period when the referer is an external site", () => {
    const res = proxy(
      makeRequest("/dashboard", { cookie: "dash_project=acme; dash_period=30", referer: "https://slack.com/x" })
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("project")).toBe("acme");
    expect(location.searchParams.get("period")).toBe("30");
  });

  it("does NOT override an explicitly-omitted project during in-app navigation", () => {
    // Simulates clicking a nav tab while "All projects" is selected: navHref
    // omits `project` entirely, but period is always present. A stale
    // project cookie from an earlier session must not clobber this.
    const res = proxy(
      makeRequest("/dashboard?view=bots&period=7", {
        cookie: "dash_project=acme; dash_period=30",
        referer: "https://example.com/dashboard?view=overview&period=7",
      })
    );
    expect(res.status).not.toBe(307);
    expect(res.cookies.get("dash_project")).toBeUndefined();
  });

  it("updates the period cookie on any in-app navigation", () => {
    const res = proxy(
      makeRequest("/dashboard?view=bots&period=30", {
        referer: "https://example.com/dashboard?view=overview&period=7",
      })
    );
    expect(res.cookies.get("dash_period")?.value).toBe("30");
  });

  it("persists an explicit empty project (All projects) chosen via the Apply form", () => {
    const res = proxy(makeRequest("/dashboard?view=overview&period=7&project="));
    expect(res.status).not.toBe(307);
    expect(res.cookies.get("dash_project")?.value).toBe("");
  });

  it("updates both cookies when the user explicitly picks a project/period", () => {
    const res = proxy(makeRequest("/dashboard?view=overview&period=90&project=acme"));
    expect(res.status).not.toBe(307);
    expect(res.cookies.get("dash_project")?.value).toBe("acme");
    expect(res.cookies.get("dash_period")?.value).toBe("90");
  });

  it("treats a malformed referer as external and still restores from cookie", () => {
    const res = proxy(
      makeRequest("/dashboard", { cookie: "dash_project=acme; dash_period=30", referer: "not a url" })
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("project")).toBe("acme");
  });
});
