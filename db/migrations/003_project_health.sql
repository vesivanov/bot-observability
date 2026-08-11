CREATE TABLE IF NOT EXISTS project_health (
  project_name       TEXT PRIMARY KEY,
  last_heartbeat_at  TIMESTAMPTZ NOT NULL,
  environment        TEXT NOT NULL DEFAULT 'production',
  deployment_url     TEXT NOT NULL DEFAULT ''
);

-- Preserve the most recent heartbeat from pre-003 deployments without
-- carrying the old append-only heartbeat rows into the new health model.
INSERT INTO project_health (project_name, last_heartbeat_at, environment, deployment_url)
SELECT
  project_name,
  MAX(created_at),
  (ARRAY_AGG(environment ORDER BY created_at DESC))[1],
  (ARRAY_AGG(deployment_url ORDER BY created_at DESC))[1]
FROM bot_hits
WHERE heartbeat = TRUE AND project_name != ''
GROUP BY project_name
ON CONFLICT (project_name) DO UPDATE SET
  last_heartbeat_at = GREATEST(project_health.last_heartbeat_at, EXCLUDED.last_heartbeat_at),
  environment = EXCLUDED.environment,
  deployment_url = EXCLUDED.deployment_url;

CREATE INDEX IF NOT EXISTS idx_project_health_heartbeat ON project_health (last_heartbeat_at DESC);
