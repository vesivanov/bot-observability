import { createHmac } from "crypto";
import { isStrongSecret } from "./auth";

export function storedIp(ip: string, token: string): string {
  if (!ip) return "";
  if (!isStrongSecret(token)) {
    throw new Error("BOT_LOG_TOKEN must be at least 32 characters");
  }
  return createHmac("sha256", token)
    .update(`bot-observability:ip:v1:${ip}`)
    .digest("hex");
}
