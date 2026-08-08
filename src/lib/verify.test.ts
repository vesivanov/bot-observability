import { describe, expect, it, vi } from "vitest";
import { isHostnameInDomain, verifyBot } from "./verify";

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
