import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const LOGIN_RATE_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;
const SESSION_VERSION = "v1";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

export const SESSION_COOKIE_NAME = "bot_session";
export const LEGACY_COOKIE_NAME = "bot_token";

export interface IngestionIdentity {
  projectName: string | null;
  legacy: boolean;
}

interface IngestionCredential extends IngestionIdentity {
  token: string;
}

export interface IngestionConfig {
  credentials: IngestionCredential[];
  configured: boolean;
  invalid: boolean;
}

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
  // Compatibility alias for callers that have not migrated to the
  // role-specific names. New code should use getAdminToken().
  return getAdminToken();
}

export function getAdminToken(): string {
  return process.env.BOT_ADMIN_TOKEN ?? process.env.BOT_LOG_TOKEN ?? "";
}

export function getIpHashSecret(): string {
  return process.env.BOT_IP_HASH_SECRET ?? process.env.BOT_LOG_TOKEN ?? "";
}

function isCredential(value: unknown): value is { project: string; token: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { project?: unknown }).project === "string" &&
      typeof (value as { token?: unknown }).token === "string" &&
      (value as { project: string }).project.trim().length > 0,
  );
}

function parseMappedCredentials(raw: string): IngestionCredential[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed).map(([project, token]) => ({ project, token }))
        : null;
    if (!entries || !entries.every(isCredential)) return null;
    return entries.map((entry) => ({
      token: entry.token,
      projectName: entry.project.trim(),
      legacy: false,
    }));
  } catch {
    return null;
  }
}

/**
 * Read ingestion credentials without exposing their values to callers.
 * BOT_INGEST_TOKENS is a JSON object mapping project names to keys. A single
 * BOT_INGEST_TOKEN plus BOT_INGEST_PROJECT is also supported.
 *
 * The BOT_LOG_TOKEN fallback is only used when no new ingestion mapping
 * exists, giving existing senders a migration path. Once a mapping is
 * configured, project identity always comes from that mapping.
 */
export function getIngestionConfig(): IngestionConfig {
  const mapped = process.env.BOT_INGEST_TOKENS?.trim();
  if (mapped) {
    const credentials = parseMappedCredentials(mapped);
    if (!credentials || credentials.length === 0 || credentials.some((credential) => !isStrongSecret(credential.token))) {
      return { credentials: [], configured: true, invalid: true };
    }
    return { credentials, configured: true, invalid: false };
  }

  const singleToken = process.env.BOT_INGEST_TOKEN ?? "";
  const singleProject = process.env.BOT_INGEST_PROJECT?.trim() ?? "";
  if (singleToken || singleProject) {
    if (!singleProject || !isStrongSecret(singleToken)) {
      return { credentials: [], configured: true, invalid: true };
    }
    return {
      credentials: [{ token: singleToken, projectName: singleProject, legacy: false }],
      configured: true,
      invalid: false,
    };
  }

  const legacyToken = process.env.BOT_LOG_TOKEN ?? "";
  if (isStrongSecret(legacyToken)) {
    return {
      credentials: [{ token: legacyToken, projectName: null, legacy: true }],
      configured: true,
      invalid: false,
    };
  }

  return { credentials: [], configured: false, invalid: false };
}

function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

export function authenticateIngestion(request: Request): IngestionIdentity | null {
  const headerToken = request.headers.get("x-bot-log-token") ?? "";
  const authorizationToken = bearerToken(request.headers.get("authorization"));
  const config = getIngestionConfig();

  for (const credential of config.credentials) {
    if (timingSafeCompare(headerToken, credential.token) || timingSafeCompare(authorizationToken, credential.token)) {
      return { projectName: credential.projectName, legacy: credential.legacy };
    }
  }
  return null;
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
    throw new Error("BOT_ADMIN_TOKEN must be at least 32 characters");
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
