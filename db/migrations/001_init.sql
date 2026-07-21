CREATE TABLE IF NOT EXISTS bot_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_name TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT 'production',
  host TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  query_string TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER NOT NULL DEFAULT 0,
  bot_name TEXT NOT NULL DEFAULT '',
  bot_category TEXT NOT NULL DEFAULT 'generic',
  confidence TEXT NOT NULL DEFAULT 'ua_only',
  user_agent TEXT NOT NULL DEFAULT '',
  referer TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT '',
  deployment_url TEXT NOT NULL DEFAULT '',
  vercel_id TEXT NOT NULL DEFAULT '',
  is_api_route BOOLEAN NOT NULL DEFAULT FALSE,
  sample_rate REAL NOT NULL DEFAULT 1.0,
  heartbeat BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_bot_hits_created_at ON bot_hits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_hits_date_bot ON bot_hits (created_at, bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_hits_date_path ON bot_hits (created_at, path);
CREATE INDEX IF NOT EXISTS idx_bot_hits_bot_category ON bot_hits (bot_category);
CREATE INDEX IF NOT EXISTS idx_bot_hits_host ON bot_hits (host);
