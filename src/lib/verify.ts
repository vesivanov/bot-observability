import type { Confidence } from "./schema";

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
): Promise<Confidence> {
  if (!VERIFIABLE_BOTS.has(botName)) return "ua_only";

  const domains = VERIFIED_IPS.get(botName);
  if (domains) {
    try {
      const ptrName = buildPtrName(ip);
      if (!ptrName) return "ua_only";
      const hostnames = await resolvePTR(ptrName);
      for (const hostname of hostnames) {
        for (const domain of domains) {
          if (hostname.endsWith(domain)) {
            // Forward-confirm: hostname must resolve back to the original IP
            // (FCrDNS — prevents spoofing via attacker-controlled PTR records)
            const forwardIps = ip.includes(":")
              ? await resolveAAAA(hostname)
              : await resolveA(hostname);
            if (forwardIps.includes(ip)) return "verified";
          }
        }
      }
    } catch {
      // fall through
    }
  }

  return "ua_only";
}

async function dnsLookup(hostname: string, type: "A" | "AAAA"): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!response.ok) return [];
    const data = (await response.json()) as { Answer?: { data: string }[] };
    return data.Answer?.map((a) => a.data) ?? [];
  } catch {
    return [];
  }
}

const resolveA    = (h: string) => dnsLookup(h, "A");
const resolveAAAA = (h: string) => dnsLookup(h, "AAAA");

async function resolvePTR(ptrName: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(ptrName)}&type=PTR`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = (await response.json()) as { Answer?: { data: string }[] };
    return data.Answer?.map((a) => a.data.replace(/\.$/, "")) ?? [];
  } catch {
    return [];
  }
}
