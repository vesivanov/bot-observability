-- Connection probes/checks are not bot traffic and never update analytics.
CREATE TABLE IF NOT EXISTS project_receipts (
  project_name TEXT PRIMARY KEY,
  last_probe_at TIMESTAMPTZ,
  last_collector_check_at TIMESTAMPTZ
);
