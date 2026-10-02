import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";

const mocks = vi.hoisted(() => ({ cookieValue: null as string | null, recordConnectionReceipt: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && mocks.cookieValue ? { value: mocks.cookieValue } : undefined }) }));
vi.mock("@/lib/request-db", () => ({ getRequestDb: () => ({ recordConnectionReceipt: mocks.recordConnectionReceipt }) }));
import { POST } from "./route";
const originalEnv = { ...process.env };
const adminToken = "a".repeat(32);
const request = (headers = {}) => new Request("https://dashboard.example/api/send-test-hit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ project: "docs" }) });

beforeEach(() => {
  process.env = { ...originalEnv, DATABASE_URL: "postgres://example", BOT_ADMIN_TOKEN: adminToken, BOT_IP_HASH_SECRET: "h".repeat(32), BOT_INGEST_TOKENS: JSON.stringify({ marketing: "m".repeat(32), docs: "d".repeat(32) }), BOT_ACCEPT_LEGACY_INGEST: "false" };
  mocks.cookieValue = createSessionValue(adminToken);
  mocks.recordConnectionReceipt.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });

describe("collector check", () => {
  it("rejects missing and forged administrator sessions", async () => {
    for (const cookie of [null, "v1.9999999999.nonce.invalidsignature"]) {
      mocks.cookieValue = cookie;
      expect((await POST(request())).status).toBe(401);
    }
    expect(mocks.recordConnectionReceipt).not.toHaveBeenCalled();
  });
  it("fails closed without ingestion configuration", async () => {
    delete process.env.BOT_INGEST_TOKENS;
    expect((await POST(request())).status).toBe(503);
  });
  it("checks the selected project internally, regardless of forwarded origin", async () => {
    const res = await POST(request({ "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https", host: "attacker.example" }));
    expect(await res.json()).toEqual({ checked: true, project: "docs" });
    expect(mocks.recordConnectionReceipt).toHaveBeenCalledWith("docs", "collector");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns storage failure without claiming delivery", async () => {
    mocks.recordConnectionReceipt.mockRejectedValueOnce(new Error("offline"));
    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
