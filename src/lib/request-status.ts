// 304 is cache validation, not a redirect hop.
export const REDIRECT_CODES = [300, 301, 302, 303, 307, 308];

// Request counts leave out redirect hops unless a filter selects them.
export function selectsRedirects(status: string | undefined): boolean {
  const valid = parseRequestStatus(status);
  return valid === "redirects" || valid === "3xx" || REDIRECT_CODES.includes(Number(valid));
}

export function parseRequestStatus(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (["all", "successful", "redirects", "2xx", "3xx", "4xx", "5xx", "errors", "unknown"].includes(value))
    return value;
  return /^[2-5]\d{2}$/.test(value) ? value : undefined;
}

export function requestStatusLabel(status: string): string {
  if (status === "all") return "All requests";
  if (status === "successful") return "Successful GETs";
  if (status === "redirects") return "Redirects";
  return status === "unknown"
    ? "Not captured"
    : status === "errors"
      ? "4xx + 5xx"
      : status;
}
