export function parseRequestStatus(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (["2xx", "3xx", "4xx", "5xx", "errors", "unknown"].includes(value))
    return value;
  return /^[2-5]\d{2}$/.test(value) ? value : undefined;
}

export function requestStatusLabel(status: string): string {
  return status === "unknown"
    ? "Not captured"
    : status === "errors"
      ? "4xx + 5xx"
      : status;
}
