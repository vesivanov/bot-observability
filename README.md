# Bot Observability

![CI](https://github.com/vesivanov/bot-observability/actions/workflows/ci.yml/badge.svg)

A web dashboard for monitoring and analyzing bot/crawler traffic across web projects. Tracks AI crawlers, search engines, SEO tools, social previews, and more — so you know who is reading your content and why.

## Features

- **Bot Detection** — Identifies 130+ bots by User-Agent across AI training crawlers, search engines, SEO tools, social platforms, monitoring services, and CLI tools
- **Bot Verification** — Confirms bot identity via reverse DNS (PTR) lookups and known IP CIDR ranges
- **Multi-Project Support** — Track bot traffic across multiple web projects from a single dashboard
- **Trend Analysis** — Period-over-period comparison (24h / 7d / 30d / 90d / 1y, or a custom date range) showing rising bots, pages, and projects
- **Status Quality** — Response-code rollups, top failing paths, API/sensitive path hits, and bots with error or UA-only traffic
- **AI Crawler Intel** — Dedicated view for AI training and search crawlers with confidence breakdowns (verified vs UA-only) and a crawls-vs-visits breakdown by company
- **Raw Events** — Filterable event log with bot name, path, project, IP, and user-agent details
- **Data Health Monitoring** — Heartbeat freshness tracking to detect logging pipeline issues

## Screenshots

<!-- TODO: no screenshots included yet. Run the app locally (see Getting Started) and add dashboard images here before/after publishing, if desired. -->

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4**
- **Recharts** (chart components)
- **PostgreSQL** (Aiven or any standard Postgres)

## Getting Started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Aiven, Neon, or any standard Postgres)

### Setup

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your values
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BOT_LOG_TOKEN` | Yes | Shared server-side secret for dashboard login, signed sessions, ingestion auth, and keyed IP hashing; use 32+ random characters |

Generate the token with `openssl rand -base64 32` or an equivalent cryptographically secure generator.

### Database Setup

Migrations live in `db/migrations/*.sql` and are applied in order by `scripts/migrate.mjs`, which tracks what's already been applied in a `schema_migrations` table (safe to re-run):

```bash
npm run migrate
# or point it at a specific database:
node scripts/migrate.mjs "$DATABASE_URL"
```

The `bot_hits_daily` and `bot_first_seen` tables are seeded from existing history by the migration and then kept current by `insertHit` on every event. If you apply the migration to a database that keeps receiving traffic through an older (pre-rollup) build — e.g. between running the migration and deploying this version — those rows land in `bot_hits` but not the rollup. After deploying, run the reconcile script once to rebuild the rollup from raw and restore exact parity (safe to re-run any time you suspect drift):

```bash
npm run reconcile-rollups
# or: node scripts/reconcile-rollups.mjs "$DATABASE_URL"
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page is at `/`, the dashboard at `/dashboard`.

### Deploying

The app is a standard Next.js app and works on Vercel or any Node host that can run `next start`.

For Vercel:

1. Create a PostgreSQL database (Aiven, Neon, or any provider).
2. Run `npm run migrate` (or `node scripts/migrate.mjs "$DATABASE_URL"`).
3. Generate a long random `BOT_LOG_TOKEN`.
4. Add `DATABASE_URL` and `BOT_LOG_TOKEN` as environment variables.
5. Deploy the repository.
6. Open `/dashboard` and sign in with `BOT_LOG_TOKEN`.

Do not expose `BOT_LOG_TOKEN` in client-side browser code. Tracked sites should send events from middleware, server routes, edge/server functions, or backend logging code.

## Routes

The dashboard has 4 tabs, selected via `?view=`:

| Route | Description |
|---|---|
| `/` | Landing page with feature overview and login |
| `/dashboard` or `/dashboard?view=overview` | Totals, crawler mix, daily trend, time-of-day distribution, movers, and AI crawls-vs-visits by company (default tab) |
| `/dashboard?view=bots` | Full bot list; add `&bot=<name>` for a per-bot detail view (trend chart, top pages, first/last seen) or `&category=ai` to filter to AI bots |
| `/dashboard?view=health` | 2xx/3xx/4xx/5xx mix, failing paths, API/sensitive path hits |
| `/dashboard?view=events` | Filterable raw event log |
| `/api/bot-hit` | Authenticated bot event ingestion endpoint |
| `/login` | POST handler for token auth |

Older URLs (`?view=ai`, `?view=trends`, `?view=status`, `?view=pages`, `?view=bot&bot=<name>`) still work — they 307-redirect to their current equivalent (see `src/proxy.ts`).

Every view also accepts `?period=`, either a preset (`1`, `7`, `30`, `90`, `365` days) or a custom range as `YYYY-MM-DD_YYYY-MM-DD`. Periods over 90 days switch views into a rollup-backed "long-range mode" (see Architecture below) that hides path-level panels the daily rollup can't serve.

## Ingesting Bot Hits

Tracked sites should `POST` JSON to the dashboard's `/api/bot-hit` endpoint with either a bearer token or `x-bot-log-token` header. Bot identity, category, and confidence are derived server-side from the submitted user agent and IP.

Send `status_code` when it is available. Status reports show older or incomplete events as `not captured`; that is not a real HTTP status class.

```bash
curl -X POST "$DASHBOARD_URL/api/bot-hit" \
  -H "Authorization: Bearer $BOT_LOG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project": "marketing-site",
    "environment": "production",
    "url": "https://example.com/pricing?ref=ai",
    "method": "GET",
    "status_code": 200,
    "user_agent": "GPTBot/1.0",
    "ip": "203.0.113.10",
    "referer": "",
    "sample_rate": 1
  }'
```

Minimal tracked-site example:

```ts
const response = await fetch(request);

await fetch(`${process.env.BOT_DASHBOARD_URL}/api/bot-hit`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.BOT_LOG_TOKEN}`,
  },
  body: JSON.stringify({
    project: "marketing-site",
    url: request.url,
    method: request.method,
    status_code: response.status,
    user_agent: request.headers.get("user-agent") ?? "",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    referer: request.headers.get("referer") ?? "",
  }),
});

return response;
```

Heartbeat events can be sent periodically to monitor pipeline freshness:

```bash
curl -X POST "$DASHBOARD_URL/api/bot-hit" \
  -H "Authorization: Bearer $BOT_LOG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project":"marketing-site","heartbeat":true}'
```

### Payload Fields

| Field | Required | Notes |
|---|---:|---|
| `project` or `project_name` | No | Defaults to `default`; use it to separate sites or apps |
| `url` | No | Used to derive `host`, `path`, and `query_string` when those are not provided |
| `path` | No | Useful when you do not want to send full URLs |
| `method` | No | Defaults to `GET` |
| `status_code` or `status` | No | Use the final HTTP response status when available |
| `user_agent` | Yes for bot detection | Non-bot events are ignored unless `heartbeat` is true |
| `ip` | No | Enables bot verification; stored only as a keyed HMAC-SHA-256 value, never as the raw submitted IP |
| `referer` | No | Stored for raw event inspection |
| `environment` | No | Defaults to `production` |
| `is_api_route` | No | Helps the Status tab surface API hits |
| `sample_rate` | No | Stored but not currently used in aggregation |
| `heartbeat` | No | Set true for pipeline health events |

### Limits

The ingestion endpoint enforces a few hardcoded limits (see `src/app/api/bot-hit/route.ts`):

- **Max request body**: 32KB (`MAX_BODY_BYTES`). Larger requests (by `Content-Length`) are rejected.
- **Rate limit**: 120 requests/minute per caller IP (`RATE_LIMIT_RPM`), tracked in an in-memory, **per-serverless-instance** store — see the caveat under [Architecture](#architecture); it is not a global ceiling on multi-instance platforms.
- **Field truncation**: string fields are silently truncated, not rejected — 2000 characters for most string fields (`MAX_STRING_LENGTH`), 1000 characters for `path` (`MAX_PATH_LENGTH`). Oversized values are cut, not errored.
- **Responses**:
  | Status | Meaning |
  |---|---|
  | `201` | Event stored (`{ stored: true, bot_name, bot_category, confidence }`) |
  | `200` | Not stored — non-bot, non-heartbeat traffic (`{ stored: false, reason: "not_bot" }`) |
  | `400` | Invalid or too-large JSON payload |
  | `401` | Missing/invalid `BOT_LOG_TOKEN` |
  | `429` | Rate limit exceeded |
  | `503` | Ingestion not configured (`DATABASE_URL` missing or `BOT_LOG_TOKEN` shorter than 32 characters) |

## Privacy and Security

- The dashboard is protected by `BOT_LOG_TOKEN`, not a full user-management system. A successful login creates a signed, HTTP-only, same-site session cookie valid for 1 year; the token itself is never stored in the cookie.
- Ingestion uses the same `BOT_LOG_TOKEN`; keep it server-side.
- Submitted IP addresses are used for bot verification and then stored only as domain-separated, keyed HMAC-SHA-256 values derived from `BOT_LOG_TOKEN`. Raw IP storage is not supported.
- Rotating `BOT_LOG_TOKEN` changes the keyed hash produced for future observations of the same IP. Existing stored hashes remain unchanged.
- User agents, paths, referrers, approximate geo fields, deployment URLs, and status codes may be stored.
- Rotate `DATABASE_URL` and `BOT_LOG_TOKEN` before making a previously private deployment public if either may have been exposed outside trusted systems.

## Architecture

- **Storage**: a single `bot_hits` raw event table, plus two maintained tables — `bot_hits_daily` (a `(day, project, bot, category, status_class)` rollup used for long-range and high-volume views) and `bot_first_seen` (per-bot first/last-seen timestamps, used for exact "new bot" detection). Both are kept in sync with the raw insert inside the same transaction (`insertHit` in `src/lib/db.ts`) — no separate backfill job, no drift for new rows. If rows are ever ingested by an older build that predates the rollup, `npm run reconcile-rollups` rebuilds both tables from raw (see Database Setup). Day buckets are UTC (`DATE(created_at)`); the UI displays timestamps in Europe/Berlin.
- **Request-scoped DB client**: each request gets its own `postgres` client via `cache()` + `after()` (see `src/lib/db.ts` / `src/app/dashboard/page.tsx`), closed at the end of the request rather than pooled indefinitely — deliberate for small free-tier Postgres connection limits (e.g. Aiven).
- **Rendering**: the dashboard streams server-rendered content with a `Suspense` boundary per view/panel, so slow queries don't block the whole page.
- **Rate limiting is per-instance, not global**: `/api/bot-hit`'s rate limiter is an in-memory `Map` scoped to a single running process (see `src/app/api/bot-hit/route.ts`). On multi-instance serverless platforms like Vercel, each concurrently-running instance enforces its own 120 req/min ceiling independently — there is no shared/global counter. Real aggregate throughput across all instances can therefore be significantly higher than 120 req/min. Do not rely on this limiter as a hard global cap; put a WAF/edge rate limit in front of it if you need one.

### Testing

- `npm test` / `npm run test:unit` — unit tests (pure logic: bot detection, category normalization, period parsing, attention-strip thresholds, etc.), no database required.
- `npm run test:integration` — integration tests against a real Postgres database, gated on `TEST_DATABASE_URL` being set (skipped otherwise). They apply the migrations, seed fixtures, and clean up after themselves.

## Retention

Raw events are kept indefinitely by design — `bot_hits_daily` and `bot_first_seen` exist to make long-range and high-volume queries fast, not to replace the raw table, so there's no built-in retention/deletion job.

If you're self-hosting and want to prune old raw rows anyway, this is safe to run periodically — it only touches `bot_hits` and won't desync the rollup tables (they're independent, already-aggregated data):

```sql
DELETE FROM bot_hits
WHERE created_at < now() - interval '90 days';
```

## Bot Categories

| Category | Description |
|---|---|
| AI Training | Bulk training data collectors (GPTBot, ClaudeBot, etc.) |
| AI Search | Indexers for AI chat products (OAI-SearchBot, PerplexityBot, etc.) |
| AI Agent | On-demand user-triggered fetches (ChatGPT-User, Claude-User, etc.) |
| Search Engine | Traditional search index crawlers (Googlebot, Bingbot, etc.) |
| Social Preview | Link unfurling / share preview cards (Twitterbot, Slack, etc.) |
| SEO Tool | SEO audit and tech detection (Ahrefs, Semrush, etc.) |
| Monitoring | Uptime / performance checks (Pingdom, UptimeRobot, etc.) |
| Archival | Web page preservation (Internet Archive, etc.) |
| Generic / CLI | Uncategorized automated agents (curl, wget, etc.) |
