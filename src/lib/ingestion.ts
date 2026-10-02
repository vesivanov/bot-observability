import { isIP } from "node:net";
import { sanitizeQuery, sanitizeReferer } from "./url-privacy";
import { NextResponse } from "next/server";
import { detectBot } from "@/lib/bots";
import { getRequestDb } from "@/lib/request-db";
import type { BotHit } from "@/lib/schema";
import { verifyBot } from "@/lib/verify";
import {
  authenticateIngestion,
  getIngestionConfig,
  getIpHashSecret,
  isStrongSecret,
} from "@/lib/auth";
import { storedIp } from "@/lib/ip-storage";
import { normalizeSampleRate } from "@/lib/sampling";


const MAX_BODY_BYTES = 32 * 1024;

// Per-instance rate limiter — not globally consistent across Vercel instances,
// but prevents burst abuse within a single instance.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function botQuota() {
  const value = Number(process.env.BOT_EVENT_RPM ?? 120);
  return Number.isSafeInteger(value) && value > 0 ? value : 120;
}
const RATE_WINDOW_MS = 60_000;
function checkRateLimit(key: string, allowance: number): boolean {
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
  if (entry.count >= allowance) return false;
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
  const status = Math.round(numberInRange(payload.status_code ?? payload.status, 0, 0, 999));
  return status >= 200 && status < 600 ? status : 0;
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

export async function ingestRequest(request: Request) {
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
  const probe = payload.probe === "connection";
  // Reported bot_name/category are compatibility hints only; UA is authoritative.
  const match = heartbeat || probe ? null : detectBot(userAgent);

  if (!match && !heartbeat && !probe) {
    return NextResponse.json({ stored: false, reason: "not_bot" });
  }

  const quotaKey = `${heartbeat || probe ? "control" : "bot"}:${projectName}`;
  if (!checkRateLimit(quotaKey, heartbeat || probe ? 30 : botQuota())) {
    return NextResponse.json({ error: "project_quota_exceeded" }, {
      status: 429, headers: { "Retry-After": "60" },
    });
  }

  // Only a sender-supplied original client IP is evidence; transport IP is not.
  const submittedIp = text(payload.ip, "", 128);
  const ip = isIP(submittedIp) ? submittedIp : "";
  if (probe) {
    try {
      await getRequestDb(databaseUrl).recordConnectionReceipt(projectName, "probe");
      return NextResponse.json({ received: true, probe: "connection", project: projectName });
    } catch (error) {
      console.error("[bot-hit] failed to record probe", error);
      return jsonError("storage_failed", 500);
    }
  }

  if (heartbeat) {
    const client = getRequestDb(databaseUrl);
    try {
      await client.upsertProjectHeartbeat({
        project_name: projectName,
        environment: text(payload.environment, "production", 100),
        deployment_url: text(payload.deployment_url, "", 300),
      });
    } catch (error) {
      console.error("[bot-hit] failed to store heartbeat", error);
      return jsonError("storage_failed", 500);
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
    path: text(payload.path, parsedUrl?.pathname ?? "/", MAX_PATH_LENGTH).split(/[?#]/)[0] || "/",
    query_string: sanitizeQuery(text(payload.query_string, parsedUrl?.search ? parsedUrl.search.slice(1) : "", MAX_STRING_LENGTH)),
    method: text(payload.method, "GET", 16).toUpperCase(),
    status_code: statusCode(payload),
    bot_name: botName,
    bot_category: botCategory,
    confidence,
    user_agent: userAgent,
    referer: sanitizeReferer(text(payload.referer, "", MAX_STRING_LENGTH)),
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

  const client = getRequestDb(databaseUrl);
  try {
    await client.insertHit(hit);
  } catch (error) {
    console.error("[bot-hit] failed to store hit", error);
    return jsonError("storage_failed", 500);
  }

  return NextResponse.json({
    stored: true,
    bot_name: hit.bot_name,
    bot_category: hit.bot_category,
    confidence: hit.confidence,
  }, { status: 201 });
}
