import type { BotCategory } from "./schema";

// Exported for reuse (e.g. future dedupe against bots.ts PATTERNS categories)
// in addition to their use below by normalizeBotCategory. These sets are
// LEGACY-ROW-REMAP ONLY: they exist so old DB rows persisted with the
// generic "ai_crawler" category (before per-bot categories existed) still
// resolve to the right specific category. Every PATTERNS[].name in bots.ts
// sets its real category directly and never uses "ai_crawler" — see the
// "PATTERNS entries never use the legacy ai_crawler category" guard test in
// bots.test.ts.
export const AI_SEARCH_BOTS = new Set([
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Gemini-Deep-Research",
  "DuckAssistBot",
  "YouBot",
  "Cloudflare-AI-Search",
  // Per Meta's docs, Meta-WebIndexer is an AI-search index crawler (peer of
  // OAI-SearchBot/Claude-SearchBot), not a training crawler — see bots.ts.
  "meta-webindexer",
]);

export const AI_AGENT_BOTS = new Set([
  "ChatGPT-User",
  "Claude-User",
  "Claude-Web",
  "claude-code",
  "Perplexity-User",
  "GoogleAgent",
  "Google-NotebookLM",
  "MistralAI-User",
  // Meta's user-triggered, on-demand fetcher (peer of ChatGPT-User /
  // Claude-User / Perplexity-User) — see bots.ts.
  "Meta-ExternalFetcher",
]);

export const CATEGORY_ORDER = [
  "ai_training",
  "ai_search",
  "ai_agent",
  "ai_crawler",
  "search_crawler",
  "seo_crawler",
  "social_preview",
  "generic",
  "unknown",
] as const;

export const CATEGORY_META: Record<string, {
  label: string;
  shortLabel: string;
  color: string;
  chip: string;
  bar: string;
  dot: string;
  text: string;
  bg: string;
  fill: string;
}> = {
  ai_training: {
    label: "AI training",
    shortLabel: "AI training",
    color: "#fbbf24",
    chip: "border-amber-700/45 bg-amber-950/20 text-amber-200",
    bar: "bg-amber-400",
    dot: "bg-amber-300",
    text: "text-amber-200",
    bg: "bg-amber-400",
    fill: "rgba(251, 191, 36, VAR)",
  },
  ai_search: {
    label: "AI search",
    shortLabel: "AI search",
    color: "#818cf8",
    chip: "border-indigo-700/45 bg-indigo-950/25 text-indigo-200",
    bar: "bg-indigo-400",
    dot: "bg-indigo-300",
    text: "text-indigo-200",
    bg: "bg-indigo-400",
    fill: "rgba(129, 140, 248, VAR)",
  },
  ai_agent: {
    label: "AI agent",
    shortLabel: "AI agent",
    color: "#10b981",
    chip: "border-emerald-700/70 bg-emerald-950/40 text-emerald-200",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500",
    fill: "rgba(16, 185, 129, VAR)",
  },
  ai_crawler: {
    label: "AI crawler",
    shortLabel: "AI legacy",
    color: "#a8a29e",
    chip: "border-stone-700/55 bg-stone-950/30 text-stone-200",
    bar: "bg-stone-400",
    dot: "bg-stone-300",
    text: "text-stone-200",
    bg: "bg-stone-400",
    fill: "rgba(168, 162, 158, VAR)",
  },
  search_crawler: {
    label: "Search",
    shortLabel: "Search",
    color: "#0ea5e9",
    chip: "border-sky-700/70 bg-sky-950/40 text-sky-200",
    bar: "bg-sky-500",
    dot: "bg-sky-400",
    text: "text-sky-300",
    bg: "bg-sky-500",
    fill: "rgba(14, 165, 233, VAR)",
  },
  seo_crawler: {
    label: "SEO",
    shortLabel: "SEO",
    color: "#f97316",
    chip: "border-orange-700/70 bg-orange-950/40 text-orange-200",
    bar: "bg-orange-500",
    dot: "bg-orange-400",
    text: "text-orange-300",
    bg: "bg-orange-500",
    fill: "rgba(249, 115, 22, VAR)",
  },
  social_preview: {
    label: "Social preview",
    shortLabel: "Social",
    color: "#e879f9",
    chip: "border-fuchsia-800/45 bg-fuchsia-950/20 text-fuchsia-200",
    bar: "bg-fuchsia-400",
    dot: "bg-fuchsia-300",
    text: "text-fuchsia-200",
    bg: "bg-fuchsia-400",
    fill: "rgba(232, 121, 249, VAR)",
  },
  generic: {
    label: "Generic",
    shortLabel: "Generic",
    color: "#71717a",
    chip: "border-neutral-700 bg-neutral-900 text-neutral-400",
    bar: "bg-zinc-500",
    dot: "bg-zinc-400",
    text: "text-zinc-300",
    bg: "bg-zinc-500",
    fill: "rgba(113, 113, 122, VAR)",
  },
  unknown: {
    label: "Unknown",
    shortLabel: "Unknown",
    color: "#525252",
    chip: "border-neutral-500/20 bg-neutral-500/10 text-neutral-400",
    bar: "bg-neutral-500",
    dot: "bg-neutral-500",
    text: "text-neutral-400",
    bg: "bg-neutral-600",
    fill: "rgba(82, 82, 82, VAR)",
  },
};

export function normalizeBotCategory(botName: string, category: string): BotCategory {
  if (category !== "ai_crawler") return category as BotCategory;
  if (AI_AGENT_BOTS.has(botName)) return "ai_agent";
  if (AI_SEARCH_BOTS.has(botName)) return "ai_search";
  return "ai_training";
}

export function categoryLabel(category: string) {
  return CATEGORY_META[category]?.label ?? category.replace("_", " ");
}

export function categoryShortLabel(category: string) {
  return CATEGORY_META[category]?.shortLabel ?? categoryLabel(category);
}

export function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.unknown;
}

export function sortCategories(categories: string[], totals?: Map<string, number>) {
  return [...categories].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
    const bIndex = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
    const aKnown = aIndex >= 0;
    const bKnown = bIndex >= 0;
    if (aKnown && bKnown && aIndex !== bIndex) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return (totals?.get(b) ?? 0) - (totals?.get(a) ?? 0);
  });
}
