// Exercises the real scripts/setup.mjs and scripts/migrate.mjs in a
// throwaway sandbox (never the repo's own .env). Each case spawns `node`
// against copies of the actual scripts, so this tests shipped behavior —
// secret generation, placeholder-only writes, and .env loading — not a copy.
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let sandbox = "";

function makeSandbox() {
  sandbox = join(tmpdir(), `botobs-setup-test-${process.pid}-${Date.now()}`);
  mkdirSync(join(sandbox, "scripts"), { recursive: true });
  cpSync(join(repoRoot, ".env.example"), join(sandbox, ".env.example"));
  cpSync(join(repoRoot, "scripts", "setup.mjs"), join(sandbox, "scripts", "setup.mjs"));
  cpSync(join(repoRoot, "scripts", "migrate.mjs"), join(sandbox, "scripts", "migrate.mjs"));
  cpSync(join(repoRoot, "scripts", "env.mjs"), join(sandbox, "scripts", "env.mjs"));
  // migrate.mjs imports the `postgres` package — resolve it from the repo.
  symlinkSync(join(repoRoot, "node_modules"), join(sandbox, "node_modules"), "dir");
}

function runSetup(extraEnv: Record<string, string> = {}) {
  return spawnSync("node", [join(sandbox, "scripts", "setup.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "",
      TEST_DATABASE_URL: "",
      BOT_ADMIN_TOKEN: "",
      BOT_IP_HASH_SECRET: "",
      BOT_INGEST_TOKENS: "",
      BOT_INGEST_TOKEN: "",
      BOT_LOG_TOKEN: "",
      ...extraEnv,
    },
  });
}

function readEnv() {
  return readFileSync(join(sandbox, ".env"), "utf8");
}

afterEach(() => {
  if (sandbox && existsSync(sandbox)) rmSync(sandbox, { recursive: true, force: true });
  sandbox = "";
});

describe("scripts/setup.mjs", () => {
  it("creates .env with fresh secrets and keeps the DB placeholder", () => {
    makeSandbox();
    const result = runSetup();
    expect(result.status).toBe(0);
    expect(existsSync(join(sandbox, ".env"))).toBe(true);

    const env = readEnv();
    const admin = /BOT_ADMIN_TOKEN=(\S+)/.exec(env)?.[1] ?? "";
    const ipHash = /BOT_IP_HASH_SECRET=(\S+)/.exec(env)?.[1] ?? "";
    const ingest = /BOT_INGEST_TOKENS='(\{.*\})'/.exec(env)?.[1] ?? "";
    expect(admin.length).toBeGreaterThanOrEqual(32);
    expect(ipHash.length).toBeGreaterThanOrEqual(32);
    expect(ipHash).not.toBe(admin);
    const mapping = JSON.parse(ingest) as Record<string, string>;
    const tokens = Object.values(mapping);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(32);
    // No database configured in the sandbox — must skip migrate, not fail.
    expect(env).toContain("DATABASE_URL=postgres://user:pass@host:port/dbname?sslmode=require");
    expect(result.stdout).toContain("npm run migrate");
  }, 30000);

  it("is a no-op on rerun and never rewrites real values", () => {
    makeSandbox();
    expect(runSetup().status).toBe(0);
    const before = readEnv();
    const rerun = runSetup();
    expect(rerun.status).toBe(0);
    expect(rerun.stdout).toContain("already configured");
    expect(readEnv()).toBe(before);
  }, 30000);

  it("fills placeholders but preserves values the user already set", () => {
    makeSandbox();
    const realAdmin = "my-real-admin-secret-at-least-32-chars!";
    writeFileSync(
      join(sandbox, ".env"),
      [
        "DATABASE_URL=postgres://user:pass@host:port/dbname?sslmode=require",
        `BOT_ADMIN_TOKEN=${realAdmin}`,
        "BOT_IP_HASH_SECRET=replace-with-a-different-32-character-secret",
        `BOT_INGEST_TOKENS='{"marketing-site":"replace-with-a-project-ingest-secret"}'`,
        "",
      ].join("\n"),
    );
    const result = runSetup();
    expect(result.status).toBe(0);
    const env = readEnv();
    expect(env).toContain(`BOT_ADMIN_TOKEN=${realAdmin}`);
    expect(env).not.toContain("replace-with-a-different-32-character-secret");
    expect(env).not.toContain("replace-with-a-project-ingest-secret");
  }, 30000);
});

describe("scripts/migrate.mjs", () => {
  it("reads DATABASE_URL from the .env file without shell exports", () => {
    makeSandbox();
    // Unreachable port: proves the URL came from .env (connection attempt)
    // rather than the usage error shown when no URL is found at all.
    writeFileSync(join(sandbox, ".env"), "DATABASE_URL=postgres://127.0.0.1:1/dbname\n");
    const result = spawnSync("node", [join(sandbox, "scripts", "migrate.mjs")], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "", TEST_DATABASE_URL: "" },
    });
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain("Usage:");
    expect(output).toMatch(/connect|ECONNREFUSED|refused/i);
  }, 30000);
});
