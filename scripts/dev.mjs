// `npm run dev` entry: apply migrations when a database is configured,
// then start the Next dev server.
//
// - No DATABASE_URL (env or .env): migrations are skipped quietly so the
//   landing-page preview works with zero setup.
// - DATABASE_URL present: migrations run first. A migration failure prints
//   a warning but the dev server still boots, so a typo'd URL never blocks
//   the landing page — the dashboard surfaces the real error on query.

import { loadEnv } from "./env.mjs";
import { spawnSync, spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

loadEnv();

if (process.env.DATABASE_URL) {
  const result = spawnSync("node", [join(__dirname, "migrate.mjs")], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0) {
    console.warn("[dev] migrations failed — starting dev server anyway (dashboard will show the DB error).");
  }
} else {
  console.log("[dev] no DATABASE_URL set — skipping migrations (landing preview works without a database).");
}

const next = spawn("npx", ["next", "dev"], { stdio: "inherit", cwd: root, env: process.env });
next.on("exit", (code) => process.exit(code ?? 0));
