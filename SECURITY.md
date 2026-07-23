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

- Treat `DATABASE_URL` and `BOT_LOG_TOKEN` as secrets.
- Use a random `BOT_LOG_TOKEN` of at least 32 characters. Generate it with `openssl rand -base64 32` or an equivalent cryptographically secure generator.
- Rotate secrets before making a previously private deployment public.
- Submitted IP addresses are verified in memory and then stored only as keyed HMAC-SHA-256 values derived from `BOT_LOG_TOKEN`; raw IP storage is not supported.
- The dashboard uses a signed, HTTP-only 1-year session cookie, not multi-user authentication.
- The same `BOT_LOG_TOKEN` authenticates dashboard login and ingestion. Keep it server-side and do not expose it in browser code.
