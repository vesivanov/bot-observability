import { describe, expect, it } from "vitest";
import { buildAttentionFindings, type PeriodStats } from "./attention-findings";

// buildAttentionFindings originally lived in
// src/components/attention-strip.tsx, which imports next/link. The pure
// finding-generation logic was extracted to this dependency-light module
// (the component re-exports it) so it's testable here without mocking
// next/link.

function stats(overrides: Partial<PeriodStats> = {}): PeriodStats {
  return {
    total: 0,
    errorHits: 0,
    knownStatusHits: 0,
    categories: [],
    topBotsWithConfidence: [],
    aiBotsWithConfidence: [],
    newBots: [],
    ...overrides,
  };
}

describe("buildAttentionFindings", () => {
  it("produces nothing when there is no previous period", () => {
    const current = stats({ total: 100 });
    const findings = buildAttentionFindings({ current, previous: null, trendPercent: null, period: "7" });
    expect(findings).toEqual([]);
  });

  it("flags a new bot with >=10 hits", () => {
    const current = stats({
      newBots: [{ bot_name: "NewBot", first_seen: "2026-07-15T00:00:00.000Z" }],
      topBotsWithConfidence: [
        { bot_name: "NewBot", bot_category: "generic", total_hits: 15, verified_hits: 5, ua_only_hits: 10, projects: "p1", last_seen: "2026-07-15T00:00:00.000Z" },
      ],
    });
    const previous = stats();
    const findings = buildAttentionFindings({ current, previous, trendPercent: null, period: "7" });
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("new-bot:NewBot");
    expect(findings[0].text).toContain("New:");
    expect(findings[0].text).toContain("15");
  });

  it("still flags a new bot with a low hit count (no hit-count gate)", () => {
    const current = stats({
      newBots: [{ bot_name: "TinyBot", first_seen: "2026-07-15T00:00:00.000Z" }],
      topBotsWithConfidence: [
        { bot_name: "TinyBot", bot_category: "generic", total_hits: 3, verified_hits: 0, ua_only_hits: 3, projects: "p1", last_seen: "2026-07-15T00:00:00.000Z" },
      ],
    });
    const previous = stats();
    const findings = buildAttentionFindings({ current, previous, trendPercent: null, period: "7" });
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("new-bot:TinyBot");
    expect(findings[0].text).toBe("New: TinyBot (3 hits)");
  });

  it("flags a new bot absent from the truncated top-bots/AI lists (no hit count available)", () => {
    // A genuinely new, low-volume, non-AI bot outside the top-10 cut won't
    // appear in either truncated list — first_seen is the only signal we
    // have for it, so it must still be surfaced (without a hit count).
    const current = stats({
      newBots: [{ bot_name: "GhostBot", first_seen: "2026-07-15T00:00:00.000Z" }],
      topBotsWithConfidence: [
        { bot_name: "SomeOtherBot", bot_category: "generic", total_hits: 500, verified_hits: 500, ua_only_hits: 0, projects: "p1", last_seen: "2026-07-15T00:00:00.000Z" },
      ],
      aiBotsWithConfidence: [],
    });
    const previous = stats();
    const findings = buildAttentionFindings({ current, previous, trendPercent: null, period: "7" });
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("new-bot:GhostBot");
    expect(findings[0].text).toBe("New: GhostBot");
  });

  it("flags an error rate that at least doubled and crossed 5%", () => {
    const current = stats({ knownStatusHits: 100, errorHits: 10 }); // 10%
    const previous = stats({ knownStatusHits: 100, errorHits: 2 }); // 2% -> doubled+ and current >= 5%
    const findings = buildAttentionFindings({ current, previous, trendPercent: null, period: "7" });
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("error-rate");
    expect(findings[0].tone).toBe("rose");
  });

  it("does not flag an error rate below threshold or that did not double", () => {
    const belowThreshold = buildAttentionFindings({
      current: stats({ knownStatusHits: 100, errorHits: 3 }), // 3% < 5% floor
      previous: stats({ knownStatusHits: 100, errorHits: 1 }),
      trendPercent: null,
      period: "7",
    });
    expect(belowThreshold).toEqual([]);

    const notDoubled = buildAttentionFindings({
      current: stats({ knownStatusHits: 100, errorHits: 8 }), // 8%
      previous: stats({ knownStatusHits: 100, errorHits: 6 }), // 6% -> current < 2x previous
      trendPercent: null,
      period: "7",
    });
    expect(notDoubled).toEqual([]);
  });

  it("caps findings at 4 even when more conditions are met", () => {
    const current = stats({
      total: 100,
      knownStatusHits: 100,
      errorHits: 10, // 10%, previous 2% -> error-rate finding
      categories: [{ bot_category: "ai_training", count: 20 }], // 20% ai share
      newBots: [
        { bot_name: "Bot1", first_seen: "2026-07-15T00:00:00.000Z" },
        { bot_name: "Bot2", first_seen: "2026-07-15T00:00:00.000Z" },
        { bot_name: "Bot3", first_seen: "2026-07-15T00:00:00.000Z" },
        { bot_name: "Bot4", first_seen: "2026-07-15T00:00:00.000Z" },
      ],
      topBotsWithConfidence: ["Bot1", "Bot2", "Bot3", "Bot4"].map((name) => ({
        bot_name: name,
        bot_category: "generic",
        total_hits: 12,
        verified_hits: 0,
        ua_only_hits: 12,
        projects: "p1",
        last_seen: "2026-07-15T00:00:00.000Z",
      })),
    });
    const previous = stats({
      total: 200,
      knownStatusHits: 100,
      errorHits: 2, // 2%
      categories: [{ bot_category: "ai_training", count: 5 }], // 2.5% ai share
    });

    const findings = buildAttentionFindings({ current, previous, trendPercent: 60, period: "7" });
    expect(findings.length).toBeLessThanOrEqual(4);
    expect(findings).toHaveLength(4);
  });
});
