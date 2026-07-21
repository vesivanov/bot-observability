import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionValue,
  getBotLogToken,
  isSessionValid,
  isStrongSecret,
  timingSafeCompare,
} from "./auth";

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
