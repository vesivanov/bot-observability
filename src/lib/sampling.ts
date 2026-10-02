export const ALLOWED_SAMPLE_RATES = [1, 0.5, 0.25, 0.1] as const;

export function normalizeSampleRate(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return ALLOWED_SAMPLE_RATES.find((rate) => rate === parsed) ?? 1;
}
