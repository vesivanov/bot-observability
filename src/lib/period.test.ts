import { describe, expect, it } from "vitest";
import { parsePeriod } from "./period";

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
});
