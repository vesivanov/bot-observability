# Bot Observability Improvements

Last reviewed: 2026-08-08

## Direct verdict

The central `bot-observability` application is not the primary cause of the high Vercel CPU usage. Its own Next.js proxy only matches `/dashboard`, while the expensive integration pattern lives in tracked-site proxies that run before cache and import PostgreSQL directly.

Bot tracking should remain enabled. The correct change is to keep a small bot sensor in each tracked site, send detected events asynchronously to the central `/api/bot-hit` endpoint, and ensure ordinary human requests do not invoke Routing Middleware solely for observability.

## Verified current state

- The local reviewed tree is identical to GitHub `main` and the current Vercel production deployment, even though the local branch and production use different commit hashes.
- `src/proxy.ts` only matches `/dashboard`.
- `src/app/api/bot-hit/route.ts` already provides the correct central boundary for authentication, bot classification, DNS verification, IP hashing, and persistence.
- Every stored bot event currently performs one raw insert, one daily-rollup upsert, and one first/last-seen upsert in a transaction.
- Local validation passed: 238 tests passed, lint passed, and the production build passed. Four PostgreSQL-backed test files were skipped locally because `TEST_DATABASE_URL` was not present; GitHub CI runs them with PostgreSQL.

## Material findings

| Priority | Finding | Severity | Confidence |
|---|---|---:|---:|
| P0 | `digital-employee-smb` and `vesivanov.com` import the database client and write directly from broad Next.js proxies. | High | High |
| P0 | Direct writes bypass central DNS verification and keyed IP hashing, and pass-through responses are commonly recorded as status `200` rather than the final downstream status. | High | High |
| P1 | The README's minimal sender example awaits `fetch(request)` and then awaits ingestion; that is not the correct non-blocking Next.js Proxy integration. | Medium | High |
| P1 | Heartbeats are emitted from module-global proxy state and appended to the raw event table, allowing duplicates across warm instances. | Medium | High |
| P1 | DNS hostname verification uses `hostname.endsWith(domain)` without a label boundary, so an attacker-controlled suffix such as `notgoogle.com` can satisfy `google.com`. | Medium | High |
| P1 | One shared `BOT_LOG_TOKEN` is used for ingestion, dashboard login, session signing, and IP hashing. Compromise of one sender exposes every role. | Medium | High |
| P2 | The endpoint has no route-level tests for authentication, parsing, rate limiting, and response behavior. | Medium | High |
| P2 | Sampling documentation says `sample_rate` is not aggregated, but the implementation weights counts. Arbitrary rates can also cause raw/rollup rounding differences. | Low | High |

## Target architecture

```text
Normal human request
  -> CDN / route
  -> no observability-only proxy invocation

Likely bot request
  -> lightweight User-Agent matcher
  -> thin site proxy
  -> return/rewrite/redirect immediately
  -> event.waitUntil(POST /api/bot-hit)
  -> central detection + verification + HMAC IP storage
  -> PostgreSQL transaction

Scheduled project heartbeat
  -> authenticated daily call
  -> idempotent project-health upsert
```

The tracked site is responsible only for a cheap likely-bot prefilter and event transport. The central application remains the source of truth for exact identity, category, verification confidence, privacy handling, and storage.

## Phase 1: remove databases from tracked-site proxies

This is the smallest, highest-value change and should be implemented first in `digital-employee-smb` and `vesivanov.com`.

1. Remove `createDbClient`, `DATABASE_URL`, `BotHit`, and all direct `insertHit()` calls from site proxies.
2. Keep the existing local detector initially to prevent coverage regressions.
3. When a bot is detected, schedule a POST to the collector with `event.waitUntil()`.
4. Return the site's existing `NextResponse` immediately.
5. Send `status_code: 0` for an ordinary pass-through because Proxy executes before the final route response. Do not report `NextResponse.next().status` as the final page status.
6. Let the collector derive bot name/category, verify the submitted IP, hash it, and write the database records.
7. Use `BOT_OBSERVABILITY_URL` and a server-only ingestion credential; do not expose either through `NEXT_PUBLIC_*` variables.

Suggested sender shape:

```ts
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { detectBot } from "@/lib/bots";

function reportBotHit(request: NextRequest) {
  return fetch(`${process.env.BOT_OBSERVABILITY_URL}/api/bot-hit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.BOT_INGEST_TOKEN}`,
    },
    body: JSON.stringify({
      project: process.env.VERCEL_PROJECT_NAME,
      environment: process.env.VERCEL_ENV,
      url: request.url,
      method: request.method,
      status_code: 0,
      user_agent: request.headers.get("user-agent") ?? "",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      referer: request.headers.get("referer") ?? "",
    }),
  }).then((response) => {
    if (!response.ok) {
      console.error(`[bot-observability] ingestion failed: ${response.status}`);
    }
  });
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = NextResponse.next();
  const userAgent = request.headers.get("user-agent") ?? "";

  if (detectBot(userAgent)) {
    event.waitUntil(reportBotHit(request).catch(() => undefined));
  }

  return response;
}
```

The final site implementation must preserve its existing redirect, rewrite, locale, security-header, and content-negotiation behavior rather than replacing the whole proxy with this minimal example.

## Phase 2: prevent human requests from invoking an observability proxy

Removing PostgreSQL reduces work per invocation, but a broad matcher still invokes Routing Middleware before cache. Reduce invocation count as follows:

1. Move static security headers to `next.config.ts`.
2. Move deterministic redirect maps to `next.config.ts`.
3. Keep dynamic proxy coverage only where it is genuinely required, such as root-language negotiation or agent content negotiation.
4. Add a `has` matcher on `user-agent` for likely bot requests.
5. Exclude static assets, Next.js internals, metadata files, and browser prefetch requests.
6. Test matcher behavior with `unstable_doesProxyMatch`.

The User-Agent matcher is only a prefilter. False positives are acceptable because `/api/bot-hit` performs exact detection and ignores non-bots. False negatives are not acceptable; test one representative User-Agent for every `PATTERNS` entry.

For `garaxe`, preserve explicit `/performance` middleware coverage, but invoke bot middleware on other paths only when the User-Agent prefilter matches. Its current local bot list should be replaced with a generated/shared prefilter so it cannot drift behind the collector.

## Phase 3: make heartbeats idempotent

Remove request-triggered five-minute heartbeat logic from tracked-site proxies.

Preferred collector design:

```sql
CREATE TABLE project_health (
  project_name TEXT PRIMARY KEY,
  last_heartbeat_at TIMESTAMPTZ NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  deployment_url TEXT NOT NULL DEFAULT ''
);
```

Each authenticated heartbeat should upsert the project's latest timestamp rather than append a raw `bot_hits` row. On Vercel Hobby, one daily cron per project is sufficient for coarse pipeline health. The endpoint and database operation must be idempotent because scheduled requests can be delivered more than once.

## Phase 4: harden the central collector

### Separate credentials

Introduce separate secrets:

- `BOT_ADMIN_TOKEN` for dashboard login and session signing.
- `BOT_IP_HASH_SECRET` for stable keyed IP hashing.
- Per-project ingestion keys mapped to an allowed `project_name`.

The server should derive the project from the credential rather than trusting an arbitrary submitted project name. Provide a migration period that accepts the legacy token before removing it.

### Fix DNS hostname validation

Replace the suffix check with a DNS-label boundary check:

```ts
function isHostnameInDomain(hostname: string, domain: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, "");
  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}
```

Keep the existing forward-confirmed reverse-DNS step. Add tests proving that legitimate subdomains pass and lookalike suffixes fail.

### Cache verification results

DNS verification currently performs PTR and forward lookups for every verifiable hit. Cache results by bot name and keyed IP with a bounded TTL. A persistent cache/table is preferable to relying only on serverless module globals.

### Add route-handler tests

Cover at least:

- missing and invalid credentials;
- weak/missing server configuration;
- malformed JSON and oversized bodies;
- non-bot events returning `stored: false`;
- bot events passed to storage with normalized fields;
- heartbeat behavior;
- field truncation and status normalization;
- rate-limit behavior;
- storage failures returning a non-success response.

### Make sampling mathematically consistent

Choose one of these models:

1. Restrict sample rates to exact reciprocal values such as `1`, `0.5`, `0.25`, `0.1`, and store an integer weight; or
2. Store rollup hit counts as a precise numeric type and add `1 / sample_rate` without rounding each individual event.

Update README wording to match the implemented model.

### Add retention

Keep daily rollups indefinitely, but add an optional scheduled raw-event retention policy, such as 90 days. This bounds raw table size without losing long-range aggregate trends.

## Phase 5: optional Vercel Pro architecture

If the team upgrades to Vercel Pro, consider replacing observability-only proxies with a Vercel Log Drain. Log Drain payloads include User-Agent, client IP, path, final response status, and cache outcome, and delivery can be batched.

The collector should expose a separate signed batch endpoint for the drain. Keep the current per-event endpoint for non-Vercel sites and local integrations.

## Acceptance criteria

### Tracked sites

- No tracked-site proxy imports PostgreSQL or receives `DATABASE_URL` for bot logging.
- Bot reporting is scheduled with `waitUntil()` and never delays the visitor response.
- Cached bot requests are still captured.
- Ordinary pass-through events use unknown status rather than falsely recording `200`.
- No raw or truncated client IP is written directly by a tracked site.
- Static assets, Next.js internals, metadata files, and browser prefetches do not invoke bot logic.
- Every supported bot fixture passes the proxy matcher/prefilter test.
- Existing locale, redirect, rewrite, security-header, and agent-response behavior remains unchanged.

### Central collector

- A valid event produces one raw row and consistent rollup/first-seen updates.
- A non-bot false positive is ignored without a database write.
- Verification rejects attacker-controlled lookalike domains.
- Ingestion credentials cannot authenticate to the dashboard.
- One project credential cannot submit events for another project.
- Heartbeats perform one idempotent project-health update.
- Raw and rollup counts agree for every allowed sample rate.
- Retention removes only raw rows and preserves rollups.

### Operational validation

- Deploy one tracked site first and compare at least one full day before and after.
- Confirm central collector invocations approximate detected bot events plus scheduled heartbeats, not total site requests.
- Confirm normal human page requests no longer produce observability-only middleware invocations after matcher narrowing.
- Verify representative real bot User-Agents appear in the dashboard with the expected project, path, category, and confidence.
- Confirm 404/5xx status panels no longer receive false `200` values from pass-through proxy responses.
- Roll out to the remaining sites only after these checks pass.

## Recommended implementation order

1. Update collector documentation and add route-handler tests.
2. Fix DNS hostname boundary validation.
3. Convert `digital-employee-smb` from direct database writes to central ingestion.
4. Validate one full production day.
5. Convert `vesivanov.com` the same way.
6. Generate a shared prefilter and update `garaxe`.
7. Move static proxy responsibilities into Next.js configuration and narrow matchers.
8. Replace raw heartbeat rows with idempotent project-health upserts.
9. Separate ingestion, admin/session, and IP-hashing credentials.
10. Add retention and optional batch ingestion.

## Out of scope

- Removing bot tracking.
- Replacing the dashboard or PostgreSQL without measured evidence that either is inadequate.
- Forcing Next.js 16 `proxy.ts` onto the Edge runtime; Proxy is Node.js-only.
- Claiming exact final response statuses from a pass-through Next.js Proxy.
- Introducing a queue or distributed event system before event volume demonstrates that per-bot central ingestion is insufficient.
