import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import postgres from "postgres";
import { loadEnv } from "./env.mjs";

// Explicit project/host evidence, a fixed cutoff, expected row counts, a
// verified private backup and an atomic ledger make this an operator repair,
// not a heuristic that silently rewrites every installation's history.
loadEnv();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const value = (flag) => args[args.indexOf(flag) + 1];
const manifestPath = args.includes("--manifest") ? value("--manifest") : "";
const backupPath = args.includes("--backup") ? value("--backup") : "";
if (!manifestPath || !process.env.DATABASE_URL || (apply && !isAbsolute(backupPath))) {
  throw new Error("Usage: DATABASE_URL=... node scripts/repair-history.mjs --manifest plan.json [--apply --backup /private/path/snapshot.json.gz]");
}
const manifestText = readFileSync(manifestPath, "utf8");
const plan = JSON.parse(manifestText);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const manifestHash = sha256(manifestText);
if (!/^[a-zA-Z0-9._-]{1,128}$/.test(plan.id ?? "") || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(plan.before ?? "") || !Number.isFinite(Date.parse(plan.before))) {
  throw new Error("Manifest requires an ID and a fixed UTC before timestamp.");
}
for (const field of ["unknownStatusSources", "excludeLocalSources"]) {
  if (!Array.isArray(plan[field])) throw new Error(`Missing ${field}`);
  for (const rule of plan[field]) {
    if (!rule.project || !rule.host || !rule.evidence) throw new Error("Every rule requires an exact project, host and source evidence.");
    // Exclusions are deliberately restricted to proven local test targets.
    if (field === "excludeLocalSources" && !/^localhost(?::\d+)?$/.test(rule.host)) throw new Error("Only exact localhost test hosts can be excluded by this repair.");
  }
}
for (const key of ["statusRows", "excludedRows", "restoredRollupHits", "aggregateOnlyRequests"]) {
  if (!Number.isSafeInteger(plan.expected?.[key]) || plan.expected[key] < 0) throw new Error(`Missing expected ${key}`);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, connection: { timezone: "UTC", lock_timeout: 5000, statement_timeout: 30000 },
});
const dryRun = new Error("Dry run rollback");
let report;
try {
  await sql.begin(async (tx) => {
    // Ingestion's raw/daily/first-seen CTE is atomic. Acquiring these locks in
    // the same order waits for existing writers and queues new ones briefly.
    // Dashboard SELECTs continue, and see either the entire old or new state.
    await tx`LOCK TABLE bot_hits, bot_hits_daily, bot_first_seen, history_repairs IN SHARE ROW EXCLUSIVE MODE`;
    const [existing] = await tx`SELECT manifest_sha256, summary FROM history_repairs WHERE id = ${plan.id}`;
    if (existing) {
      if (existing.manifest_sha256 !== manifestHash) throw new Error("Repair ID was already used with a different manifest.");
      report = { ...existing.summary, mode: "already_applied" };
      return;
    }
    await tx`CREATE TEMP TABLE repair_candidates (id UUID PRIMARY KEY, action TEXT NOT NULL) ON COMMIT DROP`;
    for (const rule of plan.excludeLocalSources) {
      await tx`INSERT INTO repair_candidates
        SELECT id, 'exclude' FROM bot_hits WHERE heartbeat = FALSE AND event_id IS NULL
          AND created_at < ${plan.before}::timestamptz AND project_name = ${rule.project} AND host = ${rule.host}
          AND vercel_id = '' AND deployment_url = ''
        ON CONFLICT DO NOTHING`;
    }
    for (const rule of plan.unknownStatusSources) {
      await tx`INSERT INTO repair_candidates
        SELECT id, 'unknown' FROM bot_hits WHERE heartbeat = FALSE AND event_id IS NULL
          AND created_at < ${plan.before}::timestamptz AND project_name = ${rule.project} AND host = ${rule.host}
          AND status_code = 200
        ON CONFLICT DO NOTHING`;
    }
    const [counts] = await tx`SELECT COUNT(*) FILTER (WHERE action = 'unknown')::int AS "statusRows",
      COUNT(*) FILTER (WHERE action = 'exclude')::int AS "excludedRows" FROM repair_candidates`;
    if (counts.statusRows !== plan.expected.statusRows || counts.excludedRows !== plan.expected.excludedRows) {
      throw new Error(`Candidate counts changed: ${JSON.stringify(counts)}; review the manifest before applying.`);
    }
    const [invalid] = await tx`SELECT COUNT(*)::int AS count FROM bot_hits
      WHERE heartbeat = FALSE AND sample_rate::text::numeric NOT IN (1, 0.5, 0.25, 0.1)`;
    if (invalid.count) throw new Error("Legacy fractional weights require a separate reviewed repair.");
    // Do not accidentally erase a first/last-seen boundary that may span
    // pruned history. This repair refuses that case for explicit review.
    const [boundary] = await tx`SELECT COUNT(*)::int AS count FROM repair_candidates c
      JOIN bot_hits b USING (id) JOIN bot_first_seen f USING (bot_name)
      WHERE c.action = 'exclude' AND (b.created_at = f.first_seen OR b.created_at = f.last_seen)`;
    if (boundary.count) throw new Error("Local exclusions affect first/last-seen boundaries; a separate metadata repair is required.");

    let backupHash = "dry-run";
    if (apply) {
      const snapshot = { format: 1, manifest: plan, capturedAt: new Date().toISOString(), tables: {} };
      for (const table of ["bot_hits", "bot_hits_daily", "bot_first_seen", "raw_retention_state", "history_repairs"]) {
        snapshot.tables[table] = (await tx`SELECT to_jsonb(t) AS row FROM ${tx(table)} t`).map((r) => r.row);
      }
      const compressed = gzipSync(JSON.stringify(snapshot));
      writeFileSync(backupPath, compressed, { flag: "wx", mode: 0o600 });
      const saved = readFileSync(backupPath);
      backupHash = sha256(saved);
      if (backupHash !== sha256(compressed)) throw new Error("Backup checksum verification failed.");
      const restored = JSON.parse(gunzipSync(saved));
      for (const table of Object.keys(snapshot.tables)) {
        if (restored.tables[table].length !== snapshot.tables[table].length) throw new Error("Backup row-count verification failed.");
      }
    }

    await tx`CREATE TEMP TABLE repair_raw_before ON COMMIT DROP AS
      SELECT created_at::date AS day, project_name, bot_name, bot_category,
        CASE WHEN status_code BETWEEN 200 AND 299 THEN '2xx' WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
          WHEN status_code BETWEEN 400 AND 499 THEN '4xx' WHEN status_code BETWEEN 500 AND 599 THEN '5xx' ELSE 'unknown' END AS status_class,
        SUM(1/sample_rate::text::numeric)::int AS hits,
        COALESCE(SUM(1/sample_rate::text::numeric) FILTER (WHERE confidence = 'verified'), 0)::int AS verified_hits
      FROM bot_hits WHERE heartbeat = FALSE GROUP BY 1, 2, 3, 4, 5`;
    const [floor] = await tx`SELECT COALESCE(SUM(GREATEST(r.hits - COALESCE(d.hits, 0), 0)), 0)::int AS "restoredRollupHits"
      FROM repair_raw_before r LEFT JOIN bot_hits_daily d USING (day, project_name, bot_name, bot_category, status_class)`;
    if (floor.restoredRollupHits !== plan.expected.restoredRollupHits) throw new Error("Rollup deficits changed; review the manifest.");
    // Raw events prove a lower bound even before the completeness watermark.
    // Restore missing increments, but preserve any aggregate-only excess.
    await tx`INSERT INTO bot_hits_daily SELECT * FROM repair_raw_before
      ON CONFLICT (day, project_name, bot_name, bot_category, status_class) DO UPDATE SET
        hits = GREATEST(bot_hits_daily.hits, EXCLUDED.hits),
        verified_hits = GREATEST(bot_hits_daily.verified_hits, EXCLUDED.verified_hits)`;
    await tx`CREATE TEMP TABLE repair_excess_before ON COMMIT DROP AS
      SELECT d.day, d.project_name, d.bot_name, d.bot_category, d.status_class,
        d.hits - COALESCE(r.hits, 0) AS hits, d.verified_hits - COALESCE(r.verified_hits, 0) AS verified_hits
      FROM bot_hits_daily d LEFT JOIN repair_raw_before r USING (day, project_name, bot_name, bot_category, status_class)`;
    await tx`CREATE TEMP TABLE repair_deltas ON COMMIT DROP AS
      SELECT b.created_at::date AS day, b.project_name, b.bot_name, b.bot_category, c.action,
        CASE WHEN b.status_code BETWEEN 200 AND 299 THEN '2xx' WHEN b.status_code BETWEEN 300 AND 399 THEN '3xx'
          WHEN b.status_code BETWEEN 400 AND 499 THEN '4xx' WHEN b.status_code BETWEEN 500 AND 599 THEN '5xx' ELSE 'unknown' END AS status_class,
        SUM(1/b.sample_rate::text::numeric)::int AS hits,
        COALESCE(SUM(1/b.sample_rate::text::numeric) FILTER (WHERE b.confidence = 'verified'), 0)::int AS verified_hits
      FROM bot_hits b JOIN repair_candidates c USING (id) GROUP BY 1, 2, 3, 4, 5, 6`;
    const changes = await tx`SELECT project_name, action, SUM(hits)::int AS requests FROM repair_deltas GROUP BY 1, 2 ORDER BY 1, 2`;
    await tx`UPDATE bot_hits_daily d SET hits = d.hits - r.hits, verified_hits = d.verified_hits - r.verified_hits
      FROM (SELECT day, project_name, bot_name, bot_category, status_class, SUM(hits)::int AS hits, SUM(verified_hits)::int AS verified_hits
        FROM repair_deltas GROUP BY 1, 2, 3, 4, 5) r
      WHERE d.day = r.day AND d.project_name = r.project_name AND d.bot_name = r.bot_name
        AND d.bot_category = r.bot_category AND d.status_class = r.status_class`;
    await tx`INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
      SELECT day, project_name, bot_name, bot_category, 'unknown', hits, verified_hits FROM repair_deltas WHERE action = 'unknown'
      ON CONFLICT (day, project_name, bot_name, bot_category, status_class) DO UPDATE SET
        hits = bot_hits_daily.hits + EXCLUDED.hits, verified_hits = bot_hits_daily.verified_hits + EXCLUDED.verified_hits`;
    await tx`UPDATE bot_hits b SET status_code = 0 FROM repair_candidates c WHERE b.id = c.id AND c.action = 'unknown'`;
    await tx`DELETE FROM bot_hits b USING repair_candidates c WHERE b.id = c.id AND c.action = 'exclude'`;
    await tx`DELETE FROM bot_hits_daily WHERE hits = 0 AND verified_hits = 0`;
    const [bad] = await tx`SELECT COUNT(*)::int AS count FROM bot_hits_daily WHERE hits < 0 OR verified_hits < 0 OR verified_hits > hits`;
    if (bad.count) throw new Error("Invalid rollup counts; all changes rolled back.");
    const [drift] = await tx`WITH raw_after AS (
      SELECT created_at::date AS day, project_name, bot_name, bot_category,
        CASE WHEN status_code BETWEEN 200 AND 299 THEN '2xx' WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
          WHEN status_code BETWEEN 400 AND 499 THEN '4xx' WHEN status_code BETWEEN 500 AND 599 THEN '5xx' ELSE 'unknown' END AS status_class,
        SUM(1/sample_rate::text::numeric)::int AS hits,
        COALESCE(SUM(1/sample_rate::text::numeric) FILTER (WHERE confidence = 'verified'), 0)::int AS verified_hits
      FROM bot_hits WHERE heartbeat = FALSE GROUP BY 1, 2, 3, 4, 5
    ), excess_after AS (
      SELECT COALESCE(d.day, r.day) AS day, COALESCE(d.project_name, r.project_name) AS project_name,
        COALESCE(d.bot_name, r.bot_name) AS bot_name, COALESCE(d.bot_category, r.bot_category) AS bot_category,
        COALESCE(d.status_class, r.status_class) AS status_class,
        COALESCE(d.hits, 0) - COALESCE(r.hits, 0) AS hits, COALESCE(d.verified_hits, 0) - COALESCE(r.verified_hits, 0) AS verified_hits
      FROM bot_hits_daily d FULL JOIN raw_after r USING (day, project_name, bot_name, bot_category, status_class)
    ) SELECT COUNT(*)::int AS count FROM excess_after a FULL JOIN repair_excess_before b
      USING (day, project_name, bot_name, bot_category, status_class)
      WHERE COALESCE(a.hits, 0) != COALESCE(b.hits, 0) OR COALESCE(a.verified_hits, 0) != COALESCE(b.verified_hits, 0)`;
    if (drift.count) throw new Error("Raw/daily parity changed outside the intended correction; all changes rolled back.");
    // Exact same residual as before the correction, after filling proven
    // deficits: no unproven aggregate-only history is removed or reassigned.
    const [residual] = await tx`SELECT
      ((SELECT SUM(hits) FROM bot_hits_daily) - (SELECT SUM(1/sample_rate::text::numeric) FROM bot_hits WHERE heartbeat = FALSE))::int AS "aggregateOnlyRequests"`;
    if (residual.aggregateOnlyRequests !== plan.expected.aggregateOnlyRequests) throw new Error("Aggregate-only history changed; review the manifest.");
    report = { mode: apply ? "applied" : "dry_run", ...counts, ...floor, ...residual, changes };
    await tx`INSERT INTO history_repairs (id, manifest_sha256, manifest, backup_sha256, summary)
      VALUES (${plan.id}, ${manifestHash}, ${tx.json(plan)}, ${backupHash}, ${tx.json(report)})`;
    if (!apply) throw dryRun;
  });
} catch (error) {
  if (error !== dryRun) throw error;
} finally {
  await sql.end();
}
console.log(JSON.stringify(report, null, 2));
