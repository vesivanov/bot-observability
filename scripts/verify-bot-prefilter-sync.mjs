import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(process.cwd(), "..");
const centralRoot = process.cwd();

function readExportedPattern(file) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/export const LIKELY_BOT_UA_PATTERN = "([^"]+)";/);
  if (!match) throw new Error(`Could not find LIKELY_BOT_UA_PATTERN in ${file}`);
  return match[1];
}

function readInlineMatcher(file) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/key: "user-agent", value: "([^"]+)"/);
  if (!match) throw new Error(`Could not find the user-agent matcher in ${file}`);
  return match[1];
}

const centralPattern = readExportedPattern(resolve(centralRoot, "src/lib/bots.ts"));
const checks = [
  [resolve(workspaceRoot, "digital-employee-smb/src/lib/bot-prefilter.ts"), readExportedPattern],
  [resolve(workspaceRoot, "digital-employee-smb/src/proxy.ts"), readInlineMatcher],
  [resolve(workspaceRoot, "vesivanov.com/vesivanov-nextjs/lib/bot-prefilter.ts"), readExportedPattern],
  [resolve(workspaceRoot, "vesivanov.com/vesivanov-nextjs/proxy.ts"), readInlineMatcher],
  [resolve(workspaceRoot, "garaxe/bot-prefilter.js"), readExportedPattern],
];

const mismatches = checks
  .filter(([file, reader]) => reader(file) !== centralPattern)
  .map(([file]) => file);

if (mismatches.length > 0) {
  console.error("Bot prefilter drift detected:");
  for (const file of mismatches) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Bot prefilter is synchronized across ${checks.length + 1} copies.`);
