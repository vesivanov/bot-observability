import { describe, expect, it, vi } from "vitest";
import { ipMatchesCidr, isHostnameInDomain, verifyBot } from "./verify";
import { BOT_RANGES } from "./bot-ranges.generated";

describe("DNS hostname verification", () => {
  it("accepts the registered domain and legitimate subdomains", () => {
    expect(isHostnameInDomain("google.com", "google.com")).toBe(true);
    expect(isHostnameInDomain("crawl.google.com", "google.com")).toBe(true);
    expect(isHostnameInDomain("crawl.google.com.", "GOOGLE.COM.")).toBe(true);
  });

  it("rejects lookalike suffixes without a DNS-label boundary", () => {
    expect(isHostnameInDomain("notgoogle.com", "google.com")).toBe(false);
    expect(isHostnameInDomain("google.com.attacker.example", "google.com")).toBe(false);
  });

  it("forward-confirms a legitimate PTR result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("type=PTR")) {
        return new Response(JSON.stringify({ Answer: [{ data: "crawl.google.com." }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ Answer: [{ data: "66.249.66.1" }] }), { status: 200 });
    });

    try {
      expect(await verifyBot("Googlebot", "66.249.66.1", "test-googlebot-legitimate")).toBe("verified");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not forward-resolve a lookalike PTR hostname", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ Answer: [{ data: "notgoogle.com." }] }), { status: 200 }),
    );

    try {
      expect(await verifyBot("Googlebot", "66.249.66.2", "test-googlebot-lookalike")).toBe("ua_only");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("Published-range verification (OpenAI, Anthropic, Perplexity)", () => {
  it("verifies a PerplexityBot hit inside its published list without any DNS call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      expect(await verifyBot("PerplexityBot", "18.97.9.100", "test-perplexity-in-range")).toBe("verified");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects a claimed AI crawler from an address outside every published list", async () => {
    expect(await verifyBot("GPTBot", "203.0.113.7", "test-gptbot-documentation-range")).toBe("ua_only");
    expect(await verifyBot("ClaudeBot", "8.8.8.8", "test-claudebot-foreign")).toBe("ua_only");
  });

  it("never again ships a catch-all block as an operator range", () => {
    const all = Object.values(BOT_RANGES).flat();
    expect(all).not.toContain("20.0.0.0/8");
    expect(all).not.toContain("144.76.0.0/16");
  });

  it("handles CIDR maths for both address families and bad input", () => {
    expect(ipMatchesCidr("132.196.86.5", "132.196.86.0/24")).toBe(true);
    expect(ipMatchesCidr("132.196.87.5", "132.196.86.0/24")).toBe(false);
    expect(ipMatchesCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(ipMatchesCidr("2606:4700::1", "2606:4700::/32")).toBe(true);
    expect(ipMatchesCidr("2606:4701::1", "2606:4700::/32")).toBe(false);
    expect(ipMatchesCidr("not-an-ip", "1.2.3.0/24")).toBe(false);
    expect(ipMatchesCidr("1.2.3.4", "1.2.3.0/99")).toBe(false);
  });
});
