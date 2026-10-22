# Historical counting correction — 2026-10-19

> **Status change reversed on 2026-10-22.** Changing the forwarded 200s to
> unknown left the dashboard with no successful responses for the blog and
> Yardwork, past or future. See the [reversal record](2026-10-22-restore-proxy-statuses.md).
> The localhost exclusions and the 11 restored daily increments still stand.

Applied the [reviewed manifest](2026-10-19-proxy-history.json) to production
with `scripts/repair-history.mjs`, after a production dry run and PostgreSQL
integration tests. The `history_repairs` ledger records the manifest and
private backup SHA-256. Original records are preserved outside the checkout.
The backup was restored into an isolated PostgreSQL schema (90,994 raw rows,
5,643 daily buckets and 70 first-seen rows); replaying the dry run reproduced
the exact correction counts. Re-running against production returned
`already_applied` without changing records.

| Correction | Raw records | Weighted requests |
| --- | ---: | ---: |
| Blog: synthetic proxy 200 → unknown | 15,184 | 17,398 |
| Yardwork: synthetic proxy 200 → unknown | 23,961 | 31,134 |
| Yardwork localhost tests removed from analytics | 393 | 393 |
| Local tests under the old `yardwork` project removed | 6 | 6 |

Source history proves that these Next.js 200s were continuation/rewrite
sentinels, not observed final responses. Proxy-issued 301s remain unchanged.
Garaxe's historical statuses were returned to the client from a real fetch;
they are preserved. Its old internal redirect following cannot be recovered
as separate hops from the stored fields. The sender now uses manual redirect
handling, and all three sender fixes have successful Vercel deployments.
New production events after the fix carry event IDs; observed blog
continuations report 0 and Yardwork root redirects report 301.

The correction transferred status buckets atomically and restored 11 missing
daily increments backed by raw events on August 11 (10 blog, 1 Garaxe).
One aggregate-only Yardwork request on that date predates the raw completeness
watermark and remains intact. Every other raw/daily bucket agrees exactly;
verified-count residuals are unchanged. First/last-seen metadata was unaffected.

The collector now excludes localhost/loopback and explicitly declared
non-production bot events unless opted in. Redirect metrics/filtering exclude
304 cache validation; the full 3xx class remains available. Exact `/api` paths
are included in API counters as well as excluded from successful page GETs.

This does not reconstruct visits. `/` → `/en` still represents two HTTP
requests, and `/en` establishes a successful fetched path only when its final
2xx outcome was captured. Historical ID-less events cannot be safely deduplicated
by IP, timestamp, URL or deployment ID. Unknown final outcomes remain unknown.
