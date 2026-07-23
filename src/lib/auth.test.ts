import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkLoginRateLimit,
  createSessionValue,
  getBotLogToken,
  isSessionValid,
  isStrongSecret,
  isTokenValid,
  timingSafeCompare,
} from "./auth";

function loginRequest(headers: Record<string, string>): Request {
  return new Request("https://example.com/login", { headers });
}

const originalEnv = { ...process.env };
const secret = "s".repeat(32);

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("auth configuration", () => {
  it("reads the shared server-side token", () => {
    process.env.BOT_LOG_TOKEN = "t".repeat(32);
    expect(getBotLogToken()).toBe("t".repeat(32));
  });
});

describe("signed sessions", () => {
  it("accepts a valid unexpired session", () => {
    const now = Date.UTC(2026, 6, 21);
    const value = createSessionValue(secret, now, 60);
    expect(isSessionValid(value, secret, now + 30_000)).toBe(true);
  });

  it("rejects expired, tampered, and wrongly signed sessions", () => {
    const now = Date.UTC(2026, 6, 21);
    const value = createSessionValue(secret, now, 60);
    expect(isSessionValid(value, secret, now + 61_000)).toBe(false);
    expect(isSessionValid(`${value.slice(0, -1)}x`, secret, now)).toBe(false);
    expect(isSessionValid(value, "w".repeat(32), now)).toBe(false);
  });

  it("does not place the dashboard token in the cookie value", () => {
    const value = createSessionValue(secret);
    expect(value).not.toContain(secret);
  });
});

describe("secret validation", () => {
  it("requires at least 32 characters", () => {
    expect(isStrongSecret("x".repeat(31))).toBe(false);
    expect(isStrongSecret("x".repeat(32))).toBe(true);
  });

  it("compares equal and unequal values safely", () => {
    expect(timingSafeCompare("same", "same")).toBe(true);
    expect(timingSafeCompare("same", "different-length")).toBe(false);
    expect(timingSafeCompare("same", "diff")).toBe(false);
  });
});

describe("isTokenValid", () => {
  it("fails closed on a null token", () => {
    expect(isTokenValid(null, "expected-token")).toBe(false);
  });

  it("fails closed when there's no configured expected token", () => {
    expect(isTokenValid("some-token", "")).toBe(false);
  });

  it("accepts a token matching the expected value", () => {
    expect(isTokenValid("shared-secret", "shared-secret")).toBe(true);
  });

  it("rejects a token that doesn't match", () => {
    expect(isTokenValid("wrong-token", "shared-secret")).toBe(false);
  });
});

describe("checkLoginRateLimit", () => {
  it("allows LOGIN_RATE_LIMIT (10) attempts within the window, then blocks the 11th", () => {
    const req = loginRequest({ "x-real-ip": "203.0.113.201" });
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRateLimit(req)).toBe(true);
    }
    expect(checkLoginRateLimit(req)).toBe(false);
  });

  it("tracks each client IP in its own bucket", () => {
    const reqA = loginRequest({ "x-real-ip": "203.0.113.202" });
    const reqB = loginRequest({ "x-real-ip": "203.0.113.203" });
    for (let i = 0; i < 10; i++) checkLoginRateLimit(reqA);
    expect(checkLoginRateLimit(reqA)).toBe(false);
    // A different IP has its own, unaffected budget.
    expect(checkLoginRateLimit(reqB)).toBe(true);
  });

  it("resets the count once the window has elapsed", () => {
    vi.useFakeTimers();
    try {
      const req = loginRequest({ "x-real-ip": "203.0.113.204" });
      for (let i = 0; i < 10; i++) checkLoginRateLimit(req);
      expect(checkLoginRateLimit(req)).toBe(false);
      vi.advanceTimersByTime(60_001); // LOGIN_WINDOW_MS + 1
      expect(checkLoginRateLimit(req)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("derives the rate-limit key from x-forwarded-for's first hop when x-real-ip is absent", () => {
    // Same underlying client ("203.0.113.205") identified via either header
    // shares one bucket — proves the two header-parsing branches in
    // getClientIp agree, not just that each works in isolation. Note this
    // also means the key is fully attacker-controlled unless a trusted proxy
    // strips/sets these headers upstream — this test documents that trust
    // boundary rather than asserting a fix for it.
    const viaForwardedFor = loginRequest({ "x-forwarded-for": "203.0.113.205, 10.0.0.1" });
    const viaRealIp = loginRequest({ "x-real-ip": "203.0.113.205" });
    for (let i = 0; i < 10; i++) checkLoginRateLimit(viaForwardedFor);
    expect(checkLoginRateLimit(viaRealIp)).toBe(false);
  });
});

describe("isSessionValid — weak secrets and malformed values", () => {
  it("fails closed when the validating secret is too weak, even for an otherwise well-formed/valid session", () => {
    const now = Date.UTC(2026, 6, 21);
    const value = createSessionValue(secret, now, 60);
    // Distinct from the "wrong but strong" secret case already covered above
    // (isSessionValid(value, "w".repeat(32), now)) — that exercises the
    // signature-mismatch branch. This exercises the separate
    // !isStrongSecret(secret) short-circuit, which runs before signature
    // verification is even attempted.
    expect(isSessionValid(value, "too-short", now)).toBe(false);
  });

  it("rejects malformed session values", () => {
    const now = Date.UTC(2026, 6, 21);
    expect(isSessionValid(null, secret, now)).toBe(false);
    expect(isSessionValid("", secret, now)).toBe(false);
    expect(isSessionValid("v1.123.nonce", secret, now)).toBe(false); // only 3 segments
    expect(isSessionValid("v1.123.nonce.sig.extra", secret, now)).toBe(false); // 5 segments
    expect(isSessionValid("v2.9999999999.nonce.sig", secret, now)).toBe(false); // wrong version
    expect(isSessionValid("v1.not-a-number.nonce.sig", secret, now)).toBe(false); // non-numeric expiresAt
  });
});
