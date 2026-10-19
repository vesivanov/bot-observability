-- Operational audit only; never included in request counts. Original records
-- are kept in the private backup referenced by each applied repair.
CREATE TABLE IF NOT EXISTS history_repairs (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  manifest_sha256 TEXT NOT NULL,
  manifest JSONB NOT NULL,
  backup_sha256 TEXT NOT NULL,
  summary JSONB NOT NULL
);
