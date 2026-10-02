function allowedKeys() {
  return new Set((process.env.BOT_QUERY_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function sanitizeQuery(query: string): string {
  const allowed = allowedKeys();
  const clean = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) {
    if (allowed.has(key)) clean.append(key, value);
  }
  return clean.toString().slice(0, 2000);
}

export function sanitizeReferer(referer: string): string {
  try {
    const url = new URL(referer);
    if (!['https:', 'http:'].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = sanitizeQuery(url.search);
    return url.toString().slice(0, 2000);
  } catch {
    return "";
  }
}
