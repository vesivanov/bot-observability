import { NextResponse } from "next/server";
import { detectBot } from "@/lib/bots";
import { createDbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";
import { verifyBot } from "@/lib/verify";
import {
  authenticateIngestion,
  getIngestionConfig,
  getIpHashSecret,
  isStrongSecret,
} from "@/lib/auth";
import { storedIp } from "@/lib/ip-storage";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;
export const ALLOWED_SAMPLE_RATES = [1, 0.5, 0.25, 0.1] as const;

// Per-instance rate limiter — not globally consistent across Vercel instances,
// but prevents burst abuse within a single instance.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_RPM = 120;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  // Evict expired entries when the store grows large
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore) {
      if (now >= v.resetAt) rateLimitStore.delete(k);
    }
  }
  const entry = rateLimitStore.get(key);
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_RPM) return false;
  entry.count++;
  return true;
}
const MAX_STRING_LENGTH = 2000;
const MAX_PATH_LENGTH = 1000;

type Payload = Record<string, unknown>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function text(value: unknown, fallback = "", maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function statusCode(payload: Payload) {
  return Math.round(numberInRange(payload.status_code ?? payload.status, 0, 0, 999));
}

export function normalizeSampleRate(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return ALLOWED_SAMPLE_RATES.find((rate) => rate === parsed) ?? 1;
}

function firstHeaderIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "";
}

function parseUrl(value: string) {
  if (!value) return null;
  try {
    return new URL(value, "https://example.invalid");
  } catch {
    return null;
  }
}

async function readPayload(request: Request): Promise<Payload | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return null;
  try {
    const bodyBytes = await request.arrayBuffer();
    if (bodyBytes.byteLength > MAX_BODY_BYTES) return null;
    const body = JSON.parse(new TextDecoder().decode(bodyBytes)) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? body as Payload : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const databaseUrl = process.env.DATABASE_URL;
  const ipHashSecret = getIpHashSecret();
  const ingestionConfig = getIngestionConfig();
  if (
    !databaseUrl ||
    !isStrongSecret(ipHashSecret) ||
    !ingestionConfig.configured ||
    ingestionConfig.invalid
  ) {
    return jsonError("Ingestion is not configured", 503);
  }

  const identity = authenticateIngestion(request);
  if (!identity) {
    return jsonError("Unauthorized", 401);
  }

  const callerIp =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!checkRateLimit(callerIp)) {
    return jsonError("Rate limit exceeded", 429);
  }

  const payload = await readPayload(request);
  if (!payload) {
    return jsonError("Invalid or too-large JSON payload", 400);
  }

  const heartbeat = bool(payload.heartbeat);
  const submittedProject = text(payload.project_name || payload.project, "default", 200).trim() || "default";
  // New credentials are scoped to one project. The submitted project is
  // accepted only for the legacy migration path.
  const projectName = identity.projectName ?? submittedProject;
  const userAgent = text(payload.user_agent, request.headers.get("user-agent") ?? "");
  const match = heartbeat ? null : detectBot(userAgent);

  if (!match && !heartbeat) {
    return NextResponse.json({ stored: false, reason: "not_bot" });
  }

  const ip = text(payload.ip, firstHeaderIp(request), 128);

  if (heartbeat) {
    const client = createDbClient(databaseUrl);
    try {
      await client.upsertProjectHeartbeat({
        project_name: projectName,
        environment: text(payload.environment, "production", 100),
        deployment_url: text(payload.deployment_url, "", 300),
      });
    } catch (error) {
      console.error("[bot-hit] failed to store heartbeat", error);
      return jsonError("storage_failed", 500);
    } finally {
      await client.close();
    }

    return NextResponse.json({ stored: true, heartbeat: true, project: projectName });
  }

  const botName = heartbeat ? "Heartbeat" : match?.name ?? "Unknown";
  const botCategory = heartbeat ? "generic" : match?.category ?? "unknown";
  const hashedIp = storedIp(ip, ipHashSecret);
  const confidence = !ip ? "ua_only" : await verifyBot(botName, ip, hashedIp);
  const url = text(payload.url);
  const parsedUrl = parseUrl(url);

  const hit: BotHit = {
    project_name: projectName,
    environment: text(payload.environment, "production", 100),
    host: text(payload.host, parsedUrl?.host ?? request.headers.get("host") ?? "", 300),
    path: text(payload.path, parsedUrl?.pathname ?? "/", MAX_PATH_LENGTH),
    query_string: text(payload.query_string, parsedUrl?.search ? parsedUrl.search.slice(1) : "", MAX_STRING_LENGTH),
    method: text(payload.method, "GET", 16).toUpperCase(),
    status_code: statusCode(payload),
    bot_name: botName,
    bot_category: botCategory,
    confidence,
    user_agent: userAgent,
    referer: text(payload.referer, "", MAX_STRING_LENGTH),
    ip: hashedIp,
    country: text(payload.country, "", 100),
    region: text(payload.region, "", 100),
    city: text(payload.city, "", 100),
    timezone: text(payload.timezone, "", 100),
    deployment_url: text(payload.deployment_url, "", 300),
    vercel_id: text(payload.vercel_id, "", 300),
    is_api_route: bool(payload.is_api_route),
    sample_rate: normalizeSampleRate(payload.sample_rate),
    heartbeat,
  };

  const client = createDbClient(databaseUrl);
  try {
    await client.insertHit(hit);
  } catch (error) {
    console.error("[bot-hit] failed to store hit", error);
    return jsonError("storage_failed", 500);
  } finally {
    await client.close();
  }

  return NextResponse.json({
    stored: true,
    bot_name: hit.bot_name,
    bot_category: hit.bot_category,
    confidence: hit.confidence,
  }, { status: 201 });
}
