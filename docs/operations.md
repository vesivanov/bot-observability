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
