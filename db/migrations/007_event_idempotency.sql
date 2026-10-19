-- A sender generates one ID per website request and reuses it on delivery
-- retries. Legacy events without IDs remain independent requests.
ALTER TABLE bot_hits ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_hits_project_event
  ON bot_hits (project_name, event_id) WHERE event_id IS NOT NULL;
