// Operator-owned origin for snippets and redirects. Never derive it from
// forwarded headers, which can differ across reverse proxies and containers.
export function getCollectorOrigin(): string {
  try {
    const url = new URL(process.env.BOT_COLLECTOR_ORIGIN ?? "http://localhost:3000");
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.origin;
  } catch { /* Local installation default. */ }
  return "http://localhost:3000";
}
