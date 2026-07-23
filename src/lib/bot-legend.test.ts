import { describe, expect, it } from "vitest";
import { getBotLegend, LEGEND_GROUPS } from "./bot-legend";
import { PATTERNS } from "./bots";

describe("getBotLegend", () => {
  it("resolves a hover description for every bots.ts PATTERNS[].name", () => {
    // Regression guard for the "only ~45 of 115 bots resolve to a hover
    // description" bug: getBotLegend used to be built by parsing the free
    // -text `examples` prose in LEGEND_GROUPS, whose marketing names
    // ("Ahrefs", "Semrush", "Facebook") don't match the canonical
    // PATTERNS[].name tokens ("AhrefsBot", "SemrushBot", "facebook"). We
    // require ALL PATTERNS entries (not just AI/SEO/search/social) to
    // resolve, including generic tools like axios/okhttp — every bot name
    // detectBot() can emit from a fixed pattern should have a description.
    const missing = PATTERNS.filter((p) => getBotLegend(p.name) === null).map((p) => p.name);
    expect(missing).toEqual([]);
  });

  it("returns null for a name with no known legend", () => {
    expect(getBotLegend("SomeBrandNewBotNobodyMappedYet")).toBeNull();
  });

  it("resolves each PATTERNS entry to a legend whose group matches a LEGEND_GROUPS label", () => {
    const groupLabels = new Set(LEGEND_GROUPS.map((g) => g.label));
    for (const p of PATTERNS) {
      const legend = getBotLegend(p.name);
      expect(legend).not.toBeNull();
      expect(groupLabels.has(legend!.groupLabel)).toBe(true);
      expect(legend!.what.length).toBeGreaterThan(0);
      expect(legend!.impact.length).toBeGreaterThan(0);
    }
  });

  it("does not present Claude-Web as equivalent to Claude-User", () => {
    const claudeUser = getBotLegend("Claude-User");
    const claudeWeb = getBotLegend("Claude-Web");
    expect(claudeUser).not.toBeNull();
    expect(claudeWeb).not.toBeNull();
    expect(claudeWeb!.subLabel).not.toBe(claudeUser!.subLabel);
    expect(claudeWeb!.what.toLowerCase()).toContain("deprecated");
  });

  it("describes GoogleOther without asserting an AI-training purpose", () => {
    const legend = getBotLegend("GoogleOther");
    expect(legend).not.toBeNull();
    expect(legend!.groupLabel).not.toBe("AI Training");
    // Should disclaim/hedge rather than assert AI training as the purpose
    // (contrast with e.g. GPTBot's "Crawls your site to collect training
    // data for..." phrasing).
    const what = legend!.what.toLowerCase();
    expect(what).not.toContain("collect training data");
    expect(what).toMatch(/not (publicly documented|confirmed)/);
  });

  it("resolves the new Meta-ExternalFetcher agent bot", () => {
    const legend = getBotLegend("Meta-ExternalFetcher");
    expect(legend).not.toBeNull();
    expect(legend!.groupLabel).toBe("AI Agent");
  });

  it("resolves meta-webindexer under AI Search, not AI Training", () => {
    const legend = getBotLegend("meta-webindexer");
    expect(legend).not.toBeNull();
    expect(legend!.groupLabel).toBe("AI Search");
  });

  it("resolves the monitoring bots promoted out of Generic under the Monitoring group", () => {
    // Regression guard for the "generic" -> "monitoring" category split: a
    // revert that put these back under Generic/CLI would still pass the
    // "every PATTERNS name resolves" test above, since Generic is also a
    // valid group — only an assertion on the specific group catches it.
    const names = ["Pingdom", "UptimeRobot", "Datadog", "NewRelic", "GTmetrix", "WebPageTest"];
    for (const name of names) {
      const legend = getBotLegend(name);
      expect(legend, `expected a legend entry for ${name}`).not.toBeNull();
      expect(legend!.groupLabel).toBe("Monitoring");
    }
  });
});
