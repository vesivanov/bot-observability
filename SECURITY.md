# Security

## Supported Versions

This project is maintained from the `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for a security vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/vesivanov/bot-observability/security/advisories/new). This repository's private reporting was verified enabled on October 2, 2026. Reports reach the maintainer without a public issue.

Include:

- affected version or commit
- reproduction steps
- expected impact
- any suggested mitigation

## Deployment Notes

- Treat `DATABASE_URL`, `BOT_ADMIN_TOKEN`, `BOT_IP_HASH_SECRET`, and every project ingestion key as secrets.
- Use unique random values of at least 32 characters for each role. Generate them with `openssl rand -base64 32` or an equivalent cryptographically secure generator.
- Rotate secrets before making a previously private deployment public.
- Submitted IP addresses are verified in memory and then stored only as keyed HMAC-SHA-256 values derived from `BOT_IP_HASH_SECRET`; raw IP storage is not supported.
- The dashboard uses a signed, HTTP-only 1-year session cookie, not multi-user authentication.
- `BOT_ADMIN_TOKEN` authenticates dashboard login, while `BOT_INGEST_TOKENS` contains project-scoped ingestion keys. Keep website credentials in server-only environment variables. The authenticated operator connection panel deliberately reveals the selected project key; do not share that panel or the administrator session.
- `BOT_LOG_TOKEN` is a temporary migration fallback only; remove it after all senders use project-scoped ingestion keys and the dashboard uses `BOT_ADMIN_TOKEN`.

- Query values are stripped on future ingestion by default; an explicit query-key allowlist is available. Historical records are not rewritten.
- Supported DNS verification uses Google DNS-over-HTTPS and sends the original client IP to that resolver before hashing. Only Googlebot, Bingbot and Applebot are checked; no published-IP/CIDR verification is implemented.
