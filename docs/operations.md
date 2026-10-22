# Operations

Use a disposable database for rehearsals. Keep backups and secret configuration outside the checkout. Commands below target the bundled Compose database; use your provider's backup tools or `pg_dump`/`pg_restore` for an external database.

## Backup and restore

Stop the collector to prevent writes throughout the backup/update/rebuild. Website senders are best effort; requests during the pause are not queued. Account for that intentional collection gap.

```bash
docker compose stop app
docker compose exec -T db pg_dump -U postgres -d bot_observability -Fc > backup.dump
```

Verify the dump before relying on it:

```bash
docker compose exec -T db pg_restore --list < backup.dump
```

To rehearse recovery into a separate empty database (no destruction of the source):

```bash
docker compose exec -T db createdb -U postgres bot_observability_restore
docker compose exec -T db pg_restore -U postgres -d bot_observability_restore --exit-on-error < backup.dump
docker compose exec -T db psql -U postgres -d bot_observability_restore -c 'SELECT count(*) FROM bot_hits_daily;'
```

Point a disposable app/migration instance at the restore database and verify project receipt/history. Restore an actual failed installation only after preserving its current state; stop all collectors, restore to a fresh database, verify it, update `DATABASE_URL` and restart. A restore does not regenerate IP hashes or secret configuration: keep the original IP hash secret and administrator/project credentials separately.

## Update an installation

```bash
docker compose stop app
# Take and verify the backup above.
git pull --ff-only                 # resolve local changes deliberately before this step
docker compose build app migrate
docker compose run --rm migrate    # applies pending files; never reruns recorded ones
docker compose up -d app
```

Inspect `docker compose logs migrate app`, sign in, and send an external website probe. Verify receipt for the intended project and inspect retained historical totals. For external DB deployments, use `-f compose.yaml -f compose.external.yaml` on every Compose command.

A direct Node deployment uses the same order: stop every collector instance, take a backup, update code, `npm ci`, `npm run migrate`, `npm run build`, and restart. Do not run an older pre-rollup writer while migrating/reconciling. Routine upgrades do not require a rebuild of all rollups.

Migration 007 adds a nullable event ID and a unique project + event ID index.
Apply it before deploying the new collector writer. Older senders remain
compatible; update them to generate a fresh ID for each website request and
reuse that ID for delivery retries. Duplicate IDs are acknowledged without
incrementing raw events, weighted daily counts or first/last seen. Deduplication
lasts while the original raw event is retained, so replaying a pruned event can
count again. Existing records without IDs cannot be deduplicated safely by
IP, path or deployment ID. A request-stage proxy reports `200` for a request
it forwards, meaning "forwarded" rather than a verified origin response; it
must not send `0` for those requests, or every outcome becomes unknown.
Response-stage logging is needed to capture actual origin outcomes.

## Repair known historical records

Migration 008 adds `history_repairs`, an audit ledger excluded from analytics.
`scripts/repair-history.mjs` accepts an explicit, reviewed JSON manifest: exact
project/host pairs with sender-code evidence, a fixed UTC cutoff, and expected
counts. It changes legacy ID-less synthetic 200s to unknown, removes proven
localhost tests with no deployment identity, and transfers their weighted
daily increments in the same transaction. Genuine redirects and origin
responses are preserved. It never merges requests into visits or deduplicates
records by timing, IP, URL or deployment ID.

Do not use `unknownStatusSources` for a proxy's forwarded `200`s. The October
19 repair did that for two websites and left the dashboard with no successful
responses for either; its status change was reversed on October 22 ([record](repairs/2026-10-22-restore-proxy-statuses.md)),
while its localhost exclusions and restored daily increments were kept.

The checked-in [October 19 manifest](repairs/2026-10-19-proxy-history.json) is
specific to the audited installation; it is not an automatic migration and
must not be reused for other installations. Review a dry run first:

```bash
node scripts/repair-history.mjs --manifest /private/path/reviewed-plan.json
node scripts/repair-history.mjs --manifest /private/path/reviewed-plan.json \
  --apply --backup /private/path/history-before-repair.json.gz
```

Dry runs roll back all changes. Apply requires a new absolute backup filename;
the script writes a mode-0600 gzip JSON snapshot of every affected table,
verifies its checksum/decompression/row counts before changing records, and
records the backup hash and manifest in the ledger. Keep this backup private
and outside the checkout; it includes original request metadata. Restoring a
whole snapshot is an offline recovery operation: restore to a separate DB
first and account for requests received since the snapshot.

The script briefly locks raw events, daily rollups and first-seen metadata
against concurrent writes; readers continue. New ingestion waits for the
transaction. No application pause flag is required for this operation.
Unexpected candidate counts, malformed weights, first/last-seen boundary
changes or parity failures abort the entire repair. Reusing the same manifest
is a no-op; reusing its ID with different contents is rejected.

Retained raw events prove a lower bound for daily totals. Missing increments
are restored, while excess aggregates predating known raw completeness are
preserved. The script verifies each bucket's residual, including verified
counts, before committing. The actual historical 200/404/500 behind a
forwarded request cannot be reconstructed without response logs.

### Revert a status repair

`scripts/revert-status-repair.mjs` undoes the status part of an applied repair
from that repair's own backup, whose SHA-256 must match the ledger. It returns
exactly the rows the repair changed to their original `200`, and also sets
`200` on requests that the same project/hosts reported as `0` with event IDs
before `--forwarded-until`. Deploy the fixed senders first, then pass the UTC
time they went live; the script refuses to run while those hosts still report
forwarded requests as `0` after that time. It uses the same locks, dry run,
private backup, parity check and ledger as the repair:

```bash
node scripts/revert-status-repair.mjs --repair <repair id> \
  --repair-backup /private/path/history-before-repair.json.gz \
  --forwarded-until 2026-10-22T18:00:00Z
node scripts/revert-status-repair.mjs --repair <repair id> \
  --repair-backup /private/path/history-before-repair.json.gz \
  --forwarded-until 2026-10-22T18:00:00Z \
  --apply --backup /private/path/history-before-revert.json.gz
```

## Retain raw request detail

Retention is optional and never runs automatically in Compose. Configure your own scheduling only if desired. The script removes raw rows before a **UTC midnight boundary**, in batches. It leaves daily counts, global first-seen metadata, health and receipts intact.

```bash
RAW_EVENT_RETENTION_DAYS=90 npm run retain-raw
# In Compose:
docker compose run --rm -e RAW_EVENT_RETENTION_DAYS=90 migrate npm run retain-raw
```

`RAW_EVENT_RETENTION_BATCH_SIZE` defaults to 5000. The script records the prune boundary before its first batch so a partial/crashed cleanup cannot make a rebuild destroy older counts. A later larger retention setting cannot recover rows already deleted. Daily history has no path, query, host/environment breakdown or precise last-request timestamp. Exact historical raw detail requires a backup.

## Reconcile daily counts

**Stop all collector instances first.** `BOT_INGESTION_PAUSED=true` is an operator acknowledgment, not a remote pause switch or an online coordination lock.

```bash
docker compose stop app
docker compose run --rm -e BOT_INGESTION_PAUSED=true migrate npm run reconcile-rollups
docker compose up -d app
```

The script prints its half-open UTC interval, deletes/rebuilds only those days from raw events using the same bounds, and preserves earlier/uncertain days. It also preserves global first-seen history. Repeated rebuilds are stable while ingestion stays stopped.

For legacy installations, the initial complete interval begins on the first full UTC day after migration 005. Older raw data might have been pruned; the minimum surviving event is **not** completeness evidence. If your backups/retention records prove an earlier entire interval is complete, explicitly attest it:

```bash
BOT_INGESTION_PAUSED=true RAW_COMPLETE_FROM=2026-10-01 npm run reconcile-rollups
# Compose: add -e RAW_COMPLETE_FROM=2026-10-01 to the run command.
```

The assertion must include every raw request from that UTC midnight through the stopped collector's current day, and cannot precede a recorded pruning boundary. Keep a backup before using it. Without that evidence, leave uncertain aggregates unchanged. Pending migration 004 now preserves existing rollups; installations that previously ran its destructive version can recover lost data only from backups, not from this fix.

## Configuration and troubleshooting

Setup, migration, retention and reconciliation use the same `.env` parser; nonempty shell values win. Use explicit `DATABASE_URL`/script arguments for disposable checks so local `.env` cannot select a live database. Compose's environment comes from interpolation in `.env` or `--env-file`; no secret file enters the built image.

The app binds to loopback on port 3000 by default (`BOT_PORT`/`BOT_LISTEN_ADDRESS` change this). Provide TLS for remote login. `POSTGRES_PASSWORD` only initializes a new database volume; changing it later does not rotate the stored password. Do not expose the database port unnecessarily.

A stale optional heartbeat means no recent heartbeat receipt; absent heartbeat can simply mean it is not configured. A successful collector check tests the internal database path. An external website probe tests the installed sender route. Quiet bot activity, an empty filter and a missing heartbeat have different explanations.
