import { describe, expect, it } from "vitest";
import { knownStatusAccent } from "./shared";

// Regression coverage for the incident this function exists to prevent: three
// sites (yardwork.dev, vesivanov.com, garaxe.com) each independently started
// reporting status_code: 0 for every hit, and it went unnoticed for weeks
// because the "Known status" tile on the Health tab never changed color.
describe("knownStatusAccent", () => {
  it("is neutral when status capture is healthy", () => {
    expect(knownStatusAccent(100)).toBe("text-neutral-100");
    expect(knownStatusAccent(90)).toBe("text-neutral-100");
  });

  it("warns (orange) when status capture is degraded", () => {
    expect(knownStatusAccent(89)).toBe("text-orange-300");
    expect(knownStatusAccent(50)).toBe("text-orange-300");
  });

  it("alarms (rose) when status capture is effectively broken", () => {
    expect(knownStatusAccent(49)).toBe("text-rose-300");
    expect(knownStatusAccent(0)).toBe("text-rose-300");
  });
});
