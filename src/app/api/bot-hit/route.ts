import { NextResponse } from "next/server";
import { detectBot } from "@/lib/bots";
import { createDbClient } from "@/lib/db";
import type { BotHit } from "@/lib/schema";
import { verifyBot } from "@/lib/verify";
import { getBotLogToken, isStrongSecret, timingSafeCompare } from "@/lib/auth";
import { storedIp } from "@/lib/ip-storage";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

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

const DATABASE_URL = process.env.DATABASE_URL;

type Payload = Record<string, unknown>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(header: string | null) {
  if (!header) return "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token ?? "" : "";
}

function isAuthed(request: Request, botLogToken: string) {
  const headerToken = request.headers.get("x-bot-log-token") ?? "";
  const authorizationToken = bearerToken(request.headers.get("authorization"));
  return timingSafeCompare(headerToken, botLogToken) || timingSafeCompare(authorizationToken, botLogToken);
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
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Payload : {};
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const botLogToken = getBotLogToken();
  if (!DATABASE_URL || !isStrongSecret(botLogToken)) {
    return jsonError("Ingestion is not configured", 503);
  }
  if (!isAuthed(request, botLogToken)) {
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
  const userAgent = text(payload.user_agent, request.headers.get("user-agent") ?? "");
  const match = detectBot(userAgent);

  if (!match && !heartbeat) {
    return NextResponse.json({ stored: false, reason: "not_bot" });
  }

  const ip = text(payload.ip, firstHeaderIp(request), 128);
  const botName = heartbeat ? "Heartbeat" : match?.name ?? "Unknown";
  const botCategory = heartbeat ? "generic" : match?.category ?? "unknown";
  const confidence = heartbeat || !ip ? "ua_only" : await verifyBot(botName, ip);
  const url = text(payload.url);
  const parsedUrl = parseUrl(url);

  const hit: BotHit = {
    project_name: text(payload.project_name || payload.project, "default", 200),
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
    ip: storedIp(ip, botLogToken),
    country: text(payload.country, "", 100),
    region: text(payload.region, "", 100),
    city: text(payload.city, "", 100),
    timezone: text(payload.timezone, "", 100),
    deployment_url: text(payload.deployment_url, "", 300),
    vercel_id: text(payload.vercel_id, "", 300),
    is_api_route: bool(payload.is_api_route),
    sample_rate: numberInRange(payload.sample_rate, 1, 0.001, 1),
    heartbeat,
  };

  const client = createDbClient(DATABASE_URL);
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
