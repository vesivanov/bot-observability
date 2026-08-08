-- Rebuild the derived daily rollup after sampling support was introduced.
-- Migration 002 may already be recorded on an existing deployment, so its
-- one-time backfill cannot repair historical sampled rows there. The rollup
-- is derived data and can be rebuilt safely from bot_hits.
DELETE FROM bot_hits_daily;

INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
SELECT
  DATE(created_at),
  project_name,
  bot_name,
  bot_category,
  CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
       WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
       WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
       WHEN status_code >= 500 THEN '5xx'
       ELSE 'unknown'
  END,
  COALESCE(ROUND(SUM(1.0 / NULLIF(sample_rate, 0))), 0),
  COALESCE(ROUND(SUM(1.0 / NULLIF(sample_rate, 0)) FILTER (WHERE confidence = 'verified')), 0)
FROM bot_hits
WHERE heartbeat = FALSE
GROUP BY 1, 2, 3, 4, 5
ON CONFLICT (day, project_name, bot_name, bot_category, status_class)
DO UPDATE SET
  hits = EXCLUDED.hits,
  verified_hits = EXCLUDED.verified_hits;
