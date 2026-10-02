import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFirstRunSetup } from "./first-run";

const originalEnv = { ...process.env };
const ingestToken = "i".repeat(32);

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.BOT_INGEST_TOKENS;
  delete process.env.BOT_INGEST_TOKEN;
  delete process.env.BOT_INGEST_PROJECT;
  delete process.env.BOT_LOG_TOKEN;
  delete process.env.BOT_ACCEPT_LEGACY_INGEST;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getFirstRunSetup", () => {
  it("uses the deliberately selected project, not the first key", () => {
    process.env.BOT_INGEST_TOKENS = JSON.stringify({ marketing: ingestToken, docs: "d".repeat(32) });
    expect(getFirstRunSetup("docs")).toMatchObject({ project: "docs", token: "d".repeat(32) });
    expect(getFirstRunSetup("unconfigured").token).toBe("");
  });
  it("returns the first project's real token", () => {
    process.env.BOT_INGEST_TOKENS = JSON.stringify({
      "marketing-site": ingestToken,
      docs: "d".repeat(32),
    });
    const setup = getFirstRunSetup();
    expect(setup.configured).toBe(true);
    expect(setup.invalid).toBe(false);
    expect(setup.project).toBe("marketing-site");
    expect(setup.token).toBe(ingestToken);
  });

  it("reports unconfigured when no ingestion keys exist", () => {
    const setup = getFirstRunSetup();
    expect(setup.token).toBe("");
    expect(setup.configured).toBe(false);
  });

  it("reports invalid when a token is too short", () => {
    process.env.BOT_INGEST_TOKENS = JSON.stringify({ "marketing-site": "short" });
    const setup = getFirstRunSetup();
    expect(setup.invalid).toBe(true);
    expect(setup.token).toBe("");
  });

  it("falls back to the legacy credential during the migration window", () => {
    process.env.BOT_ACCEPT_LEGACY_INGEST = "true";
    process.env.BOT_LOG_TOKEN = "l".repeat(32);
    const setup = getFirstRunSetup();
    expect(setup.configured).toBe(true);
    expect(setup.token).toBe("l".repeat(32));
  });
});
