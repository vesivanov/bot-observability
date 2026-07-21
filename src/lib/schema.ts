export type BotCategory =
  | "ai_training"
  | "ai_search"
  | "ai_agent"
  | "ai_crawler"
  | "search_crawler"
  | "seo_crawler"
  | "social_preview"
  | "generic"
  | "unknown";

export type Confidence = "verified" | "ua_only";

// Pure helper (no DB dependency) so it can be unit tested and reused by both
// ingestion (rollup upsert) and future callers without importing src/lib/db.ts.
export function statusClassOf(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500) return "5xx";
  return "unknown";
}

export interface BotHit {
  id?: string;
  created_at?: Date;
  project_name: string;
  environment: string;
  host: string;
  path: string;
  query_string: string;
  method: string;
  status_code: number;
  bot_name: string;
  bot_category: BotCategory;
  confidence: Confidence;
  user_agent: string;
  referer: string;
  ip: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
  deployment_url: string;
  vercel_id: string;
  is_api_route: boolean;
  sample_rate: number;
  heartbeat: boolean;
}

export interface BotHitRow {
  id: string;
  created_at: string;
  project_name: string;
  environment: string;
  host: string;
  path: string;
  query_string: string;
  method: string;
  status_code: number;
  bot_name: string;
  bot_category: BotCategory;
  confidence: Confidence;
  user_agent: string;
  referer: string;
  ip: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
  deployment_url: string;
  vercel_id: string;
  is_api_route: boolean;
  sample_rate: number;
  heartbeat: boolean;
}

export interface BotCount {
  bot_name: string;
  bot_category: BotCategory;
  count: number;
}

export interface PageCount {
  path: string;
  count: number;
}

export interface ProjectSummary {
  project: string;
  total_hits: number;
  ai_hits: number;
  verified_hits: number;
  ua_only_hits: number;
  top_bot: string;
  top_page: string;
  last_seen: string;
}

export interface StatusSummary {
  total_hits: number;
  known_status_hits: number;
  success_hits: number;
  redirect_hits: number;
  client_error_hits: number;
  server_error_hits: number;
  unknown_status_hits: number;
  api_route_hits: number;
  sensitive_path_hits: number;
  ua_only_hits: number;
}

export interface StatusBucket {
  status_class: string;
  count: number;
}

export interface DailyStatusCount {
  date: string;
  status_class: string;
  count: number;
}

export interface StatusCodeCount {
  status_code: number;
  count: number;
  top_project: string;
  top_bot: string;
  top_path: string;
  last_seen: string;
}

export interface ProjectStatusBreakdown {
  project: string;
  status_code: number;
  count: number;
  top_bot: string;
  top_path: string;
  last_seen: string;
}

export interface BotStatusCodeCount {
  bot_name: string;
  bot_category: BotCategory;
  status_code: number;
  count: number;
  top_project: string;
  top_path: string;
  last_seen: string;
}

export interface PageStatusCodeCount {
  project: string;
  path: string;
  status_code: number;
  count: number;
  top_bot: string;
  last_seen: string;
}

export interface FailingPath {
  project: string;
  path: string;
  status_code: number;
  count: number;
  top_bot: string;
  last_seen: string;
}

export interface BotStatusBreakdown {
  bot_name: string;
  bot_category: BotCategory;
  total_hits: number;
  error_hits: number;
  ua_only_hits: number;
  top_status_code: number;
  last_seen: string;
}

export interface SensitivePathHit {
  project: string;
  path: string;
  count: number;
  top_bot: string;
  last_seen: string;
}

export interface BotConfidenceCount {
  bot_name: string;
  bot_category: BotCategory;
  total_hits: number;
  verified_hits: number;
  ua_only_hits: number;
  projects: string;
  last_seen: string;
}

export interface ProjectPageCount {
  project: string;
  path: string;
  count: number;
  top_bot: string;
  last_seen: string;
}

export interface CategoryCount {
  bot_category: BotCategory;
  count: number;
}

export interface Mover {
  key: string;
  label: string;
  project: string;
  current_count: number;
  previous_count: number;
  delta: number;
}

export interface BotDetailReport {
  bot_name: string;
  bot_category: BotCategory;
  total_hits: number;
  verified_hits: number;
  ua_only_hits: number;
  projects_hit: number;
  top_project: string;
  top_page: string;
  last_seen: string;
  first_seen: string;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface DailyCategoryCount {
  date: string;
  bot_category: BotCategory;
  count: number;
}

export interface BotPeriodCount {
  period: string;
  bot_name: string;
  bot_category: BotCategory;
  count: number;
}

export interface BotDetail {
  bot_name: string;
  bot_category: BotCategory;
  total_hits: number;
  verified_hits: number;
  projects: string;
  last_seen: string;
}

// Rollup-backed variant of BotDetail (long-range views) — adds first_seen,
// sourced from bot_first_seen rather than MIN(created_at) on raw rows.
export interface RollupBotDetail extends BotDetail {
  first_seen: string;
}

export interface NewBot {
  bot_name: string;
  first_seen: string;
}

export interface HourlyCount {
  hour: number;
  count: number;
}
