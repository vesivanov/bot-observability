# Implementation Report

Date: 2026-08-08

## Executive summary

The improvements described in `IMPROVEMENTS.md` were implemented across the central `bot-observability` service and all three tracked-site integrations in this workspace:

- `bot-observability`
- `digital-employee-smb`
- `vesivanov.com`
- `garaxe`

The implementation moves ingestion responsibility into the central collector, separates administrator and ingestion credentials, stores project heartbeats independently from raw events, hardens request and DNS verification paths, applies sampling consistently, and removes database/reporting work from the visitor-critical portions of the tracked-site middleware.

## Implemented changes

### 1. Authentication and project-scoped ingestion

The central service now distinguishes between dashboard administration and event ingestion.

Implemented in `src/lib/auth.ts`:

- Added `BOT_ADMIN_TOKEN` for dashboard and administrative access.
- Added `BOT_INGEST_TOKENS` for project-scoped ingestion credentials.
- Added support for a single `BOT_INGEST_TOKEN` with `BOT_INGEST_PROJECT`.
- Kept `BOT_LOG_TOKEN` as a temporary backwards-compatible fallback.
- Restricted the legacy fallback so it is used only when no new ingestion mapping or single-project ingestion configuration exists.
- Added ingestion authentication and configuration helpers.
- Kept `getBotLogToken()` as a compatibility alias for existing callers.
- Updated session-creation errors to refer to `BOT_ADMIN_TOKEN`.

Dashboard, login, and home-page code now use the administrator credential explicitly. Environment documentation was updated to describe the migration path and the intended eventual removal of the legacy token.

### 2. Hardened collector route

Implemented in `src/app/api/bot-hit/route.ts`:

- Reads the request body as an `ArrayBuffer` and rejects payloads over 32 KB before parsing.
- Authenticates ingestion credentials separately from dashboard credentials.
- Derives the project from the authenticated ingestion credential.
- Allows a submitted project name only for legacy authentication.
- Validates and normalizes project names before storage.
- Normalizes status codes to integer values between 0 and 999.
- Returns early for non-bot user agents without creating a database record.
- Hashes submitted or forwarded client IPs before storage.
- Uses a keyed verification-cache key rather than placing a raw IP in the cache.
- Returns HTTP 500 when storage fails instead of reporting a successful ingestion.
- Runs on the Node.js runtime.

The route accepts the explicit sample rates `1`, `0.5`, `0.25`, and `0.1`. Unsupported values are normalized to `1` rather than silently creating ambiguous weighting behavior.

### 3. Separate heartbeat storage

Added `db/migrations/003_project_health.sql` and corresponding database logic.

The new `project_health` table stores one current heartbeat row per project, including:

- Project name
- Latest heartbeat timestamp
- Environment
- Deployment URL

Heartbeat writes use an idempotent upsert and preserve the newest timestamp with `GREATEST(...)`. Historical heartbeat rows are backfilled from `bot_hits`, selecting the latest known metadata for each project.

`insertHit()` now delegates heartbeat events to the heartbeat upsert path. Normal bot events continue to be stored in `bot_hits`, included in daily rollups, and used for first-seen tracking.

The metadata and dashboard queries now include projects that exist only in `project_health`, so a project with no sampled raw events can still appear as a known project with a current health status.

### 4. Weighted analytics for sampled events

Dashboard and reporting queries were updated to account for sampling. Sampled records contribute approximately `1 / sample_rate` events to aggregate totals.

Updated areas include:

- Detail reports
- Top pages
- Hourly activity
- Bot-period summaries
- Full status dashboard summaries and rankings

Distinct-project and distinct-page calculations remain distinct counts rather than weighted event counts.

Added `db/migrations/004_weighted_rollups.sql` to rebuild the derived daily table for deployments that had already recorded migration 002 before weighted sampling was introduced. The historical backfill and live rollup path now use the same exact reciprocal sample-rate model, with NULL-safe aggregates.

### 5. DNS verification and cache hardening

Implemented in `src/lib/verify.ts`:

- Added exact-hostname and valid-subdomain matching for bot reverse-DNS domains.
- Added a domain-boundary check so lookalike domains such as `example.com.attacker.test` are not accepted as subdomains of `example.com`.
- Normalized hostnames case-insensitively and removed trailing dots before comparison.
- Added a five-minute DNS verification cache with a maximum of 4,096 entries.
- Added forward-confirmed reverse DNS verification.
- Added DNS timeout cleanup in `finally` blocks.
- Prevented raw IP addresses from being used directly as cache keys when the default verification path is called.

Implemented in `src/lib/cache.ts`:

- Added bounded cache capacity.
- Prunes expired entries during writes.
- Evicts the oldest entry when the configured maximum is reached.

New tests cover legitimate subdomains, lookalike-domain rejection, and forward-confirmed reverse DNS behavior.

### 6. Bot prefiltering

Implemented in `src/lib/bots.ts`:

- Added the exported `isLikelyBotUserAgent()` prefilter.
- It uses the existing bot pattern collection plus command-line and generic crawler indicators.

The central smoke tests now verify that synthetic user agents matching every configured `PATTERNS` entry pass the prefilter without relying on a generic `/bot` suffix, while ordinary browser user agents do not. The same broad prefilter source is copied into each tracked integration for static framework matcher configuration; exact classification remains centralized. Added `scripts/verify-bot-prefilter-sync.mjs` and `npm run verify:prefilter` to detect drift across the six committed copies (central helper, three site helpers, and two Next.js inline matcher literals).

### 7. Retention tooling

Added `scripts/retain-raw-events.mjs` and the `npm run retain-raw` script.

The retention job:

- Defaults to a 90-day raw-event retention period.
- Allows the period to be changed through `RAW_EVENT_RETENTION_DAYS`.
- Deletes old rows from `bot_hits` only.
- Leaves daily rollups and project health data intact.

This is intentionally a runnable job rather than an automatically scheduled external task; deployment scheduling still needs to be configured.

### 8. Tracked-site proxy changes

#### `digital-employee-smb`

Updated `src/proxy.ts` to:

- Remove direct Postgres access and direct `bot_hits` insertion.
- Send bot events asynchronously to `BOT_OBSERVABILITY_URL` using `BOT_INGEST_TOKEN`.
- Include project metadata, environment, deployment URL, method, user agent, forwarded client IP, unknown observation status, referrer, API-page classification, and sample rate.
- Use status code `0` because the proxy observes the request before the final response status is available.
- Use `event.waitUntil(...)` so the reporting request can continue after the response path completes.
- Apply only the supported sample rates.
- Exclude framework internals, API routes, static assets, and prefetch requests through the matcher.
- Preserve locale redirects and trailing-slash behavior.

Security headers that were previously mutated in the proxy were moved into `next.config.ts`, where they remain static and apply consistently.

#### `vesivanov.com`

Updated `proxy.ts` to use the same central asynchronous reporting model and remove direct database access. Existing redirect, rewrite, and agent content-negotiation behavior was preserved.

The proxy now:

- Sends events to the central collector over HTTPS.
- Uses `BOT_INGEST_TOKEN` and `BOT_OBSERVABILITY_URL`.
- Reports status `0` at observation time.
- Uses `event.waitUntil(...)`.
- Excludes prefetch requests and non-page/framework paths.
- Keeps the existing locale and agent-format routing behavior.

The sibling README documents the new variables and transport behavior.

#### `garaxe`

The Astro middleware had a separate direct reporting path with a legacy `BOT_LOG_TOKEN`, a drifting local bot list, truncated IP handling, and broad invocation coverage. It now:

- Uses the central `BOT_OBSERVABILITY_URL` and server-only `BOT_INGEST_TOKEN`.
- Sends raw client IP only over the server-to-server transport; the central collector performs hashing and verification.
- Reports `status_code: 0` and schedules ingestion with `event.waitUntil(...)`.
- Uses the shared broad prefilter rather than maintaining a local bot list.
- Preserves explicit `/performance` middleware coverage and excludes ordinary non-bot page requests, assets, framework internals, metadata, and prefetches from bot-reporting middleware invocation.
- Documents the required environment variables and behavior in `garaxe/README.md`.

### 9. Documentation and configuration

Updated documentation and examples in the central service:

- `.env.example`
- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `src/app/page.tsx`

The documentation now covers:

- Administrator versus ingestion secrets
- Project-scoped ingestion
- Heartbeat storage
- Supported sample rates
- Weighted analytics
- Asynchronous tracked-site reporting
- Prefetch exclusion
- Retention execution
- The legacy-token migration path

## Findings during implementation

### Direct writes from tracked-site proxies were the main architectural issue

The Next.js tracked-site proxies were performing database writes independently of the central collector. That duplicated infrastructure, bypassed centralized verification and hashing behavior, and made schema and privacy changes harder to apply consistently.

Moving those writes to the collector gives the system one ingestion boundary for authentication, bot filtering, IP handling, DNS verification, sampling, and storage.

### The central proxy was not the main source of request overhead

The central service proxy is primarily responsible for dashboard access control and routing. The higher-impact CPU and latency concern was the repeated bot logging work performed inside the tracked-site request path, especially direct database access and synchronous processing. The tracked-site proxies now use fire-and-forget reporting with `event.waitUntil(...)`.

### Heartbeats should not be raw bot events

Heartbeat events are operational health signals, not visits. Storing them in `bot_hits` inflated event counts and made repeated health checks appear as page activity. The separate `project_health` table removes that distortion and makes heartbeat writes naturally idempotent.

### Reporting success must reflect storage success

The collector previously had a path where an ingestion failure could still appear successful to the caller. The route now returns HTTP 500 for storage failures, making monitoring and retry behavior reliable.

### Raw IP handling needed a clear boundary

The collector now hashes IP addresses before persistence. DNS verification may still need the raw address transiently, but it is not stored in event data or used directly as the default cache key. The cache key can instead be keyed with a secret-derived value.

### DNS validation must enforce domain boundaries

A suffix-only check can incorrectly accept a lookalike hostname. The implementation accepts either the exact expected hostname or a hostname ending in `.${expectedDomain}`, preventing unrelated suffixes from passing.

### Sampling requires query-level compensation

Applying a sampling rate at ingestion is insufficient if dashboard queries continue to count physical rows. Aggregate event totals now compensate using weighted sums, while distinct counts remain unweighted.

## Validation performed

### Central service

- `npm test -- --reporter=dot`: 254 tests passed, 14 skipped; 14 test files passed and 4 were skipped.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `npm run verify:prefilter`: passed across all six matcher copies.
- `npm run test:integration`: test files loaded successfully, but all 14 integration tests were skipped because `TEST_DATABASE_URL` was not configured.

The expected storage-failure log emitted by the mocked route test appeared on stderr; the test itself passed.

The bot-pattern smoke suite specifically passed all 135 pattern fixtures after removing a fixture loophole that could have matched only the generic word `bot`.

### `digital-employee-smb`

- `npm run lint`: passed, with five pre-existing warnings in unrelated audit scripts.
- `npm test`: 60 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

The first build attempt was blocked by the sandbox when Next.js attempted to write `.next/trace`; the build passed when rerun with the required elevated permission.

### `vesivanov.com`

- Lint passed.
- `npm test`: 16 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

The first build attempt encountered the same sandbox restriction on `.next/trace`; the elevated rerun passed. The build emitted non-fatal baseline-browser and workspace-root warnings.

### `garaxe`

- `git diff --check`: passed.
- The middleware changes were reviewed directly.
- The repository's existing `npm run test:run` is blocked by a missing pre-existing import (`content/publicPages.js`), before any tests execute.
- The repository's existing `npm run build:vite` is blocked by its pre-existing missing `/src/main.jsx` entry.
- `npm run build` was not completed because Astro prompted to install a missing `@astrojs/check` dependency; no dependency was installed as part of this work.

## Files of particular interest

Central service:

- `src/app/api/bot-hit/route.ts`
- `src/app/api/bot-hit/route.test.ts`
- `src/lib/auth.ts`
- `src/lib/db.ts`
- `src/lib/verify.ts`
- `src/lib/verify.test.ts`
- `src/lib/cache.ts`
- `src/lib/bots.ts`
- `src/lib/bots-smoke.test.ts`
- `db/migrations/003_project_health.sql`
- `db/migrations/004_weighted_rollups.sql`
- `scripts/retain-raw-events.mjs`
- `scripts/verify-bot-prefilter-sync.mjs`
- `.env.example`

Tracked sites:

- `digital-employee-smb/src/proxy.ts`
- `digital-employee-smb/next.config.ts`
- `vesivanov.com/vesivanov-nextjs/proxy.ts`
- `vesivanov.com/vesivanov-nextjs/next.config.ts`
- `garaxe/middleware.js`
- `garaxe/bot-prefilter.js`

## Remaining operational work

The implementation is complete in code, but deployment configuration and production verification remain:

1. Configure `BOT_ADMIN_TOKEN`, `BOT_IP_HASH_SECRET`, and project-specific ingestion credentials in the central deployment.
2. Configure `BOT_OBSERVABILITY_URL` and `BOT_INGEST_TOKEN` in each tracked-site deployment.
3. Run the ordered migrations, including `003_project_health.sql` and `004_weighted_rollups.sql`, against the production database.
4. Schedule authenticated heartbeat requests for each project if active health monitoring is required.
5. Schedule `npm run retain-raw` or an equivalent deployment cron job.
6. Deploy one tracked site first and verify ingestion, project derivation, hashing, weighted counts, and heartbeat status.
7. Observe production behavior for a full traffic cycle before deploying the remaining site.
8. Remove the `BOT_LOG_TOKEN` compatibility fallback after all clients have migrated.
9. Run the integration suite with a real disposable test database by setting `TEST_DATABASE_URL`.

No production deployments were performed. After the final review, the audited changes were committed in each repository; the final push references are included in the handoff for this task.

## Scope and preservation notes

Existing unrelated changes in `digital-employee-smb` were preserved. Those changes included documentation/content work and planning files. No sensitive environment values were edited or included in this report.
