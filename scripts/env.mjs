import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function parseEnvFile(content) {
  const values = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const equals = trimmed.indexOf("=");
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[trimmed.slice(0, equals).trim()] = value;
  }
  return values;
}

export function loadEnv() {
  const path = fileURLToPath(new URL("../.env", import.meta.url));
  if (!existsSync(path)) return;
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(path, "utf8")))) {
    if (!process.env[key]) process.env[key] = value;
  }
}
