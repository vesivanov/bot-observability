import type { Confidence } from "./schema";
import { TtlCache } from "./cache";
import { createHash } from "crypto";
import { BOT_RANGES } from "./bot-ranges.generated";

const VERIFICATION_TTL_MS = 5 * 60_000;
const verificationCache = new TtlCache(4096);

const VERIFIED_IPS: Map<string, string[]> = new Map([
  ["Googlebot", ["googlebot.com", "google.com"]],
  ["Bingbot", ["search.msn.com"]],
  ["Applebot", ["applebot.apple.com"]],
]);

/**
 * Bots whose identity we can actually check, and how:
 *   · reverse DNS + forward confirm — Googlebot, Bingbot, Applebot
 *   · operator-published CIDR list — OpenAI, Anthropic and Perplexity crawlers
 *
 * Anything else stays `ua_only`: a claimed identity we do not verify. That is
 * not the same as fake, and the distinction must survive in the dashboard.
 */
export const VERIFIABLE_BOTS = new Set<string>([
  ...VERIFIED_IPS.keys(),
  ...Object.keys(BOT_RANGES),
]);

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

  // Operators that publish IP ranges instead of reverse DNS (OpenAI, Anthropic,
  // Perplexity) cannot be checked by hostname, so fall through to their list.
  if (result !== "verified") {
    const ranges = BOT_RANGES[botName];
    if (ranges?.some((cidr) => ipMatchesCidr(ip, cidr))) result = "verified";
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

/**
 * CIDR membership for IPv4 and IPv6 without a dependency.
 * Returns false for anything unparseable rather than throwing, because this
 * runs inside the request path for every hit.
 */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split("/");
  if (!network || bitsRaw === undefined) return false;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits)) return false;

  const toBytes = (value: string): number[] | null => {
    if (!value.includes(":")) {
      const parts = value.split(".");
      if (parts.length !== 4) return null;
      const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
      return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
    }
    const [head, tail] = value.split("::");
    const left = head ? head.split(":") : [];
    const right = tail !== undefined && tail ? tail.split(":") : [];
    if (tail === undefined && left.length !== 8) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const groups = tail === undefined ? left : [...left, ...new Array(missing).fill("0"), ...right];
    if (groups.length !== 8) return null;
    const bytes: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      const n = parseInt(g, 16);
      bytes.push((n >> 8) & 0xff, n & 0xff);
    }
    return bytes;
  };

  const ipBytes = toBytes(ip);
  const netBytes = toBytes(network);
  if (!ipBytes || !netBytes || ipBytes.length !== netBytes.length) return false;
  if (bits < 0 || bits > ipBytes.length * 8) return false;

  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (ipBytes[i] !== netBytes[i]) return false;
  }
  const remainder = bits % 8;
  if (remainder === 0) return true;
  const mask = 0xff << (8 - remainder) & 0xff;
  return (ipBytes[fullBytes] & mask) === (netBytes[fullBytes] & mask);
}
