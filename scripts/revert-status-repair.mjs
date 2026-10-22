import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import postgres from "postgres";
import { loadEnv } from "./env.mjs";

// Undoes the status part of an applied history repair: proxy-forwarded 200s
// that the repair changed to unknown return to 200, using the repair's own
// verified backup to identify them exactly. Requests that the interim senders
// reported as 0 (event IDs, same project/host) are forwarded requests too and
// become 200. Localhost exclusions and restored daily increments are kept.
loadEnv();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const value = (flag) => args[args.indexOf(flag) + 1];
const repairId = args.includes("--repair") ? value("--repair") : "";
const repairBackupPath = args.includes("--repair-backup") ? value("--repair-backup") : "";
const forwardedUntil = args.includes("--forwarded-until") ? value("--forwarded-until") : "";
const backupPath = args.includes("--backup") ? value("--backup") : "";
if (!repairId || !repairBackupPath || !forwardedUntil || !process.env.DATABASE_URL || (apply && !isAbsolute(backupPath))) {
  throw new Error("Usage: DATABASE_URL=... node scripts/revert-status-repair.mjs --repair <id> --repair-backup <its backup> --forwarded-until <UTC time the fixed senders went live> [--apply --backup /private/path/snapshot.json.gz]");
}
if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(forwardedUntil) || !(Date.parse(forwardedUntil) <= Date.now())) {
  throw new Error("--forwarded-until must be a past UTC timestamp, e.g. 2026-10-22T18:00:00Z.");
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const repairBackup = readFileSync(repairBackupPath);
const id = `revert-status:${repairId}`;

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, connection: { timezone: "UTC", lock_timeout: 5000, statement_timeout: 60000 },
});
const dryRun = new Error("Dry run rollback");
let report;
try {
  await sql.begin(async (tx) => {
    // Same lock order as ingestion and repair-history.mjs.
    await tx`LOCK TABLE bot_hits, bot_hits_daily, bot_first_seen, history_repairs IN SHARE ROW EXCLUSIVE MODE`;
    const [existing] = await tx`SELECT summary FROM history_repairs WHERE id = ${id}`;
    if (existing) { report = { ...existing.summary, mode: "already_applied" }; return; }
    const [repair] = await tx`SELECT manifest, backup_sha256, summary FROM history_repairs WHERE id = ${repairId}`;
    if (!repair) throw new Error(`Repair ${repairId} is not in history_repairs.`);
    // Only the backup taken inside that repair's transaction proves which rows
    // it changed; any other snapshot could include later or earlier states.
    if (sha256(repairBackup) !== repair.backup_sha256) throw new Error("The backup does not match the repair's recorded SHA-256.");
    const plan = repair.manifest;
    const sources = plan.unknownStatusSources ?? [];
    if (!sources.length) throw new Error("This repair changed no statuses.");
    const sourceKeys = new Set(sources.map((rule) => `${rule.project}\n${rule.host}`));
    const snapshot = JSON.parse(gunzipSync(repairBackup));
    const changedIds = snapshot.tables.bot_hits
      .filter((r) => !r.heartbeat && r.event_id == null && r.status_code === 200 && sourceKeys.has(`${r.project_name}\n${r.host}`))
      .map((r) => r.id);

    await tx`CREATE TEMP TABLE revert_candidates (id UUID PRIMARY KEY, action TEXT NOT NULL) ON COMMIT DROP`;
    // The repair's own predicate, applied to rows that were 200 in its backup.
    await tx`INSERT INTO revert_candidates
      SELECT b.id, 'restored' FROM bot_hits b JOIN unnest(${changedIds}::uuid[]) AS c(id) USING (id)
      WHERE b.heartbeat = FALSE AND b.event_id IS NULL AND b.status_code = 0 AND b.created_at < ${plan.before}::timestamptz`;
    for (const rule of sources) {
      await tx`INSERT INTO revert_candidates
        SELECT id, 'forwarded' FROM bot_hits WHERE heartbeat = FALSE AND event_id IS NOT NULL AND status_code = 0
          AND created_at < ${forwardedUntil}::timestamptz AND project_name = ${rule.project} AND host = ${rule.host}
        ON CONFLICT DO NOTHING`;
      // A 0 after the cutoff means an unfixed sender is still running.
      const [late] = await tx`SELECT COUNT(*)::int AS count FROM bot_hits WHERE heartbeat = FALSE AND event_id IS NOT NULL
        AND status_code = 0 AND created_at >= ${forwardedUntil}::timestamptz AND project_name = ${rule.project} AND host = ${rule.host}`;
      if (late.count) throw new Error(`${rule.project} ${rule.host} still reported ${late.count} forwarded requests as 0 after --forwarded-until; deploy the fixed sender or move the cutoff.`);
    }
    const [counts] = await tx`SELECT COUNT(*) FILTER (WHERE action = 'restored')::int AS "restoredRows",
      COUNT(*) FILTER (WHERE action = 'forwarded')::int AS "forwardedRows" FROM revert_candidates`;
    if (counts.restoredRows !== repair.summary.statusRows) {
      throw new Error(`Expected ${repair.summary.statusRows} rows still changed by ${repairId}, found ${counts.restoredRows}; review before applying.`);
    }

    let backupHash = "dry-run";
    if (apply) {
      const before = { format: 1, reverts: repairId, capturedAt: new Date().toISOString(), tables: {} };
      for (const table of ["bot_hits", "bot_hits_daily", "bot_first_seen", "raw_retention_state", "history_repairs"]) {
        before.tables[table] = (await tx`SELECT to_jsonb(t) AS row FROM ${tx(table)} t`).map((r) => r.row);
      }
      const compressed = gzipSync(JSON.stringify(before));
      writeFileSync(backupPath, compressed, { flag: "wx", mode: 0o600 });
      const saved = readFileSync(backupPath);
      backupHash = sha256(saved);
      if (backupHash !== sha256(compressed)) throw new Error("Backup checksum verification failed.");
      const restored = JSON.parse(gunzipSync(saved));
      for (const table of Object.keys(before.tables)) {
        if (restored.tables[table].length !== before.tables[table].length) throw new Error("Backup row-count verification failed.");
      }
    }

    const statusClass = `CASE WHEN status_code BETWEEN 200 AND 299 THEN '2xx' WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
      WHEN status_code BETWEEN 400 AND 499 THEN '4xx' WHEN status_code BETWEEN 500 AND 599 THEN '5xx' ELSE 'unknown' END`;
    const residual = (name) => tx.unsafe(`CREATE TEMP TABLE ${name} ON COMMIT DROP AS
      WITH raw AS (
        SELECT created_at::date AS day, project_name, bot_name, bot_category, ${statusClass} AS status_class,
          SUM(1/sample_rate::text::numeric)::int AS hits,
          COALESCE(SUM(1/sample_rate::text::numeric) FILTER (WHERE confidence = 'verified'), 0)::int AS verified_hits
        FROM bot_hits WHERE heartbeat = FALSE GROUP BY 1, 2, 3, 4, 5
      ) SELECT COALESCE(d.day, r.day) AS day, COALESCE(d.project_name, r.project_name) AS project_name,
          COALESCE(d.bot_name, r.bot_name) AS bot_name, COALESCE(d.bot_category, r.bot_category) AS bot_category,
          COALESCE(d.status_class, r.status_class) AS status_class,
          COALESCE(d.hits, 0) - COALESCE(r.hits, 0) AS hits, COALESCE(d.verified_hits, 0) - COALESCE(r.verified_hits, 0) AS verified_hits
        FROM bot_hits_daily d FULL JOIN raw r USING (day, project_name, bot_name, bot_category, status_class)`);
    await residual("revert_residual_before");
    // Weighted per day/project/bot exactly as the repair moved them, and as
    // ingestion added the interim 0s to the unknown bucket.
    await tx`CREATE TEMP TABLE revert_deltas ON COMMIT DROP AS
      SELECT b.created_at::date AS day, b.project_name, b.bot_name, b.bot_category,
        SUM(1/b.sample_rate::text::numeric)::int AS hits,
        COALESCE(SUM(1/b.sample_rate::text::numeric) FILTER (WHERE b.confidence = 'verified'), 0)::int AS verified_hits
      FROM bot_hits b JOIN revert_candidates USING (id) GROUP BY 1, 2, 3, 4`;
    const changes = await tx`SELECT b.project_name, c.action, SUM(1/b.sample_rate::text::numeric)::int AS requests
      FROM bot_hits b JOIN revert_candidates c USING (id) GROUP BY 1, 2 ORDER BY 1, 2`;
    await tx`UPDATE bot_hits_daily d SET hits = d.hits - r.hits, verified_hits = d.verified_hits - r.verified_hits
      FROM revert_deltas r WHERE d.day = r.day AND d.project_name = r.project_name AND d.bot_name = r.bot_name
        AND d.bot_category = r.bot_category AND d.status_class = 'unknown'`;
    await tx`INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
      SELECT day, project_name, bot_name, bot_category, '2xx', hits, verified_hits FROM revert_deltas
      ON CONFLICT (day, project_name, bot_name, bot_category, status_class) DO UPDATE SET
        hits = bot_hits_daily.hits + EXCLUDED.hits, verified_hits = bot_hits_daily.verified_hits + EXCLUDED.verified_hits`;
    await tx`UPDATE bot_hits b SET status_code = 200 FROM revert_candidates c WHERE b.id = c.id`;
    await tx`DELETE FROM bot_hits_daily WHERE hits = 0 AND verified_hits = 0`;
    const [bad] = await tx`SELECT COUNT(*)::int AS count FROM bot_hits_daily WHERE hits < 0 OR verified_hits < 0 OR verified_hits > hits`;
    if (bad.count) throw new Error("Invalid rollup counts; all changes rolled back.");
    // Raw rows and daily buckets moved together: every bucket keeps exactly
    // the residual it had, including aggregate-only history.
    await residual("revert_residual_after");
    const [drift] = await tx`SELECT COUNT(*)::int AS count FROM revert_residual_after a
      FULL JOIN revert_residual_before b USING (day, project_name, bot_name, bot_category, status_class)
      WHERE COALESCE(a.hits, 0) != COALESCE(b.hits, 0) OR COALESCE(a.verified_hits, 0) != COALESCE(b.verified_hits, 0)`;
    if (drift.count) throw new Error("Raw/daily parity changed; all changes rolled back.");
    report = { mode: apply ? "applied" : "dry_run", reverts: repairId, forwardedUntil, ...counts, changes };
    await tx`INSERT INTO history_repairs (id, manifest_sha256, manifest, backup_sha256, summary)
      VALUES (${id}, ${sha256(JSON.stringify({ reverts: repairId, forwardedUntil }))}, ${tx.json({ reverts: repairId, forwardedUntil })},
        ${backupHash}, ${tx.json(report)})`;
    if (!apply) throw dryRun;
  });
} catch (error) {
  if (error !== dryRun) throw error;
} finally {
  await sql.end();
}
console.log(JSON.stringify(report, null, 2));
