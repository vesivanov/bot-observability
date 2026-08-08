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

const centralBotsSource = readFileSync(resolve(centralRoot, "src/lib/bots.ts"), "utf8");
const patternsSource = centralBotsSource.slice(
  centralBotsSource.indexOf("export const PATTERNS"),
  centralBotsSource.indexOf("export const LIKELY_BOT_UA_PATTERN"),
);
const patternNames = Array.from(patternsSource.matchAll(/\{ name: "([^"]+)"/g), (match) => match[1]);
const UA_TOKEN_OVERRIDES = {
  Slack: "Slackbot-LinkExpanding",
  facebook: "facebookexternalhit",
  HubSpot: "HubSpot Crawler",
  AdsBot: "AdsBot-Google",
  InternetArchive: "archive.org_bot",
  Anthropic: "anthropic-ai",
  LinkedIn: "LinkedInBot",
  Discord: "Discordbot",
  Telegram: "TelegramBot",
  Skype: "SkypeUriPreview",
  Snapchat: "Snapchat Scraper",
};

function syntheticUa(name) {
  const token = UA_TOKEN_OVERRIDES[name] ?? name;
  return `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ${token}/1.0; +https://example.com/`;
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

const fixtureFailures = [];
for (const [file, reader] of [[resolve(centralRoot, "src/lib/bots.ts"), readExportedPattern], ...checks]) {
  const pattern = new RegExp(reader(file));
  for (const name of patternNames) {
    const ua = syntheticUa(name);
    if (!pattern.test(ua)) fixtureFailures.push(`${file}: ${name}`);
  }
  if (pattern.test("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15")) {
    fixtureFailures.push(`${file}: ordinary browser matched`);
  }
}

if (fixtureFailures.length > 0) {
  console.error("Bot prefilter fixture failures:");
  for (const failure of fixtureFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Bot prefilter is synchronized and passes ${patternNames.length} fixtures across ${checks.length + 1} copies.`);
