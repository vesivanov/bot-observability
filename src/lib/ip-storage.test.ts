import { describe, expect, it } from "vitest";
import { storedIp } from "./ip-storage";

describe("IP storage privacy", () => {
  it("hashes IPs with a strong dedicated secret", () => {
    const ip = "203.0.113.10";
    const token = "h".repeat(32);
    const stored = storedIp(ip, token);

    expect(stored).toHaveLength(64);
    expect(stored).not.toContain(ip);
    expect(storedIp(ip, token)).toBe(stored);
  });

  it("fails closed when the shared token is too weak", () => {
    expect(() => storedIp("203.0.113.10", "too-short")).toThrow("at least 32 characters");
  });

  it("returns empty string for an empty IP without checking the token strength", () => {
    // The empty-IP short-circuit runs before isStrongSecret, so a missing IP
    // combined with a weak token doesn't throw — it just yields "".
    expect(storedIp("", "too-short")).toBe("");
  });
});
