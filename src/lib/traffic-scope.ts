// Apply to the submitted website host, never to the collector's own address:
// a self-hosted collector may legitimately listen on loopback.
function isLocalHost(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  try {
    const hostname = new URL(value.includes("://") ? value : `http://${value}`).hostname
      .toLowerCase().replace(/\.$/, "");
    return hostname === "localhost" || hostname.endsWith(".localhost")
      || hostname === "[::1]" || hostname === "[::]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(hostname)
      || hostname === "0.0.0.0" || /^127\./.test(hostname);
  } catch {
    return false;
  }
}

export function isNonProductionTraffic(payload: Record<string, unknown>): boolean {
  const environment = typeof payload.environment === "string" ? payload.environment.trim().toLowerCase() : "";
  return ["development", "preview", "test", "staging"].includes(environment)
    || isLocalHost(payload.url) || isLocalHost(payload.host);
}
