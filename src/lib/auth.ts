import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const LOGIN_RATE_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;
const SESSION_VERSION = "v1";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

export const SESSION_COOKIE_NAME = "bot_session";
export const LEGACY_COOKIE_NAME = "bot_token";

const store = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function checkLoginRateLimit(request: Request): boolean {
  const key = getClientIp(request);
  const now = Date.now();
  if (store.size > 1000) {
    for (const [k, v] of store) {
      if (now >= v.resetAt) store.delete(k);
    }
  }
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return timingSafeEqual(bufA, Buffer.alloc(bufA.length));
  }
  return timingSafeEqual(bufA, bufB);
}

export function isTokenValid(token: string | null, expected: string): boolean {
  if (!token || !expected) return false;
  return timingSafeCompare(token, expected);
}

export function getBotLogToken(): string {
  return process.env.BOT_LOG_TOKEN ?? "";
}

export function isStrongSecret(value: string): boolean {
  return value.length >= 32;
}

function sessionSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`bot-observability:session:v1:${payload}`)
    .digest("base64url");
}

export function createSessionValue(
  secret: string,
  now = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS,
): string {
  if (!isStrongSecret(secret)) {
    throw new Error("BOT_LOG_TOKEN must be at least 32 characters");
  }
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const nonce = randomBytes(24).toString("base64url");
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  return `${payload}.${sessionSignature(payload, secret)}`;
}

export function isSessionValid(value: string | null, secret: string, now = Date.now()): boolean {
  if (!value || !isStrongSecret(secret)) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [version, rawExpiresAt, nonce, signature] = parts;
  if (version !== SESSION_VERSION || !nonce || !signature) return false;
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const payload = `${version}.${rawExpiresAt}.${nonce}`;
  return timingSafeCompare(signature, sessionSignature(payload, secret));
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_SECONDS;
}
