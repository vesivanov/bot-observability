import postgres from "postgres";
import type {
  BotHit,
  BotHitRow,
  BotCount,
  BotCategory,
  BotStatusCodeCount,
  DailyCount,
  DailyCategoryCount,
  HourlyCount,
  PageCount,
  BotDetail,
  RollupBotDetail,
  BotConfidenceCount,
  BotDetailReport,
  Mover,
  ProjectPageCount,
  ProjectSummary,
  BotPeriodCount,
  StatusSummary,
  StatusBucket,
  DailyStatusCount,
  StatusCodeCount,
  ProjectStatusBreakdown,
  PageStatusCodeCount,
  FailingPath,
  SensitivePathHit,
  NewBot,
} from "./schema";
import { statusClassOf } from "./schema";
import { normalizeBotCategory, AI_AGENT_BOTS, AI_SEARCH_BOTS } from "./categories";
import { PATTERNS } from "./bots";

// A raw bot_hits row can represent more than one real hit when the ingest
// side applies sampling (route.ts clamps sample_rate to [0.001, 1] and
// defaults to 1). Weight every raw-row count by 1/sample_rate so a row with
// sample_rate=0.1 counts as ~10 real hits. NULLIF guards a stray 0.
// sample_rate defaults to 1, so SUM(HIT_WEIGHT_SQL) is identical to
// COUNT(*) for all unsampled data — this is an identity-preserving change.
const HIT_WEIGHT_SQL = "1.0/NULLIF(sample_rate,0)";

// Appends a category filter to `values` and returns the SQL clause referencing it.
// The pseudo-category "ai" matches all ai_* raw categories via LIKE; any other
// category matches the raw stored bot_category exactly — except for specific AI
// sub-categories (ai_agent / ai_search / ai_training) which ALSO match legacy
// ai_crawler rows that normalizeBotCategory would remap to that category.
function categoryFilterSql(category: string | undefined, values: (string | number)[]): string {
  if (!category) return "";
  if (category === "ai") {
    values.push("ai\\_%");
    return `AND bot_category LIKE $${values.length}`;
  }
  if (category === "ai_agent") {
    const names = Array.from(AI_AGENT_BOTS).map((n) => `'${n}'`).join(",");
    return `AND (bot_category = 'ai_agent' OR (bot_category = 'ai_crawler' AND bot_name IN (${names})))`;
  }
  if (category === "ai_search") {
    const names = Array.from(AI_SEARCH_BOTS).map((n) => `'${n}'`).join(",");
    return `AND (bot_category = 'ai_search' OR (bot_category = 'ai_crawler' AND bot_name IN (${names})))`;
  }
  if (category === "ai_training") {
    const allKnown = Array.from(new Set([...AI_AGENT_BOTS, ...AI_SEARCH_BOTS]));
    const names = allKnown.map((n) => `'${n}'`).join(",");
    return `AND (bot_category = 'ai_training' OR (bot_category = 'ai_crawler' AND bot_name NOT IN (${names})))`;
  }
  values.push(category);
  return `AND bot_category = $${values.length}`;
}

// AI bot identities the dashboard treats specially —— mirrored in JS by the
// company-mapping in src/lib/bot-companies.ts and the legacy remap sets in
// src/lib/categories.ts. Used by the "AI crawls vs. visits" and AI per-bot
// breakdown panels to scope raw/rollup rows to the AI subspace.
//
// Derived from PATTERNS rather than hand-maintained: a hand-maintained copy
// previously drifted out of sync (missing ClaudeBot — Anthropic's own
// training crawler — despite PATTERNS having it) with nothing to catch it.
// Deriving it here means every ai_training/ai_search/ai_agent bot in
// PATTERNS is automatically covered, permanently.
const AI_BOT_NAMES_SQL = Array.from(new Set(
  PATTERNS
    .filter((p) => p.category === "ai_training" || p.category === "ai_search" || p.category === "ai_agent")
    .map((p) => p.name)
)).map((name) => `'${name}'`).join(",");
const AI_CAT_SQL = `'ai_training','ai_search','ai_agent','ai_crawler'`;

export function createDbClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 1,
    connect_timeout: 5,
    connection: {
      statement_timeout: 30000,
      // Every `::date`/DATE()/day-truncation call in this file (insertHit's
      // rollup day, fetchStatsBatch's daily/daily_cats CTEs, fetchRollupStats'
      // day bounds, etc.) implicitly uses the session timezone to convert a
      // TIMESTAMPTZ to a calendar day, while every query bound in this file is
      // built with Date#toISOString() (always UTC). Pin the session to UTC so
      // those two things can never disagree, regardless of the Postgres
      // server's configured default timezone.
      timezone: "UTC",
    },
  });

  async function insertHit(hit: BotHit): Promise<void> {
    // Generate created_at once in JS so the raw row and the rollup `day`
    // (UTC date of this same timestamp) can never disagree.
    const createdAt = new Date();

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO bot_hits (
          created_at, project_name, environment, host, path, query_string,
          method, status_code, bot_name, bot_category, confidence, user_agent,
          referer, ip, country, region, city, timezone,
          deployment_url, vercel_id, is_api_route, sample_rate, heartbeat
        ) VALUES (
          ${createdAt}, ${hit.project_name}, ${hit.environment}, ${hit.host}, ${hit.path}, ${hit.query_string},
          ${hit.method}, ${hit.status_code}, ${hit.bot_name}, ${hit.bot_category}, ${hit.confidence}, ${hit.user_agent},
          ${hit.referer}, ${hit.ip}, ${hit.country}, ${hit.region}, ${hit.city}, ${hit.timezone},
          ${hit.deployment_url}, ${hit.vercel_id}, ${hit.is_api_route}, ${hit.sample_rate}, ${hit.heartbeat}
        )
      `;

      // Heartbeats aren't real bot traffic — skip rollup + first_seen bookkeeping.
      if (hit.heartbeat) return;

      const statusClass = statusClassOf(hit.status_code);
      // A sampled row (sample_rate < 1) represents more than one real hit —
      // weight the rollup increment by 1/sample_rate so bot_hits_daily.hits
      // stays in agreement with the weighted raw-row aggregates in
      // fetchStatsBatch/movers/allBotDetails. sample_rate defaults to 1, so
      // hitWeight is 1 and this is identical to the old `+1` increment for
      // all unsampled data.
      const hitWeight = hit.sample_rate > 0 ? Math.round(1 / hit.sample_rate) : 1;
      const verifiedIncrement = hit.confidence === "verified" ? hitWeight : 0;

      await tx`
        INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
        VALUES (${createdAt}::date, ${hit.project_name}, ${hit.bot_name}, ${hit.bot_category}, ${statusClass}, ${hitWeight}, ${verifiedIncrement})
        ON CONFLICT (day, project_name, bot_name, bot_category, status_class)
        DO UPDATE SET
          hits = bot_hits_daily.hits + EXCLUDED.hits,
          verified_hits = bot_hits_daily.verified_hits + EXCLUDED.verified_hits
      `;

      await tx`
        INSERT INTO bot_first_seen (bot_name, first_seen, last_seen)
        VALUES (${hit.bot_name}, ${createdAt}, ${createdAt})
        ON CONFLICT (bot_name) DO UPDATE SET
          last_seen = GREATEST(bot_first_seen.last_seen, EXCLUDED.last_seen),
          first_seen = LEAST(bot_first_seen.first_seen, EXCLUDED.first_seen)
      `;
    });
  }

  async function queryFiltered(params: {
    botName?: string;
    path?: string;
    project?: string;
    from?: Date;
    to?: Date;
    category?: string;
    confidence?: string;
    limit?: number;
    offset?: number;
  }): Promise<BotHitRow[]> {
    const conditions: string[] = ["heartbeat = FALSE"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    let paramIndex = 1;

    if (params.botName) {
      conditions.push(`bot_name = $${paramIndex++}`);
      values.push(params.botName);
    }
    if (params.path) {
      conditions.push(`path = $${paramIndex++}`);
      values.push(params.path);
    }
    if (params.project) {
      conditions.push(`project_name = $${paramIndex++}`);
      values.push(params.project);
    }
    if (params.category) {
      const categoryClause = categoryFilterSql(params.category, values);
      if (categoryClause) {
        conditions.push(categoryClause.replace(/^AND\s+/, ""));
        paramIndex = values.length + 1;
      }
    }
    if (params.confidence) {
      conditions.push(`confidence = $${paramIndex++}`);
      values.push(params.confidence);
    }
    if (params.from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(params.from.toISOString());
    }
    if (params.to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(params.to.toISOString());
    }

    const lim = params.limit ?? 100;
    const off = params.offset ?? 0;
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `SELECT * FROM bot_hits ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(lim, off);

    return sql.unsafe(query, values) as unknown as Promise<BotHitRow[]>;
  }

  async function allBotDetails(from: Date, to: Date, project?: string, limit = 100): Promise<BotDetail[]> {
    const normalizeBotDetails = (rows: BotDetail[]) => {
      const totals = new Map<string, BotDetail>();
      for (const row of rows) {
        const bot_category = normalizeBotCategory(row.bot_name, row.bot_category);
        const key = `${row.bot_name}:${bot_category}`;
        const current = totals.get(key);
        if (!current) {
          totals.set(key, { ...row, bot_category });
          continue;
        }
        const projects = Array.from(new Set(
          `${current.projects}, ${row.projects}`
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        )).sort().join(", ");
        totals.set(key, {
          ...current,
          total_hits: current.total_hits + row.total_hits,
          verified_hits: current.verified_hits + row.verified_hits,
          projects,
          last_seen: new Date(row.last_seen) > new Date(current.last_seen) ? row.last_seen : current.last_seen,
        });
      }
      return Array.from(totals.values()).sort((a, b) => b.total_hits - a.total_hits).slice(0, limit);
    };
    if (project) {
      const rows = await sql.unsafe(`
        SELECT
          bot_name,
          bot_category,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
          STRING_AGG(DISTINCT project_name, ', ' ORDER BY project_name) as projects,
          MAX(created_at)::text as last_seen
        FROM bot_hits
        WHERE created_at >= $1
          AND created_at <= $2
          AND heartbeat = FALSE
          AND project_name = $3
        GROUP BY bot_name, bot_category
        ORDER BY total_hits DESC
        LIMIT ${limit * 2}
      `, [from.toISOString(), to.toISOString(), project]) as unknown as BotDetail[];
      return normalizeBotDetails(rows);
    }
    const rows = await sql.unsafe(`
      SELECT
        bot_name,
        bot_category,
        ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
        ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
        STRING_AGG(DISTINCT project_name, ', ' ORDER BY project_name) as projects,
        MAX(created_at)::text as last_seen
      FROM bot_hits
      WHERE created_at >= $1
        AND created_at <= $2
        AND heartbeat = FALSE
      GROUP BY bot_name, bot_category
      ORDER BY total_hits DESC
      LIMIT ${limit * 2}
    `, [from.toISOString(), to.toISOString()]) as unknown as BotDetail[];
    return normalizeBotDetails(rows);
  }

  async function movers(params: {
    dimension: "bot" | "page" | "project";
    currentFrom: Date;
    currentTo: Date;
    previousFrom: Date;
    previousTo: Date;
    project?: string;
    category?: string;
    limit?: number;
  }): Promise<Mover[]> {
    const keyExpression = params.dimension === "bot"
      ? "bot_name"
      : params.dimension === "page"
        ? "path"
        : "project_name";
    const labelExpression = keyExpression;
    const projectExpression = params.dimension === "project" ? "project_name" : "project_name";
    const values: (string | number)[] = [
      params.currentFrom.toISOString(),
      params.currentTo.toISOString(),
      params.previousFrom.toISOString(),
      params.previousTo.toISOString(),
    ];
    let projectClause = "";
    if (params.project) {
      values.push(params.project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(params.category, values);
    values.push(params.limit ?? 5);
    const limitParam = `$${values.length}`;

    return sql.unsafe(`
      WITH current_period AS (
        SELECT
          ${keyExpression} AS key,
          ${labelExpression} AS label,
          ${projectExpression} AS project,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int AS count
        FROM bot_hits
        WHERE created_at > $1
          AND created_at <= $2
          AND heartbeat = FALSE
          AND ${keyExpression} != ''
          ${projectClause}
          ${categoryClause}
        GROUP BY ${keyExpression}, ${projectExpression}
      ),
      previous_period AS (
        SELECT
          ${keyExpression} AS key,
          ${projectExpression} AS project,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int AS count
        FROM bot_hits
        WHERE created_at > $3
          AND created_at <= $4
          AND heartbeat = FALSE
          AND ${keyExpression} != ''
          ${projectClause}
          ${categoryClause}
        GROUP BY ${keyExpression}, ${projectExpression}
      )
      SELECT
        c.key,
        c.label,
        c.project,
        c.count AS current_count,
        COALESCE(p.count, 0)::int AS previous_count,
        (c.count - COALESCE(p.count, 0))::int AS delta
      FROM current_period c
      LEFT JOIN previous_period p ON p.key = c.key AND p.project = c.project
      WHERE c.count > COALESCE(p.count, 0)
      ORDER BY delta DESC, current_count DESC
      LIMIT ${limitParam}
    `, values) as unknown as Promise<Mover[]>;
  }

  async function botDetailReport(botName: string, from: Date, to: Date, project?: string): Promise<BotDetailReport | null> {
    const projectClause = project ? `AND project_name = $4` : "";
    const values = project
      ? [botName, from.toISOString(), to.toISOString(), project]
      : [botName, from.toISOString(), to.toISOString()];

    const result = await sql.unsafe(`
      WITH base AS (
        SELECT *
        FROM bot_hits
        WHERE bot_name = $1
          AND created_at >= $2
          AND created_at <= $3
          AND heartbeat = FALSE
          ${projectClause}
      ),
      project_rank AS (
        SELECT project_name, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, project_name) AS rank
        FROM base
        GROUP BY project_name
      ),
      page_rank AS (
        SELECT path, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, path) AS rank
        FROM base
        GROUP BY path
      )
      SELECT
        COALESCE(MAX(base.bot_name), $1) AS bot_name,
        COALESCE(MAX(base.bot_category), 'unknown') AS bot_category,
        COUNT(*)::int AS total_hits,
        COUNT(*) FILTER (WHERE confidence = 'verified')::int AS verified_hits,
        COUNT(*) FILTER (WHERE confidence = 'ua_only')::int AS ua_only_hits,
        COUNT(DISTINCT base.project_name)::int AS projects_hit,
        COALESCE(MAX(pr.project_name) FILTER (WHERE pr.rank = 1), '') AS top_project,
        COALESCE(MAX(pg.path) FILTER (WHERE pg.rank = 1), '') AS top_page,
        MAX(base.created_at)::text AS last_seen,
        COALESCE(MAX(bfs.first_seen)::text, '') AS first_seen
      FROM base
      LEFT JOIN project_rank pr ON pr.rank = 1
      LEFT JOIN page_rank pg ON pg.rank = 1
      LEFT JOIN bot_first_seen bfs ON bfs.bot_name = $1
    `, values) as unknown as BotDetailReport[];

    if (!result[0]?.total_hits) return null;
    return {
      ...result[0],
      bot_category: normalizeBotCategory(result[0].bot_name, result[0].bot_category),
    };
  }

  async function topPagesForBot(botName: string, from: Date, to: Date, limit = 10, project?: string): Promise<ProjectPageCount[]> {
    const projectClause = project ? `AND project_name = $4` : "";
    const values = project
      ? [botName, from.toISOString(), to.toISOString(), project, limit]
      : [botName, from.toISOString(), to.toISOString(), limit];
    const limitParam = project ? "$5" : "$4";

    return sql.unsafe(`
      SELECT
        project_name AS project,
        path,
        COUNT(*)::int AS count,
        $1 AS top_bot,
        MAX(created_at)::text AS last_seen
      FROM bot_hits
      WHERE bot_name = $1
        AND created_at >= $2
        AND created_at <= $3
        AND heartbeat = FALSE
        ${projectClause}
      GROUP BY project_name, path
      ORDER BY count DESC, last_seen DESC
      LIMIT ${limitParam}
    `, values) as unknown as Promise<ProjectPageCount[]>;
  }

  async function hourlyCounts(from: Date, to: Date, project?: string, category?: string): Promise<HourlyCount[]> {
    const values: (string | number)[] = [from.toISOString(), to.toISOString()];
    let projectClause = "";
    if (project) {
      values.push(project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(category, values);

    return sql.unsafe(`
      SELECT
        EXTRACT(HOUR FROM created_at)::int AS hour,
        COUNT(*)::int AS count
      FROM bot_hits
      WHERE created_at >= $1
        AND created_at <= $2
        AND heartbeat = FALSE
        ${projectClause}
        ${categoryClause}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, values) as unknown as Promise<HourlyCount[]>;
  }

  async function botPeriodCounts(params: {
    from: Date;
    to: Date;
    granularity: "day" | "week" | "month";
    project?: string;
    category?: string;
    botName?: string;
    limit?: number;
  }): Promise<BotPeriodCount[]> {
    const values: (string | number)[] = [params.from.toISOString(), params.to.toISOString()];
    let projectClause = "";
    if (params.project) {
      values.push(params.project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(params.category, values);
    let botNameClause = "";
    if (params.botName) {
      values.push(params.botName);
      botNameClause = `AND bot_name = $${values.length}`;
    }
    values.push(params.limit ?? 12);
    const limitParam = `$${values.length}`;
    const truncUnit = params.granularity;

    const rows = await sql.unsafe(`
      WITH top_bots AS (
        SELECT bot_name
        FROM bot_hits
        WHERE created_at >= $1
          AND created_at <= $2
          AND heartbeat = FALSE
          ${projectClause}
          ${categoryClause}
          ${botNameClause}
        GROUP BY bot_name
        ORDER BY COUNT(*) DESC, bot_name
        LIMIT ${limitParam}
      )
      SELECT
        DATE_TRUNC('${truncUnit}', created_at)::date::text AS period,
        bot_name,
        MAX(bot_category)::text AS bot_category,
        COUNT(*)::int AS count
      FROM bot_hits
      WHERE created_at >= $1
        AND created_at <= $2
        AND heartbeat = FALSE
        ${projectClause}
        ${categoryClause}
        ${botNameClause}
        AND bot_name IN (SELECT bot_name FROM top_bots)
      GROUP BY DATE_TRUNC('${truncUnit}', created_at)::date, bot_name
      ORDER BY period, count DESC, bot_name
    `, values) as unknown as BotPeriodCount[];

    const totals = new Map<string, BotPeriodCount>();
    for (const row of rows) {
      const bot_category = normalizeBotCategory(row.bot_name, row.bot_category);
      const key = `${row.period}:${row.bot_name}:${bot_category}`;
      const current = totals.get(key);
      totals.set(key, current
        ? { ...current, count: current.count + row.count }
        : { ...row, bot_category });
    }
    return Array.from(totals.values()).sort((a, b) =>
      a.period.localeCompare(b.period) || b.count - a.count || a.bot_name.localeCompare(b.bot_name)
    );
  }

  async function fetchStatusBatch(from: Date, to: Date, project?: string, category?: string) {
    const scLimit = 12;
    const otherLimit = 16;
    // bot_status_codes groups by (bot_name, bot_category, status_code) and is
    // merged in JS by normalized category afterward — a bot with both
    // ai_agent and legacy ai_crawler rows consumes 2 pre-merge slots but
    // collapses to 1 post-merge, so double the raw SQL limit to compensate
    // (mirrors the LIMIT * 2 pattern in allBotDetails).
    const botScLimit = otherLimit * 2;
    const values: (string | number)[] = [from.toISOString(), to.toISOString()];
    let projectClause = "";
    if (project) {
      values.push(project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(category, values);

    const result = await sql.unsafe(`
      WITH base AS (
        SELECT * FROM bot_hits
        WHERE created_at >= $1 AND created_at <= $2 AND heartbeat = FALSE
          ${projectClause} ${categoryClause}
      ),
      base_scode AS (
        SELECT * FROM base WHERE status_code > 0
      ),
      daily_status AS (
        SELECT
          DATE(created_at)::text AS date,
          CASE
            WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
            WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
            WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
            WHEN status_code >= 500 THEN '5xx'
            ELSE 'unknown'
          END AS status_class,
          COUNT(*)::int AS count
        FROM base_scode GROUP BY 1, 2 ORDER BY 1, 2
      ),
      summary AS (
        SELECT
          COUNT(*)::int AS total_hits,
          COUNT(*) FILTER (WHERE status_code > 0)::int AS known_status_hits,
          COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::int AS success_hits,
          COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400)::int AS redirect_hits,
          COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS client_error_hits,
          COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_error_hits,
          COUNT(*) FILTER (WHERE status_code = 0)::int AS unknown_status_hits,
          COUNT(*) FILTER (WHERE is_api_route = TRUE OR path LIKE '/api/%')::int AS api_route_hits,
          COUNT(*) FILTER (
            WHERE path ~* '(^|/)(admin|login|wp-admin|wp-login|phpmyadmin|xmlrpc\\.php|config\\.php)(/|$|\\.)'
               OR path ~* '(^|/)(\\.env|\\.git|\\.aws|\\.ssh|\\.htaccess|\\.htpasswd)($|/)'
               OR path ~* '/(etc/passwd|etc/shadow|proc/self)'
               OR path ~* '\\.(bak|sql|backup|old|dump)(\\.gz)?$'
          )::int AS sensitive_path_hits,
          COUNT(*) FILTER (WHERE confidence = 'ua_only')::int AS ua_only_hits
        FROM base
      ),
      buckets AS (
        SELECT
          CASE
            WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
            WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
            WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
            WHEN status_code >= 500 THEN '5xx'
            ELSE 'unknown'
          END AS status_class,
          COUNT(*)::int AS count
        FROM base GROUP BY status_class ORDER BY status_class
      ),
      sc_proj_rank AS (
        SELECT status_code, project_name, ROW_NUMBER() OVER (PARTITION BY status_code ORDER BY COUNT(*) DESC, project_name) AS rank
        FROM base_scode GROUP BY status_code, project_name
      ),
      sc_bot_rank AS (
        SELECT status_code, bot_name, ROW_NUMBER() OVER (PARTITION BY status_code ORDER BY COUNT(*) DESC, bot_name) AS rank
        FROM base_scode GROUP BY status_code, bot_name
      ),
      sc_path_rank AS (
        SELECT status_code, path, ROW_NUMBER() OVER (PARTITION BY status_code ORDER BY COUNT(*) DESC, path) AS rank
        FROM base_scode GROUP BY status_code, path
      ),
      status_codes AS (
        SELECT
          b.status_code, COUNT(*)::int AS count,
          COALESCE(MAX(pr.project_name) FILTER (WHERE pr.rank = 1), '') AS top_project,
          COALESCE(MAX(br.bot_name) FILTER (WHERE br.rank = 1), '') AS top_bot,
          COALESCE(MAX(pa.path) FILTER (WHERE pa.rank = 1), '') AS top_path,
          MAX(b.created_at)::text AS last_seen
        FROM base_scode b
        LEFT JOIN sc_proj_rank pr ON pr.status_code = b.status_code AND pr.rank = 1
        LEFT JOIN sc_bot_rank br ON br.status_code = b.status_code AND br.rank = 1
        LEFT JOIN sc_path_rank pa ON pa.status_code = b.status_code AND pa.rank = 1
        GROUP BY b.status_code ORDER BY count DESC, b.status_code LIMIT ${scLimit}
      ),
      ps_base AS (
        SELECT * FROM base_scode WHERE project_name != ''
      ),
      ps_bot_rank AS (
        SELECT project_name, status_code, bot_name, ROW_NUMBER() OVER (PARTITION BY project_name, status_code ORDER BY COUNT(*) DESC, bot_name) AS rank
        FROM ps_base GROUP BY project_name, status_code, bot_name
      ),
      ps_path_rank AS (
        SELECT project_name, status_code, path, ROW_NUMBER() OVER (PARTITION BY project_name, status_code ORDER BY COUNT(*) DESC, path) AS rank
        FROM ps_base GROUP BY project_name, status_code, path
      ),
      project_statuses AS (
        SELECT
          b.project_name AS project, b.status_code, COUNT(*)::int AS count,
          COALESCE(MAX(br.bot_name) FILTER (WHERE br.rank = 1), '') AS top_bot,
          COALESCE(MAX(pa.path) FILTER (WHERE pa.rank = 1), '') AS top_path,
          MAX(b.created_at)::text AS last_seen
        FROM ps_base b
        LEFT JOIN ps_bot_rank br ON br.project_name = b.project_name AND br.status_code = b.status_code AND br.rank = 1
        LEFT JOIN ps_path_rank pa ON pa.project_name = b.project_name AND pa.status_code = b.status_code AND pa.rank = 1
        GROUP BY b.project_name, b.status_code ORDER BY count DESC, b.project_name, b.status_code LIMIT ${otherLimit}
      ),
      bsc_proj_rank AS (
        SELECT bot_name, bot_category, status_code, project_name, ROW_NUMBER() OVER (PARTITION BY bot_name, bot_category, status_code ORDER BY COUNT(*) DESC, project_name) AS rank
        FROM base_scode GROUP BY bot_name, bot_category, status_code, project_name
      ),
      bsc_path_rank AS (
        SELECT bot_name, bot_category, status_code, path, ROW_NUMBER() OVER (PARTITION BY bot_name, bot_category, status_code ORDER BY COUNT(*) DESC, path) AS rank
        FROM base_scode GROUP BY bot_name, bot_category, status_code, path
      ),
      bot_status_codes AS (
        SELECT
          b.bot_name, b.bot_category, b.status_code, COUNT(*)::int AS count,
          COALESCE(MAX(pr.project_name) FILTER (WHERE pr.rank = 1), '') AS top_project,
          COALESCE(MAX(pa.path) FILTER (WHERE pa.rank = 1), '') AS top_path,
          MAX(b.created_at)::text AS last_seen
        FROM base_scode b
        LEFT JOIN bsc_proj_rank pr ON pr.bot_name = b.bot_name AND pr.bot_category = b.bot_category AND pr.status_code = b.status_code AND pr.rank = 1
        LEFT JOIN bsc_path_rank pa ON pa.bot_name = b.bot_name AND pa.bot_category = b.bot_category AND pa.status_code = b.status_code AND pa.rank = 1
        GROUP BY b.bot_name, b.bot_category, b.status_code ORDER BY count DESC, b.bot_name, b.status_code LIMIT ${botScLimit}
      ),
      psc_bot_rank AS (
        SELECT project_name, path, status_code, bot_name, ROW_NUMBER() OVER (PARTITION BY project_name, path, status_code ORDER BY COUNT(*) DESC, bot_name) AS rank
        FROM base_scode GROUP BY project_name, path, status_code, bot_name
      ),
      page_status_codes AS (
        SELECT
          b.project_name AS project, b.path, b.status_code, COUNT(*)::int AS count,
          COALESCE(MAX(br.bot_name) FILTER (WHERE br.rank = 1), '') AS top_bot,
          MAX(b.created_at)::text AS last_seen
        FROM base_scode b
        LEFT JOIN psc_bot_rank br ON br.project_name = b.project_name AND br.path = b.path AND br.status_code = b.status_code AND br.rank = 1
        GROUP BY b.project_name, b.path, b.status_code ORDER BY count DESC, b.project_name, b.path, b.status_code LIMIT ${otherLimit}
      ),
      failing AS (
        SELECT * FROM base WHERE status_code >= 400
      ),
      fp_bot_rank AS (
        SELECT project_name, path, status_code, bot_name, ROW_NUMBER() OVER (PARTITION BY project_name, path, status_code ORDER BY COUNT(*) DESC, bot_name) AS rank
        FROM failing GROUP BY project_name, path, status_code, bot_name
      ),
      failing_paths AS (
        SELECT
          f.project_name AS project, f.path, f.status_code, COUNT(*)::int AS count,
          COALESCE(MAX(br.bot_name) FILTER (WHERE br.rank = 1), '') AS top_bot,
          MAX(f.created_at)::text AS last_seen
        FROM failing f
        LEFT JOIN fp_bot_rank br ON br.project_name = f.project_name AND br.path = f.path AND br.status_code = f.status_code AND br.rank = 1
        GROUP BY f.project_name, f.path, f.status_code ORDER BY count DESC, last_seen DESC LIMIT ${scLimit}
      ),
      bot_top_status AS (
        SELECT bot_name, bot_category, status_code,
          ROW_NUMBER() OVER (PARTITION BY bot_name, bot_category ORDER BY COUNT(*) DESC, status_code DESC) AS rank
        FROM base_scode GROUP BY bot_name, bot_category, status_code
      ),
      bot_statuses AS (
        SELECT
          b.bot_name, b.bot_category,
          COUNT(*)::int AS total_hits,
          COUNT(*) FILTER (WHERE b.status_code >= 400)::int AS error_hits,
          COUNT(*) FILTER (WHERE b.confidence = 'ua_only')::int AS ua_only_hits,
          COALESCE(MAX(ts.status_code) FILTER (WHERE ts.rank = 1), 0)::int AS top_status_code,
          MAX(b.created_at)::text AS last_seen
        FROM base b
        LEFT JOIN bot_top_status ts ON ts.bot_name = b.bot_name AND ts.bot_category = b.bot_category AND ts.rank = 1
        GROUP BY b.bot_name, b.bot_category
        HAVING COUNT(*) FILTER (WHERE b.status_code >= 400) > 0 OR COUNT(*) FILTER (WHERE b.confidence = 'ua_only') > 0
        ORDER BY error_hits DESC, ua_only_hits DESC, total_hits DESC LIMIT ${scLimit}
      ),
      sensitive AS (
        SELECT * FROM base
        WHERE (
          is_api_route = TRUE OR path LIKE '/api/%'
          OR path ~* '(^|/)(admin|login|wp-admin|wp-login|phpmyadmin|xmlrpc\\.php|config\\.php)(/|$|\\.)'
          OR path ~* '(^|/)(\\.env|\\.git|\\.aws|\\.ssh|\\.htaccess|\\.htpasswd)($|/)'
          OR path ~* '/(etc/passwd|etc/shadow|proc/self)'
          OR path ~* '\\.(bak|sql|backup|old|dump)(\\.gz)?$'
        )
      ),
      sen_bot_rank AS (
        SELECT project_name, path, bot_name, ROW_NUMBER() OVER (PARTITION BY project_name, path ORDER BY COUNT(*) DESC, bot_name) AS rank
        FROM sensitive GROUP BY project_name, path, bot_name
      ),
      sensitive_hits AS (
        SELECT
          s.project_name AS project, s.path, COUNT(*)::int AS count,
          COALESCE(MAX(br.bot_name) FILTER (WHERE br.rank = 1), '') AS top_bot,
          MAX(s.created_at)::text AS last_seen
        FROM sensitive s
        LEFT JOIN sen_bot_rank br ON br.project_name = s.project_name AND br.path = s.path AND br.rank = 1
        GROUP BY s.project_name, s.path ORDER BY count DESC, last_seen DESC LIMIT ${scLimit}
      )
      SELECT
        (SELECT row_to_json(summary.*) FROM summary) AS summary_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM buckets) t), '[]') AS buckets_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_status) t), '[]') AS daily_status_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM status_codes) t), '[]') AS status_codes_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM project_statuses) t), '[]') AS project_statuses_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_status_codes) t), '[]') AS bot_status_codes_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM page_status_codes) t), '[]') AS page_status_codes_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM failing_paths) t), '[]') AS failing_paths_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_statuses) t), '[]') AS bot_statuses_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM sensitive_hits) t), '[]') AS sensitive_hits_json
    `, values);

    const row = (result as unknown as Record<string, unknown>[])[0];
    const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) as T : v as T);

    const rawBotStatusCodes = parse<{ bot_name: string; bot_category: string; status_code: number; count: number; top_project: string; top_path: string; last_seen: string }[]>(row.bot_status_codes_json);
    const rawBotStatuses = parse<{ bot_name: string; bot_category: string; total_hits: number; error_hits: number; ua_only_hits: number; top_status_code: number; last_seen: string }[]>(row.bot_statuses_json);

    return {
      summary: parse<StatusSummary>(row.summary_json),
      buckets: parse<StatusBucket[]>(row.buckets_json),
      dailyStatus: parse<DailyStatusCount[]>(row.daily_status_json),
      statusCodes: parse<StatusCodeCount[]>(row.status_codes_json),
      projectStatuses: parse<ProjectStatusBreakdown[]>(row.project_statuses_json),
      botStatusCodes: (() => {
        const map = new Map<string, BotStatusCodeCount>();
        for (const r of rawBotStatusCodes) {
          const cat = normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory;
          const key = `${r.bot_name}:${cat}:${r.status_code}`;
          const cur = map.get(key);
          if (cur) {
            cur.count += r.count;
            if (r.last_seen > cur.last_seen) cur.last_seen = r.last_seen;
            if (r.count > cur.count) { cur.top_project = r.top_project; cur.top_path = r.top_path; }
          } else {
            map.set(key, { ...r, bot_category: cat });
          }
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 16);
      })(),
      pageStatusCodes: parse<PageStatusCodeCount[]>(row.page_status_codes_json),
      failingPaths: parse<FailingPath[]>(row.failing_paths_json),
      botStatuses: (() => {
        const map = new Map<string, {
          bot_name: string; bot_category: BotCategory; total_hits: number;
          error_hits: number; ua_only_hits: number; top_status_code: number; last_seen: string;
        }>();
        for (const r of rawBotStatuses) {
          const cat = normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory;
          const key = `${r.bot_name}:${cat}`;
          const cur = map.get(key);
          if (cur) {
            cur.total_hits += r.total_hits;
            cur.error_hits += r.error_hits;
            cur.ua_only_hits += r.ua_only_hits;
            if (r.last_seen > cur.last_seen) { cur.last_seen = r.last_seen; cur.top_status_code = r.top_status_code; }
          } else {
            map.set(key, { ...r, bot_category: cat });
          }
        }
        return Array.from(map.values()).sort((a, b) => b.error_hits - a.error_hits || b.ua_only_hits - a.ua_only_hits || b.total_hits - a.total_hits);
      })(),
      sensitiveHits: parse<SensitivePathHit[]>(row.sensitive_hits_json),
    };
  }

  async function fetchStatsBatch(from: Date, to: Date, project?: string, category?: string) {
    const values: (string | number)[] = [from.toISOString(), to.toISOString()];
    let projectClause = "";
    if (project) {
      values.push(project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(category, values);

    // bot_conf_ai_all exists so the "AI crawls vs. visits" panel can show the
    // full AI space even when a single AI chip is selected. When no chip is
    // selected, base_nocat === base so bot_conf_ai_all === bot_conf_ai and we
    // skip the extra bot_hits scan entirely (the JS layer falls back to
    // aiBotsWithConfidence for crawls-vs-visits). Both CTEs are conditional
    // together because bot_conf_ai_all references base_nocat.
    const hasCategoryFilter = categoryClause.length > 0;
    const baseNocatCte = hasCategoryFilter ? `,
      base_nocat AS (
        SELECT bot_name, bot_category, confidence, project_name, path, status_code, created_at, sample_rate
        FROM bot_hits
        WHERE created_at > $1
          AND created_at <= $2
          AND heartbeat = FALSE
          ${projectClause}
      )` : "";
    const botConfAiAllCte = hasCategoryFilter ? `,
      -- AI bot aggregation reading from base_nocat (no category chip filter,
      -- project-scoped). Carries every AI category together so the "AI crawls
      -- vs. visits" panel can contrast crawls AND visits even when a single AI
      -- chip filters the per-bot breakdown above.
      bot_conf_ai_all AS (
        SELECT bot_name, bot_category,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'ua_only'))::int as ua_only_hits,
          STRING_AGG(DISTINCT project_name, ', ' ORDER BY project_name) as projects,
          MAX(created_at)::text as last_seen
        FROM base_nocat
        WHERE bot_category IN (${AI_CAT_SQL})
          OR bot_name IN (${AI_BOT_NAMES_SQL})
        GROUP BY bot_name, bot_category ORDER BY total_hits DESC LIMIT 50
      )` : "";

    const result = await sql.unsafe(`
      WITH base AS (
        SELECT bot_name, bot_category, confidence, project_name, path, status_code, created_at, sample_rate
        FROM bot_hits
        WHERE created_at > $1
          AND created_at <= $2
          AND heartbeat = FALSE
          ${projectClause}
          ${categoryClause}
      )${baseNocatCte},
      base_proj AS (
        SELECT * FROM base WHERE project_name != ''
      ),
      total AS (
        SELECT
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE status_code >= 400))::int as error_count,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE status_code > 0))::int as known_status_count
        FROM base
      ),
      top_bots AS (
        -- Grouped by (bot_name, bot_category) and merged in JS by normalized
        -- category afterward (topBotsTotals below) — double the raw limit so
        -- a bot split across ai_agent/legacy ai_crawler rows doesn't lose a
        -- slot to its own pre-merge duplicate (mirrors allBotDetails' LIMIT * 2).
        SELECT bot_name, bot_category, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base GROUP BY bot_name, bot_category ORDER BY count DESC LIMIT 20
      ),
      top_pages AS (
        SELECT path, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base GROUP BY path ORDER BY count DESC LIMIT 10
      ),
      daily AS (
        SELECT DATE(created_at)::text as date, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base GROUP BY DATE(created_at) ORDER BY date
      ),
      daily_cats AS (
        SELECT DATE(created_at)::text as date, bot_name, bot_category, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base GROUP BY DATE(created_at), bot_name, bot_category ORDER BY date
      ),
      projects AS (
        SELECT project_name as project, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base_proj GROUP BY project_name ORDER BY count DESC
      ),
      categories_raw AS (
        SELECT bot_name, bot_category, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count
        FROM base GROUP BY bot_name, bot_category ORDER BY count DESC
      ),
      bot_conf_all AS (
        -- Same pre-merge/post-merge mismatch as top_bots above — double the
        -- raw limit to compensate.
        SELECT bot_name, bot_category,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'ua_only'))::int as ua_only_hits,
          STRING_AGG(DISTINCT project_name, ', ' ORDER BY project_name) as projects,
          MAX(created_at)::text as last_seen
        FROM base GROUP BY bot_name, bot_category ORDER BY total_hits DESC LIMIT 20
      ),
      bot_conf_ai AS (
        SELECT bot_name, bot_category,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'ua_only'))::int as ua_only_hits,
          STRING_AGG(DISTINCT project_name, ', ' ORDER BY project_name) as projects,
          MAX(created_at)::text as last_seen
        FROM base
        WHERE bot_category IN (${AI_CAT_SQL})
          OR bot_name IN (${AI_BOT_NAMES_SQL})
        GROUP BY bot_name, bot_category ORDER BY total_hits DESC LIMIT 50
      )${botConfAiAllCte},
      ps_bot_rank AS (
        SELECT project_name, bot_name,
          ROW_NUMBER() OVER (PARTITION BY project_name ORDER BY SUM(${HIT_WEIGHT_SQL}) DESC, bot_name) as rank
        FROM base_proj GROUP BY project_name, bot_name
      ),
      ps_page_rank AS (
        SELECT project_name, path,
          ROW_NUMBER() OVER (PARTITION BY project_name ORDER BY SUM(${HIT_WEIGHT_SQL}) DESC, path) as rank
        FROM base_proj GROUP BY project_name, path
      ),
      proj_agg AS (
        SELECT project_name as project,
          ROUND(SUM(${HIT_WEIGHT_SQL}))::int as total_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (
            WHERE bot_category IN (${AI_CAT_SQL})
               OR bot_name IN (${AI_BOT_NAMES_SQL})
          ))::int as ai_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'verified'))::int as verified_hits,
          ROUND(SUM(${HIT_WEIGHT_SQL}) FILTER (WHERE confidence = 'ua_only'))::int as ua_only_hits,
          MAX(created_at)::text as last_seen
        FROM base_proj
        GROUP BY project_name
      ),
      proj_summaries AS (
        SELECT pa.project, pa.total_hits, pa.ai_hits, pa.verified_hits, pa.ua_only_hits, pa.last_seen,
          COALESCE(br.bot_name, '') as top_bot,
          COALESCE(pr.path, '') as top_page
        FROM proj_agg pa
        LEFT JOIN ps_bot_rank br ON br.project_name = pa.project AND br.rank = 1
        LEFT JOIN ps_page_rank pr ON pr.project_name = pa.project AND pr.rank = 1
        ORDER BY pa.total_hits DESC
      ),
      tpp_pc AS (
        SELECT project_name, path, ROUND(SUM(${HIT_WEIGHT_SQL}))::int as count, MAX(created_at)::text as last_seen
        FROM base_proj GROUP BY project_name, path
      ),
      tpp_bc AS (
        SELECT project_name, path, bot_name,
          ROW_NUMBER() OVER (PARTITION BY project_name, path ORDER BY SUM(${HIT_WEIGHT_SQL}) DESC, bot_name) as rank
        FROM base_proj GROUP BY project_name, path, bot_name
      ),
      tpp AS (
        SELECT pc.project_name as project, pc.path, pc.count,
          COALESCE(bc.bot_name, '') as top_bot, pc.last_seen
        FROM tpp_pc pc
        LEFT JOIN tpp_bc bc ON bc.project_name = pc.project_name AND bc.path = pc.path AND bc.rank = 1
        ORDER BY pc.count DESC LIMIT 50
      ),
      -- New bots first seen inside [from, to]. Intentionally global (not scoped
      -- by project/category, which this query's $3+ params encode) — a bot is
      -- either new to the whole system or it isn't; that's what "new" means for
      -- the attention strip, regardless of which project/category is filtered.
      new_bots AS (
        SELECT bot_name, first_seen::text AS first_seen
        FROM bot_first_seen
        WHERE first_seen >= $1 AND first_seen <= $2
      )
      SELECT
        (SELECT count FROM total) as total_count,
        (SELECT error_count FROM total) as error_count,
        (SELECT known_status_count FROM total) as known_status_count,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM top_bots) t), '[]') as top_bots_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM top_pages) t), '[]') as top_pages_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily) t), '[]') as daily_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_cats) t), '[]') as daily_cats_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM projects) t), '[]') as projects_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM categories_raw) t), '[]') as categories_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_conf_all) t), '[]') as bot_conf_all_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_conf_ai) t), '[]') as bot_conf_ai_json${hasCategoryFilter ? `,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_conf_ai_all) t), '[]') as bot_conf_ai_all_json,` : ","}
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM proj_summaries) t), '[]') as proj_summaries_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM tpp) t), '[]') as tpp_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM new_bots) t), '[]') as new_bots_json
    `, values);

    const row = (result as Record<string, unknown>[])[0];

    const parseJson = <T>(value: unknown): T => {
      if (typeof value === "string") return JSON.parse(value) as T;
      return value as T;
    };

    const rawTopBots = parseJson<BotCount[]>(row.top_bots_json);
    const rawDailyCats = parseJson<{ date: string; bot_name: string; bot_category: string; count: number }[]>(row.daily_cats_json);
    const rawCategories = parseJson<{ bot_name: string; bot_category: string; count: number }[]>(row.categories_json);
    const rawBotConfAll = parseJson<BotConfidenceCount[]>(row.bot_conf_all_json);
    const rawBotConfAi = parseJson<BotConfidenceCount[]>(row.bot_conf_ai_json);
    const rawBotConfAiAll = hasCategoryFilter
      ? parseJson<BotConfidenceCount[]>(row.bot_conf_ai_all_json)
      : rawBotConfAi;

    const topBotsTotals = new Map<string, BotCount>();
    for (const r of rawTopBots) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      const key = `${r.bot_name}:${cat}`;
      const cur = topBotsTotals.get(key);
      topBotsTotals.set(key, cur ? { ...cur, count: cur.count + r.count } : { ...r, bot_category: cat });
    }
    const topBots = Array.from(topBotsTotals.values()).sort((a, b) => b.count - a.count).slice(0, 10);

    const dailyTrendMap = new Map<string, number>();
    for (const r of parseJson<DailyCount[]>(row.daily_json)) {
      dailyTrendMap.set(r.date, (dailyTrendMap.get(r.date) ?? 0) + r.count);
    }
    const dailyTrend = Array.from(dailyTrendMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const dailyCatTotals = new Map<string, DailyCategoryCount>();
    for (const r of rawDailyCats) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      const key = `${r.date}:${cat}`;
      const existing = dailyCatTotals.get(key);
      if (existing) { existing.count += r.count; } else { dailyCatTotals.set(key, { date: r.date, bot_category: cat, count: r.count }); }
    }
    const dailyCategoryTrend = Array.from(dailyCatTotals.values()).sort((a, b) => a.date.localeCompare(b.date));

    const catTotals = new Map<string, number>();
    for (const r of rawCategories) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + r.count);
    }
    const categories = Array.from(catTotals.entries()).map(([bot_category, count]) => ({ bot_category: bot_category as BotCategory, count })).sort((a, b) => b.count - a.count);

    const topBotsWithConfidence = rawBotConfAll.map(r => ({ ...r, bot_category: normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory })).sort((a, b) => b.total_hits - a.total_hits).slice(0, 10);
    const aiBotsWithConfidence = rawBotConfAi.map(r => ({ ...r, bot_category: normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory })).sort((a, b) => b.total_hits - a.total_hits);
    const aiBotsAllWithConfidence = rawBotConfAiAll.map(r => ({ ...r, bot_category: normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory })).sort((a, b) => b.total_hits - a.total_hits);

    return {
      topBots,
      topPages: parseJson<PageCount[]>(row.top_pages_json),
      dailyTrend,
      dailyCategoryTrend,
      total: (row.total_count as number) ?? 0,
      errorHits: (row.error_count as number) ?? 0,
      knownStatusHits: (row.known_status_count as number) ?? 0,
      projectBreakdown: parseJson<{ project: string; count: number }[]>(row.projects_json),
      projectSummaries: parseJson<ProjectSummary[]>(row.proj_summaries_json),
      topBotsWithConfidence,
      aiBotsWithConfidence,
      aiBotsAllWithConfidence,
      topPagesByProject: parseJson<ProjectPageCount[]>(row.tpp_json),
      categories,
      newBots: parseJson<NewBot[]>(row.new_bots_json),
    };
  }

  // Rollup-backed equivalent of the relevant subset of fetchStatsBatch, for
  // long-range views (>90d) where scanning raw bot_hits would be too slow.
  // `from`/`to` are timestamps but bot_hits_daily is bucketed by UTC calendar
  // date, so we compare against the UTC date of each boundary.
  async function fetchRollupStats(from: Date, to: Date, project?: string, category?: string) {
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    const values: (string | number)[] = [fromDay, toDay];
    let projectClause = "";
    if (project) {
      values.push(project);
      projectClause = `AND project_name = $${values.length}`;
    }
    const categoryClause = categoryFilterSql(category, values);

    // Conditional mirrors of fetchStatsBatch's base_nocat / bot_conf_ai_all —
    // emitted only when a chip filter exists so the unfiltered AI scan is
    // skipped when no filter is applied. JS parses result by column name, so
    // column order doesn't matter.
    const hasCategoryFilter = categoryClause.length > 0;
    const baseNocatCte = hasCategoryFilter ? `,
      base_nocat AS (
        SELECT day, project_name, bot_name, bot_category, status_class, hits, verified_hits
        FROM bot_hits_daily
        WHERE day >= $1::date AND day <= $2::date
          ${projectClause}
      )` : "";
    const botConfAiAllCte = hasCategoryFilter ? `,
      bot_conf_ai_all AS (
        SELECT base_nocat.bot_name, base_nocat.bot_category,
          SUM(base_nocat.hits)::int as total_hits,
          SUM(base_nocat.verified_hits)::int as verified_hits,
          (SUM(base_nocat.hits) - SUM(base_nocat.verified_hits))::int as ua_only_hits,
          STRING_AGG(DISTINCT base_nocat.project_name, ', ' ORDER BY base_nocat.project_name) as projects,
          COALESCE(MAX(bfs.last_seen)::text, '') as last_seen
        FROM base_nocat
        LEFT JOIN bot_first_seen bfs ON bfs.bot_name = base_nocat.bot_name
        WHERE base_nocat.bot_category IN (${AI_CAT_SQL})
          OR base_nocat.bot_name IN (${AI_BOT_NAMES_SQL})
        GROUP BY base_nocat.bot_name, base_nocat.bot_category ORDER BY total_hits DESC LIMIT 50
      )` : "";

    const result = await sql.unsafe(`
      WITH base AS (
        SELECT day, project_name, bot_name, bot_category, status_class, hits, verified_hits
        FROM bot_hits_daily
        WHERE day >= $1::date AND day <= $2::date
          ${projectClause}
          ${categoryClause}
      ),
      total AS (
        SELECT
          COALESCE(SUM(hits), 0)::int AS count,
          COALESCE(SUM(hits) FILTER (WHERE status_class IN ('4xx', '5xx')), 0)::int AS error_count,
          COALESCE(SUM(hits) FILTER (WHERE status_class != 'unknown'), 0)::int AS known_status_count
        FROM base
      ),
      daily AS (
        SELECT day::text AS date, SUM(hits)::int AS count
        FROM base GROUP BY day ORDER BY day
      ),
      daily_cats AS (
        SELECT day::text AS date, bot_name, bot_category, SUM(hits)::int AS count
        FROM base GROUP BY day, bot_name, bot_category ORDER BY day
      ),
      daily_status AS (
        SELECT day::text AS date, status_class, SUM(hits)::int AS count
        FROM base WHERE status_class != 'unknown'
        GROUP BY day, status_class ORDER BY day, status_class
      ),
      categories_raw AS (
        SELECT bot_name, bot_category, SUM(hits)::int AS count
        FROM base GROUP BY bot_name, bot_category
      ),
      top_bots AS (
        -- Same pre-merge/post-merge mismatch as fetchStatsBatch's top_bots —
        -- double the raw limit to compensate.
        SELECT b.bot_name, b.bot_category,
          SUM(b.hits)::int AS total_hits,
          SUM(b.verified_hits)::int AS verified_hits,
          COALESCE(MAX(bfs.last_seen)::text, '') AS last_seen
        FROM base b
        LEFT JOIN bot_first_seen bfs ON bfs.bot_name = b.bot_name
        GROUP BY b.bot_name, b.bot_category
        ORDER BY total_hits DESC LIMIT 20
      ),
      -- neo-mirror of fetchStatsBatch.bot_conf_ai: per-bot AI aggregation
      -- scoped by the chip filter (base) for the AI per-bot breakdown panel.
      bot_conf_ai AS (
        SELECT base.bot_name, base.bot_category,
          SUM(base.hits)::int as total_hits,
          SUM(base.verified_hits)::int as verified_hits,
          (SUM(base.hits) - SUM(base.verified_hits))::int as ua_only_hits,
          STRING_AGG(DISTINCT base.project_name, ', ' ORDER BY base.project_name) as projects,
          COALESCE(MAX(bfs.last_seen)::text, '') as last_seen
        FROM base
        LEFT JOIN bot_first_seen bfs ON bfs.bot_name = base.bot_name
        WHERE base.bot_category IN (${AI_CAT_SQL})
          OR base.bot_name IN (${AI_BOT_NAMES_SQL})
        GROUP BY base.bot_name, base.bot_category ORDER BY total_hits DESC LIMIT 50
      )${baseNocatCte}${botConfAiAllCte}
      SELECT
        (SELECT count FROM total) AS total_count,
        (SELECT error_count FROM total) AS error_count,
        (SELECT known_status_count FROM total) AS known_status_count,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily) t), '[]') AS daily_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_cats) t), '[]') AS daily_cats_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_status) t), '[]') AS daily_status_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM categories_raw) t), '[]') AS categories_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM top_bots) t), '[]') AS top_bots_json,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_conf_ai) t), '[]') AS bot_conf_ai_json${hasCategoryFilter ? `,
        COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM bot_conf_ai_all) t), '[]') AS bot_conf_ai_all_json` : ""}
    `, values);

    const row = (result as Record<string, unknown>[])[0];
    const parseJson = <T>(value: unknown): T => {
      if (typeof value === "string") return JSON.parse(value) as T;
      return value as T;
    };

    const rawDailyCats = parseJson<{ date: string; bot_name: string; bot_category: string; count: number }[]>(row.daily_cats_json);
    const rawCategories = parseJson<{ bot_name: string; bot_category: string; count: number }[]>(row.categories_json);
    const rawTopBots = parseJson<{ bot_name: string; bot_category: string; total_hits: number; verified_hits: number; last_seen: string }[]>(row.top_bots_json);

    const dailyTrend = parseJson<DailyCount[]>(row.daily_json);
    const dailyStatus = parseJson<DailyStatusCount[]>(row.daily_status_json);

    const dailyCatTotals = new Map<string, DailyCategoryCount>();
    for (const r of rawDailyCats) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      const key = `${r.date}:${cat}`;
      const existing = dailyCatTotals.get(key);
      if (existing) { existing.count += r.count; } else { dailyCatTotals.set(key, { date: r.date, bot_category: cat, count: r.count }); }
    }
    const dailyCategoryTrend = Array.from(dailyCatTotals.values()).sort((a, b) => a.date.localeCompare(b.date));

    const catTotals = new Map<string, number>();
    for (const r of rawCategories) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + r.count);
    }
    const categories = Array.from(catTotals.entries()).map(([bot_category, count]) => ({ bot_category: bot_category as BotCategory, count })).sort((a, b) => b.count - a.count);

    const topBotsTotals = new Map<string, BotConfidenceCount>();
    for (const r of rawTopBots) {
      const cat = normalizeBotCategory(r.bot_name, r.bot_category);
      const key = `${r.bot_name}:${cat}`;
      const current = topBotsTotals.get(key);
      const uaOnly = r.total_hits - r.verified_hits;
      if (current) {
        topBotsTotals.set(key, {
          ...current,
          total_hits: current.total_hits + r.total_hits,
          verified_hits: current.verified_hits + r.verified_hits,
          ua_only_hits: current.ua_only_hits + uaOnly,
          last_seen: r.last_seen && (!current.last_seen || new Date(r.last_seen) > new Date(current.last_seen)) ? r.last_seen : current.last_seen,
        });
      } else {
        topBotsTotals.set(key, {
          bot_name: r.bot_name,
          bot_category: cat,
          total_hits: r.total_hits,
          verified_hits: r.verified_hits,
          ua_only_hits: uaOnly,
          projects: "",
          last_seen: r.last_seen ?? "",
        });
      }
    }
    const topBots = Array.from(topBotsTotals.values()).sort((a, b) => b.total_hits - a.total_hits).slice(0, 10);

    const rawBotConfAi = parseJson<BotConfidenceCount[]>(row.bot_conf_ai_json);
    const rawBotConfAiAll = hasCategoryFilter
      ? parseJson<BotConfidenceCount[]>(row.bot_conf_ai_all_json)
      : rawBotConfAi;
    const aiBotsWithConfidence = rawBotConfAi.map((r) => ({ ...r, bot_category: normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory })).sort((a, b) => b.total_hits - a.total_hits);
    const aiBotsAllWithConfidence = rawBotConfAiAll.map((r) => ({ ...r, bot_category: normalizeBotCategory(r.bot_name, r.bot_category) as BotCategory })).sort((a, b) => b.total_hits - a.total_hits);

    return {
      total: (row.total_count as number) ?? 0,
      errorHits: (row.error_count as number) ?? 0,
      knownStatusHits: (row.known_status_count as number) ?? 0,
      dailyTrend,
      dailyCategoryTrend,
      dailyStatus,
      categories,
      topBots,
      aiBotsWithConfidence,
      aiBotsAllWithConfidence,
    };
  }

  // Rollup-backed equivalent of allBotDetails, for long-range views. Per-bot
  // hits/verified come from bot_hits_daily; first_seen/last_seen come from
  // bot_first_seen (exact, not bounded by the query range).
  async function allBotDetailsRollup(from: Date, to: Date, project?: string, limit = 100): Promise<RollupBotDetail[]> {
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    const values: (string | number)[] = [fromDay, toDay];
    let projectClause = "";
    if (project) {
      values.push(project);
      projectClause = `AND project_name = $${values.length}`;
    }

    const rows = await sql.unsafe(`
      SELECT
        d.bot_name,
        d.bot_category,
        SUM(d.hits)::int AS total_hits,
        SUM(d.verified_hits)::int AS verified_hits,
        STRING_AGG(DISTINCT d.project_name, ', ' ORDER BY d.project_name) AS projects,
        COALESCE(MAX(bfs.last_seen)::text, '') AS last_seen,
        COALESCE(MAX(bfs.first_seen)::text, '') AS first_seen
      FROM bot_hits_daily d
      LEFT JOIN bot_first_seen bfs ON bfs.bot_name = d.bot_name
      WHERE d.day >= $1::date AND d.day <= $2::date
        ${projectClause}
      GROUP BY d.bot_name, d.bot_category
      ORDER BY total_hits DESC
      LIMIT ${limit * 2}
    `, values) as unknown as RollupBotDetail[];

    // Merge raw category variants that normalize to the same category, same
    // as allBotDetails' normalizeBotDetails.
    const totals = new Map<string, RollupBotDetail>();
    for (const row of rows) {
      const bot_category = normalizeBotCategory(row.bot_name, row.bot_category);
      const key = `${row.bot_name}:${bot_category}`;
      const current = totals.get(key);
      if (!current) {
        totals.set(key, { ...row, bot_category });
        continue;
      }
      const projects = Array.from(new Set(
        `${current.projects}, ${row.projects}`
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      )).sort().join(", ");
      totals.set(key, {
        ...current,
        total_hits: current.total_hits + row.total_hits,
        verified_hits: current.verified_hits + row.verified_hits,
        projects,
        last_seen: row.last_seen && (!current.last_seen || new Date(row.last_seen) > new Date(current.last_seen)) ? row.last_seen : current.last_seen,
        first_seen: row.first_seen && (!current.first_seen || new Date(row.first_seen) < new Date(current.first_seen)) ? row.first_seen : current.first_seen,
      });
    }
    return Array.from(totals.values()).sort((a, b) => b.total_hits - a.total_hits).slice(0, limit);
  }

  async function fetchMeta(project?: string) {
    const projectClause = project ? `AND project_name = $1` : "";
    const values = project ? [project] : [];

    const result = await sql.unsafe(`
      SELECT
        COALESCE((SELECT json_agg(project_name) FROM (
          SELECT DISTINCT project_name FROM bot_hits WHERE heartbeat = FALSE AND project_name != '' ORDER BY project_name
        ) t), '[]') as projects_json,
        (SELECT MAX(created_at) FROM bot_hits WHERE heartbeat = TRUE) as latest_heartbeat,
        (SELECT MAX(created_at) FROM bot_hits WHERE heartbeat = FALSE ${projectClause}) as latest_event
    `, values);

    const row = (result as Record<string, unknown>[])[0];
    return {
      allProjects: typeof row.projects_json === "string" ? JSON.parse(row.projects_json) as string[] : (row.projects_json as string[]),
      latestHeartbeat: row.latest_heartbeat ? new Date(row.latest_heartbeat as string) : null,
      latestEvent: row.latest_event ? new Date(row.latest_event as string) : null,
    };
  }

  async function close() {
    await sql.end();
  }

  return {
    insertHit,
    queryFiltered,
    hourlyCounts,
    allBotDetails,
    movers,
    botDetailReport,
    topPagesForBot,
    botPeriodCounts,
    fetchStatusBatch,
    fetchStatsBatch,
    fetchMeta,
    fetchRollupStats,
    allBotDetailsRollup,
    close,
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
