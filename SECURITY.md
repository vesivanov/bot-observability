# Security

## Supported Versions

This project is maintained from the `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for a security vulnerability.

**Primary channel**: use GitHub's private vulnerability reporting. Go to this repository's **Security** tab → **"Report a vulnerability"** to open a private advisory with the maintainer. This is the preferred and fastest way to reach us.

<!-- maintainer: add a contact email here if you want one -->

If the Security tab / private reporting is not enabled on this repository for any reason, please still avoid public issues — check back later or watch the repository for the feature to be enabled.

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
- `BOT_ADMIN_TOKEN` authenticates dashboard login, while `BOT_INGEST_TOKENS` contains project-scoped ingestion keys. Keep all of them server-side and do not expose them in browser code.
- `BOT_LOG_TOKEN` is a temporary migration fallback only; remove it after all senders use project-scoped ingestion keys and the dashboard uses `BOT_ADMIN_TOKEN`.
