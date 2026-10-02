import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertHit: vi.fn(),
  recordConnectionReceipt: vi.fn(),
  upsertProjectHeartbeat: vi.fn(),
  close: vi.fn(),
  verifyBot: vi.fn(async () => "ua_only"),
}));

vi.mock("@/lib/request-db", () => ({
  getRequestDb: vi.fn(() => ({
    insertHit: mocks.insertHit,
    recordConnectionReceipt: mocks.recordConnectionReceipt,
    upsertProjectHeartbeat: mocks.upsertProjectHeartbeat,
    close: mocks.close,
  })),
}));

vi.mock("@/lib/verify", () => ({ verifyBot: mocks.verifyBot }));

import { normalizeSampleRate } from "@/lib/sampling";
import { POST } from "./route";

const originalEnv = { ...process.env };
const ingestToken = "i".repeat(32);
let clockTick = 0;

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://collector.example/api/bot-hit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bot-hit", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgres://example",
      BOT_ADMIN_TOKEN: "a".repeat(32),
      BOT_IP_HASH_SECRET: "h".repeat(32),
      BOT_INGEST_TOKENS: JSON.stringify({ "tracked-site": ingestToken }),
      BOT_LOG_TOKEN: "",
      BOT_ACCEPT_LEGACY_INGEST: "false",
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 2, 12) + ++clockTick * 120_000));
    mocks.insertHit.mockReset();
    mocks.recordConnectionReceipt.mockReset();
    mocks.upsertProjectHeartbeat.mockReset();
    mocks.close.mockReset();
    mocks.verifyBot.mockReset();
    mocks.verifyBot.mockResolvedValue("ua_only");
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("rejects missing and invalid credentials", async () => {
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }))).status).toBe(401);
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }, { authorization: "Bearer wrong" }))).status).toBe(401);
  });

  it("fails closed when server configuration is weak", async () => {
    process.env.BOT_IP_HASH_SECRET = "short";
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }, { authorization: `Bearer ${ingestToken}` }))).status).toBe(503);
  });

  it("fails closed when required server configuration is missing", async () => {
    delete process.env.DATABASE_URL;
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }, { authorization: `Bearer ${ingestToken}` }))).status).toBe(503);

    process.env.DATABASE_URL = "postgres://example";
    delete process.env.BOT_INGEST_TOKENS;
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }))).status).toBe(503);
  });

  it("rejects malformed and oversized bodies", async () => {
    const malformed = new Request("https://collector.example/api/bot-hit", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestToken}`, "content-type": "application/json" },
      body: "not json",
    });
    expect((await POST(malformed)).status).toBe(400);

    const oversized = new Request("https://collector.example/api/bot-hit", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestToken}`, "content-type": "application/json" },
      body: JSON.stringify({ user_agent: "GPTBot/1.0", padding: "x".repeat(33 * 1024) }),
    });
    expect((await POST(oversized)).status).toBe(400);

    expect((await POST(makeRequest(["not", "an", "object"], {
      authorization: `Bearer ${ingestToken}`,
    }))).status).toBe(400);
  });

  it("ignores non-bot false positives without a database write", async () => {
    const response = await POST(makeRequest({ project: "attacker-project", user_agent: "Mozilla/5.0" }, {
      authorization: `Bearer ${ingestToken}`,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: false, reason: "not_bot" });
    expect(mocks.insertHit).not.toHaveBeenCalled();
    expect(mocks.upsertProjectHeartbeat).not.toHaveBeenCalled();
  });

  it("derives project identity from the ingestion credential and normalizes fields", async () => {
    const response = await POST(makeRequest({
      project: "attacker-project",
      url: "https://tracked.example/a/very-long-path",
      method: "post",
      status_code: 599.8,
      user_agent: "GPTBot/1.0",
      ip: "203.0.113.10",
      sample_rate: 0.25,
    }, { authorization: `Bearer ${ingestToken}` }));

    expect(response.status).toBe(201);
    expect(mocks.insertHit).toHaveBeenCalledOnce();
    expect(mocks.insertHit.mock.calls[0][0]).toMatchObject({
      project_name: "tracked-site",
      path: "/a/very-long-path",
      method: "POST",
      status_code: 0,
      sample_rate: 0.25,
      heartbeat: false,
    });
    expect(mocks.insertHit.mock.calls[0][0].ip).toHaveLength(64);
    expect(mocks.insertHit.mock.calls[0][0].ip).not.toContain("203.0.113.10");
  });

  it("classifies the UA instead of trusting reported identity", async () => {
    const response = await POST(makeRequest({ user_agent: "GPTBot/1.0", bot_name: "Googlebot", bot_category: "search_crawler" }, { authorization: `Bearer ${ingestToken}` }));
    expect(response.status).toBe(201);
    expect(mocks.insertHit.mock.calls[0][0]).toMatchObject({ bot_name: "GPTBot", bot_category: "ai_training" });
    const browser = await POST(makeRequest({ user_agent: "Mozilla/5.0", bot_name: "GPTBot", bot_category: "ai_training" }, { authorization: `Bearer ${ingestToken}` }));
    expect(await browser.json()).toMatchObject({ stored: false, reason: "not_bot" });
  });

  it("ignores an invalid submitted bot category", async () => {
    const response = await POST(makeRequest({
      user_agent: "Mozilla/5.0",
      bot_name: "FakeBot",
      bot_category: "not_a_category",
    }, { authorization: `Bearer ${ingestToken}` }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: false, reason: "not_bot" });
    expect(mocks.insertHit).not.toHaveBeenCalled();
  });

  it("truncates fields and stores unavailable final statuses as unknown", async () => {
    const response = await POST(makeRequest({
      user_agent: `GPTBot/1.0${"x".repeat(2500)}`,
      path: `/${"p".repeat(1200)}`,
      referer: "r".repeat(2500),
      environment: "e".repeat(200),
      deployment_url: "d".repeat(400),
      status_code: 1000,
    }, { authorization: `Bearer ${ingestToken}` }));

    expect(response.status).toBe(201);
    const stored = mocks.insertHit.mock.calls[0][0];
    expect(stored.user_agent).toHaveLength(2000);
    expect(stored.path).toHaveLength(1000);
    expect(stored.referer).toBe("");
    expect(stored.environment).toHaveLength(100);
    expect(stored.deployment_url).toHaveLength(300);
    expect(stored.status_code).toBe(0);
  });

  it("upserts heartbeats without creating raw bot rows", async () => {
    const response = await POST(makeRequest({
      project: "attacker-project",
      heartbeat: true,
      environment: "production",
    }, { authorization: `Bearer ${ingestToken}` }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stored: true, heartbeat: true, project: "tracked-site" });
    expect(mocks.upsertProjectHeartbeat).toHaveBeenCalledWith({
      project_name: "tracked-site",
      environment: "production",
      deployment_url: "",
    });
    expect(mocks.insertHit).not.toHaveBeenCalled();
  });

  it("returns a non-success response when heartbeat storage fails", async () => {
    mocks.upsertProjectHeartbeat.mockRejectedValueOnce(new Error("database down"));
    const response = await POST(makeRequest({ heartbeat: true }, {
      authorization: `Bearer ${ingestToken}`,
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "storage_failed" });
  });

  it("returns a non-success response when storage fails", async () => {
    mocks.insertHit.mockRejectedValueOnce(new Error("database down"));
    const response = await POST(makeRequest({ user_agent: "GPTBot/1.0" }, {
      authorization: `Bearer ${ingestToken}`,
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "storage_failed" });
  });

  it("does not charge non-bots and isolates projects sharing an egress IP", async () => {
    process.env.BOT_EVENT_RPM = "2";
    process.env.BOT_INGEST_TOKENS = JSON.stringify({ "tracked-site": ingestToken, "other-site": "o".repeat(32) });
    const headers = { authorization: `Bearer ${ingestToken}`, "x-real-ip": "203.0.113.251" };
    for (let i = 0; i < 130; i++) expect((await POST(makeRequest({ user_agent: "Mozilla/5.0" }, headers))).status).toBe(200);
    vi.advanceTimersByTime(60_001);
    for (let i = 0; i < 2; i++) expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }, headers))).status).toBe(201);
    const limited = await POST(makeRequest({ user_agent: "GPTBot/1.0" }, headers));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await POST(makeRequest({ user_agent: "GPTBot/1.0" }, { ...headers, authorization: `Bearer ${"o".repeat(32)}` }))).status).toBe(201);
  });

  it("keeps probes out of analytics and uses the credential's project", async () => {
    const res = await POST(makeRequest({ probe: "connection", project: "other", user_agent: "GPTBot/1.0" }, { authorization: `Bearer ${ingestToken}` }));
    expect(await res.json()).toMatchObject({ received: true, project: "tracked-site" });
    expect(mocks.recordConnectionReceipt).toHaveBeenCalledWith("tracked-site", "probe");
    expect(mocks.insertHit).not.toHaveBeenCalled();
  });

  it("does not verify missing original IP from collector transport headers and strips queries", async () => {
    vi.advanceTimersByTime(60_001);
    const res = await POST(makeRequest({ user_agent: "Googlebot/2.1", url: "https://site.example/a?secret=hide", referer: "https://user:pass@site.example/b?token=hide#fragment" }, { authorization: `Bearer ${ingestToken}`, "x-forwarded-for": "66.249.66.1" }));
    expect(res.status).toBe(201);
    expect(mocks.verifyBot).not.toHaveBeenCalled();
    expect(mocks.insertHit.mock.calls[0][0]).toMatchObject({ ip: "", query_string: "", referer: "https://site.example/b" });
  });

});

describe("normalizeSampleRate", () => {
  it("keeps exact reciprocal rates and rejects arbitrary weights", () => {
    expect(normalizeSampleRate(1)).toBe(1);
    expect(normalizeSampleRate(0.5)).toBe(0.5);
    expect(normalizeSampleRate(0.25)).toBe(0.25);
    expect(normalizeSampleRate(0.1)).toBe(0.1);
    expect(normalizeSampleRate(0.3)).toBe(1);
    expect(normalizeSampleRate("not-a-number")).toBe(1);
  });
});
