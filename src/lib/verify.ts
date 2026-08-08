import type { Confidence } from "./schema";
import { TtlCache } from "./cache";
import { createHash } from "crypto";

const VERIFICATION_TTL_MS = 5 * 60_000;
const verificationCache = new TtlCache(4096);

const VERIFIED_IPS: Map<string, string[]> = new Map([
  ["Googlebot", ["googlebot.com", "google.com"]],
  ["Bingbot", ["search.msn.com"]],
  ["Applebot", ["applebot.apple.com"]],
  ["Applebot-Extended", ["applebot.apple.com"]],
  ["ClaudeBot", ["anthropic.com"]],
  ["GPTBot", ["openai.com"]],
]);

// Derived from VERIFIED_IPS so the two can never desync
export const VERIFIABLE_BOTS = new Set(VERIFIED_IPS.keys());

export function isHostnameInDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, "");
  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

function buildPtrName(ip: string): string | null {
  if (ip.includes(".")) {
    // IPv4: reverse octets and append .in-addr.arpa
    return ip.split(".").reverse().join(".") + ".in-addr.arpa";
  }
  if (ip.includes(":")) {
    // IPv6: expand to full 32 hex nibbles, reverse, append .ip6.arpa
    const parts = ip.split("::");
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const groups = [...left, ...Array(missing).fill("0"), ...right];
    if (groups.length !== 8) return null;
    const nibbles = groups.flatMap((g) => g.padStart(4, "0").split(""));
    return nibbles.reverse().join(".") + ".ip6.arpa";
  }
  return null;
}

export async function verifyBot(
  botName: string,
  ip: string,
  cacheKey = ip,
): Promise<Confidence> {
  if (!VERIFIABLE_BOTS.has(botName)) return "ua_only";

  const stableCacheKey = cacheKey === ip
    ? createHash("sha256").update(ip).digest("hex")
    : cacheKey;
  const key = `bot-verification:${botName}:${stableCacheKey}`;
  const cached = verificationCache.get<Confidence>(key);
  if (cached) return cached;

  const domains = VERIFIED_IPS.get(botName);
  let result: Confidence = "ua_only";
  if (domains) {
    try {
      const ptrName = buildPtrName(ip);
      if (ptrName) {
        const hostnames = await resolvePTR(ptrName);
        for (const hostname of hostnames) {
          for (const domain of domains) {
            if (isHostnameInDomain(hostname, domain)) {
              // Forward-confirm: hostname must resolve back to the original IP
              // (FCrDNS — prevents spoofing via attacker-controlled PTR records)
              const forwardIps = ip.includes(":")
                ? await resolveAAAA(hostname)
                : await resolveA(hostname);
              if (forwardIps.includes(ip)) {
                result = "verified";
                break;
              }
            }
          }
          if (result === "verified") break;
        }
      }
    } catch {
      // fall through
    }
  }

  verificationCache.set(key, result, VERIFICATION_TTL_MS);
  return result;
}

async function dnsLookup(hostname: string, type: "A" | "AAAA"): Promise<string[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`,
      { signal: controller.signal },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { Answer?: { data: string }[] };
    return data.Answer?.map((a) => a.data) ?? [];
  } catch {
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const resolveA    = (h: string) => dnsLookup(h, "A");
const resolveAAAA = (h: string) => dnsLookup(h, "AAAA");

async function resolvePTR(ptrName: string): Promise<string[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(ptrName)}&type=PTR`,
      { signal: controller.signal },
    );
    if (!response.ok) return [];

    const data = (await response.json()) as { Answer?: { data: string }[] };
    return data.Answer?.map((a) => a.data.replace(/\.$/, "")) ?? [];
  } catch {
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
