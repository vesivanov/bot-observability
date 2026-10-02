import { parseEnvFile } from "./env.mjs";
// One-command first run: creates .env with generated secrets (never
// overwrites real values) and runs the database migrations.
//
// Usage: npm run setup
//
// - If .env is missing, it is created from .env.example with fresh secrets.
// - If .env exists, only placeholder values (containing "replace-with")
//   are filled in. Real values are left untouched.
// - Migrations run when a DATABASE_URL is available (env or .env file).
//   A missing/unreachable database prints next steps instead of failing.

import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

function generateSecret() {
  return randomBytes(32).toString("base64");
}

function main() {
  if (!existsSync(examplePath)) {
    console.error("Missing .env.example — cannot run setup.");
    process.exit(1);
  }

  const hadEnv = existsSync(envPath);
  let lines = readFileSync(hadEnv ? envPath : examplePath, "utf8").split("\n");

  // If .env exists but was hand-written without some keys, append the
  // missing keys from the template so the app can boot.
  if (hadEnv) {
    const existing = parseEnvFile(lines.join("\n"));
    const templateLines = readFileSync(examplePath, "utf8").split("\n");
    const missing = [];
    for (const line of templateLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      if (!(key in existing)) missing.push(line);
    }
    if (missing.length > 0) {
      lines.push("", "# Added by npm run setup (missing keys from .env.example):", ...missing);
    }
  }

  const adminSecret = generateSecret();
  const ipHashSecret = generateSecret();
  const ingestSecret = generateSecret();
  let changed = !hadEnv;

  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return line;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    const value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    // Only ever replace placeholders — never a real value.
    if (!value.includes("replace-with")) return line;
    changed = true;
    if (key === "BOT_ADMIN_TOKEN") return `${key}=${adminSecret}`;
    if (key === "BOT_IP_HASH_SECRET") return `${key}=${ipHashSecret}`;
    if (key === "BOT_INGEST_TOKENS") {
      return `${key}='{"marketing-site":"${ingestSecret}"}'`;
    }
    return line;
  });

  if (changed) {
    writeFileSync(envPath, lines.join("\n"));
    console.log(hadEnv ? "Updated .env (placeholders filled, real values kept)." : "Created .env with fresh secrets.");
  } else {
    console.log(".env already configured — nothing to change.");
  }

  const fileEnv = parseEnvFile(readFileSync(envPath, "utf8"));
  const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("user:pass")) {
    console.log("\nNext: set DATABASE_URL in .env to your Postgres connection string, then run:");
    console.log("  npm run migrate");
    console.log("Then start the app with npm run dev and open /dashboard.");
    return;
  }

  console.log("\nRunning migrations...");
  const result = spawnSync("node", [join(__dirname, "migrate.mjs"), databaseUrl], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.status !== 0) {
    console.error("\nMigrations failed — check DATABASE_URL, then run npm run migrate.");
    process.exit(result.status ?? 1);
  }

  // Print the test curl with the real key so the user can verify instantly.
  const ingestRaw = process.env.BOT_INGEST_TOKENS ?? fileEnv.BOT_INGEST_TOKENS ?? "";
  let hintToken = "";
  const match = /"([^"]+)"\s*:\s*"([^"]{32,})"/.exec(ingestRaw.replace(/^'|'$/g, ""));
  if (match) hintToken = match[2];

  console.log("\nDone. Start the app:");
  console.log("  npm run dev");
  if (hintToken) {
    console.log("\nVerify with one real hit (then refresh /dashboard):");
    console.log(
      `  curl -X POST "http://localhost:3000/api/bot-hit" -H "Authorization: Bearer ${hintToken}" -H "Content-Type: application/json" -d '{"url":"https://example.com/pricing","status_code":200,"user_agent":"GPTBot/1.0"}'`,
    );
  } else {
    console.log("\nOpen /dashboard — the empty screen shows your copy-paste test command.");
  }
}

main();
