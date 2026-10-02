import { describe, expect, it } from "vitest";
import { parsePeriod, resolveDashboardRange } from "./period";

// parsePeriod originally lived in src/app/dashboard/shared.tsx, which also
// imports next/link and TtlCache. Since parsePeriod itself has no such
// dependency, it was extracted to this dependency-light module (shared.tsx
// re-exports it, so no call sites changed) specifically so it's testable
// here without mocking next/link.
describe("parsePeriod", () => {
  it("resolves a preset value", () => {
    const result = parsePeriod("7");
    expect(result.preset).toBe(true);
    expect(result.days).toBe(7);
  });

  it("resolves the 1y preset", () => {
    const result = parsePeriod("365");
    expect(result.preset).toBe(true);
    expect(result.days).toBe(365);
  });

  it("resolves a valid custom range", () => {
    const result = parsePeriod("2026-06-01_2026-07-01");
    expect(result.preset).toBe(false);
    expect(result.days).toBeGreaterThanOrEqual(29);
    expect(result.days).toBeLessThanOrEqual(31);
  });

  it("falls back to a 7d preset for garbage input", () => {
    const result = parsePeriod("garbage");
    expect(result.preset).toBe(true);
    expect(result.days).toBe(7);
  });

  it("falls back to a 7d preset for an inverted custom range", () => {
    const result = parsePeriod("2026-07-01_2026-06-01");
    expect(result.preset).toBe(true);
    expect(result.days).toBe(7);
  });

  it("falls back to a 7d preset for an oversized custom range", () => {
    // > 400 day span
    const result = parsePeriod("2020-01-01_2026-01-01");
    expect(result.preset).toBe(true);
    expect(result.days).toBe(7);
  });

  it("falls back to a 7d preset when no value is given", () => {
    const result = parsePeriod(undefined);
    expect(result.preset).toBe(true);
    expect(result.days).toBe(7);
  });
  it("converts an inclusive single-day picker selection to UTC half-open bounds", () => {
    const range = parsePeriod("2026-10-01_2026-10-01");
    expect(range.days).toBe(1);
    expect(range.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(parsePeriod("2026-02-30_2026-03-01").preset).toBe(true);
  });

  it("uses displayed whole UTC days for aggregates without changing raw requested bounds", () => {
    const range = resolveDashboardRange("365", new Date("2026-10-02T12:00:00Z"));
    expect(range.aggregate).toBe(true);
    expect(range.start.toISOString()).toBe("2025-10-02T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(range.requestedStart.toISOString()).toBe("2025-10-02T12:00:00.000Z");
  });

});
