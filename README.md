# Bot Observability

See which bots request your pages, their response outcomes, and whether your website sender is delivering data.

Free, open-source software under the [MIT license](LICENSE). Self-host with Next.js and PostgreSQL; you pay for your own hosting. The dashboard measures HTTP requests, not people, visits, citations or referrals. Bot identities come from user-agent classification and can be spoofed; verification coverage is limited.

## Install with Docker Compose

Requires Docker with Compose v2.24.4 or newer. The app is built from this repository; no published application image is required.

```bash
git clone https://github.com/vesivanov/bot-observability.git
cd bot-observability
cp .env.example .env
```

Edit `.env`. Generate a different secret for each role with `openssl rand -hex 32`. For the bundled database use:

```dotenv
DATABASE_URL=postgres://postgres:postgres@db:5432/bot_observability
BOT_ADMIN_TOKEN=<admin secret>
BOT_IP_HASH_SECRET=<different IP hash secret>
BOT_INGEST_TOKENS='{"marketing-site":"<project ingestion secret>"}'
BOT_COLLECTOR_ORIGIN=http://localhost:3000
```

The default database is isolated in the Compose network. To change its password, set `POSTGRES_PASSWORD` and update `DATABASE_URL` to match, before first startup. Existing volumes keep their original password. Keep `.env` private.

```bash
docker compose up --build -d
```

PostgreSQL becomes healthy, the one-shot `migrate` service applies pending migrations, and then the app starts. Open [localhost:3000/dashboard](http://localhost:3000/dashboard), sign in with `BOT_ADMIN_TOKEN`, and choose a configured project. The app binds to loopback by default. For a remote installation, put a TLS reverse proxy in front of it, configure `BOT_COLLECTOR_ORIGIN` to its reachable public origin, and set `BOT_LISTEN_ADDRESS` if required.

The named `database` volume survives container restarts and `docker compose down`. **`docker compose down -v` deletes it.** Review [operations](docs/operations.md) before maintenance.

## Use an external PostgreSQL database

Set `DATABASE_URL` to your provider's connection string, including its required TLS settings. The override starts migrations and the app without the bundled database:

```bash
docker compose -f compose.yaml -f compose.external.yaml up --build -d
```

Or run directly with Node 24 (see `.nvmrc`):

```bash
npm ci
npm run setup     # fills missing/placeholder secrets; preserves real values
# Set DATABASE_URL in .env if setup reports that a database is needed.
npm run migrate
npm run dev
```

For a production Node host, use `npm run build` and `npm start` after migration. `/` has an illustrative preview that requires no database. `/dashboard` requires database and administrator configuration. The application can also run on a compatible Node/serverless host; follow that platform's request lifecycle and database guidance.

## Connect a website

Open **Website connection** in the dashboard and choose the project's configured credential. Keep credentials in server environment variables; never use `NEXT_PUBLIC_*` for them.

1. Copy [the maintained Next.js sender](examples/nextjs/proxy.ts) into the website as `src/proxy.ts`, or `proxy.ts` without a `src` directory. Merge it with existing routing/authentication logic. Configure `BOT_COLLECTOR_ORIGIN` and `BOT_INGEST_TOKEN` on the website, then restart/deploy that website.
2. Send a probe **to a website route that runs the sender**:

   ```bash
   curl --user-agent 'BotObservability-Connection-Probe/1.0' https://your-website.example/
   ```

3. Press **Check receipt**. It reads the latest receipt immediately for the selected project. This verifies that sender path reached the collector. It does not verify every route, future delivery or final response status.
4. Real bot activity appears when ordinary bot requests arrive. **Collector check** verifies the collector's internal configuration/database write, independently of the website. Checks and probes never add analytics traffic.

The sender prefilters likely bots, uses a 2-second timeout, checks HTTP failures, and logs a short failure without payloads or credentials. Delivery is best effort, with no retries/deduplication. `event.waitUntil` ties work to Next.js's request lifecycle; confirm that your host supports it. A request-stage proxy sends unknown final status, because it cannot observe the application's eventual response.

An original client IP is optional. Only configure `BOT_TRUST_CLIENT_IP_HEADER` on the website when your deployment overwrites that header with the original IP. The collector never replaces a missing payload IP with the sender's transport address. Sampling accepts `1`, `0.5`, `0.25`, or `0.1`; set `BOT_SAMPLE_RATE` on the website if needed. The collector reclassifies the user agent, so reported `bot_name` and `bot_category` do not override it.

## Generic HTTP contract

Send server-side JSON to `POST /api/bot-hit` with `Authorization: Bearer <project key>` or `x-bot-log-token`. Project identity comes from the configured key.

| Field | Meaning |
| --- | --- |
| `user_agent` | Original website request UA; authoritative for classification |
| `url` or `host` + `path` | Requested page; query values are stripped by default |
| `method` | Website request method; defaults to GET |
| `status_code` | Known final HTTP response, 200–599; omitted/0/other values mean unknown |
| `ip` | Optional original client IP from a trusted source; never the collector/sender IP |
| `sample_rate` | Accepted reciprocal sampling probability; defaults to 1 |
| `referer` | Optional; query values, credentials and fragments stripped by default |
| `environment`, `deployment_url`, `country`, `region`, `city`, `timezone` | Optional stored context; no environment/host filter is promised |
| `heartbeat: true` | Optional sender heartbeat; updates project health without traffic |
| `probe: "connection"` | Dedicated external sender receipt; no traffic |

Ordinary bot events return 201 with `stored: true`. Non-bots return 200 with `stored: false, reason: "not_bot"`. Probes return 200 with `received: true` and the credential's project. Authentication/configuration/malformed/storage failures use 401/503/400/500. A rejected project quota returns 429 and `Retry-After: 60`. The default is 120 bot submissions/minute per project per process, after classification; control events have a separate 30/minute allowance. This is an in-memory per-process policy, not a distributed capacity guarantee.

A backend that can observe final outcomes may send `status_code`; the Next.js proxy example cannot. Use a real website request in this contract; connection testing should use the probe flow above.

## What the dashboard shows

Overview has request volume, comparison, AI share, error rate with outcome coverage, one main UTC trend, category/bot shares, top pages and evidence links. Hour-of-day distributions, company comparisons and movers are under **More analysis**. Bots offers ranking and detail; Health distinguishes success, redirects, client/server errors and unknown outcomes; Raw Events shows retained request records. Redirects can be expected behavior; the dashboard does not diagnose them as broken automatically.

Selections preserve project, category and time through navigation. Presets use rolling half-open intervals. Custom date ranges include both selected UTC dates internally as `[start midnight, next day after end midnight)`. Daily charts include both partial edge days. Aggregate-only history uses explicitly displayed UTC day bounds; it cannot recreate paths or exact request times. Raw Events keeps your selected period and explains its 90-day query cap and retention boundary.

Volume is sample-expanded using `1/sample_rate`; sampled volume is an estimate. Unique pages are observed paths, not complete coverage of a sampled website. Known outcomes are final statuses 200–599. Error rate divides weighted 4xx/5xx requests by weighted known outcomes; all unknown yields **Unknown**. Stored integer historical rollups may have rounding differences for legacy arbitrary sample rates. Scope-sensitive global discovery is suppressed under a project/category filter.

Latest received activity and optional heartbeat are distinct. No heartbeat is a supported configuration; quiet traffic alone does not establish disconnection. Across projects there is no combined “healthy” badge based on one project's latest heartbeat.

## Identity, privacy and access

User-agent patterns cover AI fetchers, search engines, SEO tools, social previews, monitoring and generic clients. `Google-Extended` and `Applebot-Extended` are robots.txt policy controls, not separate detectable crawlers. Policy explanations remain in the legend. See [Google's policy documentation](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers#google-extended) and [Apple's documentation](https://support.apple.com/en-us/119829).

This implementation uses forward-confirmed reverse DNS for Googlebot, Bingbot and Applebot, matching the documented hostname domain and resolving it back to the original IP. It does **not** check published CIDR lists. OpenAI and Anthropic UAs remain UA-only. “UA only” means no successful supported DNS confirmation; historical records do not record a failure reason. See [Google](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot), [Bing](https://www.bing.com/webmasters/help/how-to-verify-bingbot-3905dc26), and [Apple](https://support.apple.com/en-us/119829).

Original IPs are hashed with keyed HMAC-SHA-256 before storage. Supported verification sends that IP to Google's DNS-over-HTTPS resolver in memory. URL/referrer query values are discarded by default. `BOT_QUERY_ALLOWLIST` may explicitly preserve a small comma-separated set of required query keys; never allow secrets. These rules affect future ingestion; old data is not rewritten automatically.

The dashboard is for trusted operators with a shared administrator credential and signed session cookie. It is not a public team workspace: viewer accounts, team roles and OIDC are not implemented. Project credentials remain environment-managed.

## Configuration and operations

Required: `DATABASE_URL`, `BOT_ADMIN_TOKEN`, `BOT_IP_HASH_SECRET`, `BOT_INGEST_TOKENS`. Optional collector settings: `BOT_COLLECTOR_ORIGIN`, `BOT_EVENT_RPM`, `BOT_QUERY_ALLOWLIST`. Single-project credentials may use `BOT_INGEST_TOKEN` plus `BOT_INGEST_PROJECT`. Legacy `BOT_LOG_TOKEN` ingestion is accepted only with the explicit `BOT_ACCEPT_LEGACY_INGEST=true` migration window; rotate it out afterwards.

All operator scripts load `.env`; nonempty shell values take precedence. Migrations are recorded in `schema_migrations`; already applied files never rerun. Pending migration 004 fills missing daily buckets while preserving existing uncertain history. Migration 005 establishes a conservative completeness watermark; prior pruning cannot be inferred from the oldest surviving row. Reconciliation requires a stopped collector and rebuilds only a proven or explicitly attested complete interval.

See [upgrade, backup/restore, retention and reconciliation](docs/operations.md). Database pools are small, reused while active and released when idle; read [the lifecycle details](docs/cpu-lifecycle.md). Query caches are short lived; connection receipt reads bypass them. Capacity is not promised without measurements.

[Contributing and local checks](CONTRIBUTING.md) · [Security reporting](SECURITY.md). GitHub Actions is disabled at the operator's request; verification runs locally.
