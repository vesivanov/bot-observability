CREATE TABLE IF NOT EXISTS bot_hits_daily (
  day           DATE    NOT NULL,
  project_name  TEXT    NOT NULL DEFAULT '',
  bot_name      TEXT    NOT NULL DEFAULT '',
  bot_category  TEXT    NOT NULL DEFAULT 'generic',
  status_class  TEXT    NOT NULL DEFAULT 'unknown',   -- '2xx'|'3xx'|'4xx'|'5xx'|'unknown'
  hits          INTEGER NOT NULL DEFAULT 0,
  verified_hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, project_name, bot_name, bot_category, status_class)
);
CREATE INDEX IF NOT EXISTS idx_bhd_day ON bot_hits_daily (day);
CREATE INDEX IF NOT EXISTS idx_bhd_bot_day ON bot_hits_daily (bot_name, day);

CREATE TABLE IF NOT EXISTS bot_first_seen (
  bot_name   TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL
);

-- raw-table index tuning
CREATE INDEX IF NOT EXISTS idx_bot_hits_project_date ON bot_hits (project_name, created_at) WHERE heartbeat = FALSE;
CREATE INDEX IF NOT EXISTS idx_bot_hits_bot_date     ON bot_hits (bot_name, created_at)     WHERE heartbeat = FALSE;
DROP INDEX IF EXISTS idx_bot_hits_host;              -- confirmed via grep: no query filters on `host`

-- one-time backfill (runs once thanks to schema_migrations tracking)
INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
SELECT DATE(created_at), project_name, bot_name, bot_category,
       CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
            WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
            WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
            WHEN status_code >= 500 THEN '5xx' ELSE 'unknown' END,
       COUNT(*), COUNT(*) FILTER (WHERE confidence = 'verified')
FROM bot_hits WHERE heartbeat = FALSE
GROUP BY 1,2,3,4,5
ON CONFLICT DO NOTHING;

INSERT INTO bot_first_seen (bot_name, first_seen, last_seen)
SELECT bot_name, MIN(created_at), MAX(created_at) FROM bot_hits
WHERE heartbeat = FALSE AND bot_name != '' GROUP BY bot_name
ON CONFLICT DO NOTHING;
