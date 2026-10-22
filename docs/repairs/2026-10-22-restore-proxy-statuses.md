# Restoring forwarded proxy statuses — 2026-10-22

**Status:** applied to production on 2026-10-22 at 13:33 UTC, after the fixed
senders deployed (13:20:54 UTC, `--forwarded-until`). It restored 39,145 rows
and set 1,617 interim `0`s to `200`. A private pre-restore backup was kept
outside the checkout; its SHA-256 is recorded in `history_repairs` as
`revert-status:2026-10-19-proxy-history`. Production then matched the
rehearsal below: 90,593 pre-repair records at their original status, and raw
records and daily totals disagreeing only in the one aggregate-only bucket.

## What went wrong

The [October 19 repair](2026-10-19-proxy-history.md) changed 39,145 blog and
Yardwork records from `200` to unknown (`0`), on the grounds that a Next.js
proxy's `200` is a forwarding sentinel rather than a verified origin response.
On the same day, both website senders were changed to report every forwarded
request as `0`. The dashboard's successful paths, error rate and outcome
coverage need known outcomes, so afterwards both sites had **no successful
responses at all**, in history or new traffic. The same sender regression had
already been fixed on 2026-09-04 (Yardwork `131857f`, blog `18e99f8`).

The repair also left redirect hops counted as requests. Over the 30 days to
2026-10-22, 9,644 of Yardwork's 20,985 counted requests were root `301`s; most
came from `facebookexternalhit` requesting `/` and never following the redirect.

## Correction

1. Both senders report `response.status` (`200`, meaning "forwarded") for
   forwarded requests again, keeping their own `301`s and event IDs.
2. `scripts/revert-status-repair.mjs` restores exactly the 39,145 rows the
   repair changed, identified from the repair's own backup (SHA-256 matched
   against the ledger), and sets `200` on the forwarded requests the interim
   senders reported as `0`. Daily totals move from unknown back to 2xx in the
   same transaction. The 399 excluded localhost records and the 11 restored
   daily increments are kept.
3. Request counts leave out redirect hops and show them separately, so
   `/` → `/en` is one request plus one redirect, in history as well.

## Rehearsal

On a local copy of all production tables taken 2026-10-22 13:04 UTC:

| | Raw records | Weighted requests |
| --- | ---: | ---: |
| Blog: restored to 200 | 15,184 | 17,398 |
| Yardwork: restored to 200 | 23,961 | 31,134 |
| Interim `0`s set to 200 (blog + Yardwork) | 1,615 | 3,109 |

Afterwards, 90,593 records that existed before the October 19 repair matched
their pre-repair status exactly; the other two were interim `0`s that arrived
before that backup and became `200`. Raw records and daily totals disagree in
only the one aggregate-only bucket noted on October 19.

Dashboard, 2026-09-22 to 2026-10-22:

| | Before | After |
| --- | --- | --- |
| Yardwork requests | 20,985 (redirects included) | 11,341, plus 9,644 redirects |
| Yardwork known outcomes | 46% | 100% |
| Yardwork successfully fetched paths | 0 | 723 |
| Blog known outcomes / error rate | 0% / Unknown | 100% / 0.0% |
| Blog successfully fetched paths | 0 | 64 |

## Not changed

12,668 Yardwork and 1,659 blog records from before 2026-09-04 still have
status `0` from the earlier sender regression. 5,750 of the Yardwork ones are
requests for `/`, which the proxy normally answers with a `301`. They are not
recognised as redirects, so they still count as requests.
