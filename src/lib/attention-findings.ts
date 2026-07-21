import type { BotConfidenceCount, CategoryCount, NewBot } from "@/lib/schema";

// Pure finding-generation logic extracted out of
// src/components/attention-strip.tsx so it can be unit tested without
// pulling in next/link — the component re-exports this and renders the
// results, so no call sites elsewhere need to change.

export interface PeriodStats {
  total: number;
  errorHits: number;
  knownStatusHits: number;
  categories: CategoryCount[];
  topBotsWithConfidence: BotConfidenceCount[];
  aiBotsWithConfidence: BotConfidenceCount[];
  newBots: NewBot[];
}

export interface Finding {
  key: string;
  text: string;
  href: string;
  tone: "amber" | "rose";
}

function aiShare(stats: PeriodStats): number {
  if (stats.total === 0) return 0;
  const aiHits = stats.categories.filter((c) => c.bot_category.startsWith("ai_")).reduce((sum, c) => sum + c.count, 0);
  return aiHits / stats.total;
}

function scopedHref(base: string, period: string, project?: string): string {
  return `${base}&period=${encodeURIComponent(period)}${project ? `&project=${encodeURIComponent(project)}` : ""}`;
}

// Bots whose bot_first_seen.first_seen falls inside the current window —
// exact (backed by ingest-time upserts), replacing the earlier top-10 diff
// heuristic which could miss/misreport bots outside the top-10 cut.
//
// Surfacing is gated on first_seen timing alone, not on a hit count: hit
// totals here come from topBotsWithConfidence/aiBotsWithConfidence, both
// truncated top-N lists, so a genuinely new bot outside the top 10 (e.g. a
// non-AI bot with modest volume) would resolve to 0 hits via `?? 0` and get
// silently dropped by a hit-count threshold — under-reporting exactly the
// thing this finding exists to catch. The hit count is still shown when we
// happen to have it (bot made a top-N list); otherwise the bot is still
// surfaced, just without a hit count in the label.
function findNewBots(current: PeriodStats, period: string, project?: string): Finding[] {
  const hitsByName = new Map<string, number>();
  for (const bot of [...current.topBotsWithConfidence, ...current.aiBotsWithConfidence]) {
    hitsByName.set(bot.bot_name, Math.max(hitsByName.get(bot.bot_name) ?? 0, bot.total_hits));
  }
  return current.newBots.map((bot) => {
    const totalHits = hitsByName.get(bot.bot_name);
    return {
      key: `new-bot:${bot.bot_name}`,
      text: totalHits !== undefined ? `New: ${bot.bot_name} (${totalHits.toLocaleString()} hits)` : `New: ${bot.bot_name}`,
      href: scopedHref(`/dashboard?view=bots&bot=${encodeURIComponent(bot.bot_name)}`, period, project),
      tone: "amber",
    };
  });
}

export function buildAttentionFindings(params: {
  current: PeriodStats;
  previous: PeriodStats | null;
  trendPercent: number | null;
  period: string;
  project?: string;
}): Finding[] {
  const { current, previous, trendPercent, period, project } = params;
  const findings: Finding[] = [];

  if (previous) {
    findings.push(...findNewBots(current, period, project));

    if (trendPercent !== null && Math.abs(trendPercent) >= 50 && previous.total >= 100) {
      const direction = trendPercent >= 0 ? "up" : "down";
      findings.push({
        key: "traffic-trend",
        text: `Traffic ${direction} ${Math.abs(trendPercent).toFixed(0)}% vs previous period`,
        href: scopedHref("/dashboard?view=overview", period, project),
        tone: "amber",
      });
    }

    const currentErrorRate = current.knownStatusHits > 0 ? current.errorHits / current.knownStatusHits : 0;
    const previousErrorRate = previous.knownStatusHits > 0 ? previous.errorHits / previous.knownStatusHits : 0;
    if (currentErrorRate >= 0.05 && previousErrorRate > 0 && currentErrorRate >= previousErrorRate * 2) {
      findings.push({
        key: "error-rate",
        text: `Error rate ${(currentErrorRate * 100).toFixed(0)}% (was ${(previousErrorRate * 100).toFixed(0)}%)`,
        href: scopedHref("/dashboard?view=health", period, project),
        tone: "rose",
      });
    }

    const currentAiShare = aiShare(current);
    const previousAiShare = aiShare(previous);
    if (currentAiShare >= 0.10 && previousAiShare > 0 && currentAiShare >= previousAiShare * 1.5) {
      findings.push({
        key: "ai-share",
        text: `AI crawlers now ${(currentAiShare * 100).toFixed(0)}% of traffic`,
        href: scopedHref("/dashboard?view=bots&category=ai", period, project),
        tone: "amber",
      });
    }
  }

  return findings.slice(0, 4);
}
