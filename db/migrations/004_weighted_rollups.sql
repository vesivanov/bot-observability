-- Existing aggregate-only and uncertain partial-day history must survive
-- upgrade. Fill missing buckets without overwriting existing totals. Applied
-- migrations remain recorded and are never rerun. Correct sampled totals for
-- explicitly complete intervals with the paused-ingestion reconcile script.
INSERT INTO bot_hits_daily (day, project_name, bot_name, bot_category, status_class, hits, verified_hits)
SELECT
  DATE(created_at),
  project_name,
  bot_name,
  bot_category,
  CASE WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
       WHEN status_code >= 300 AND status_code < 400 THEN '3xx'
       WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
       WHEN status_code >= 500 AND status_code < 600 THEN '5xx'
       ELSE 'unknown'
  END,
  COALESCE(ROUND(SUM(1.0 / NULLIF(sample_rate, 0))), 0),
  COALESCE(ROUND(SUM(1.0 / NULLIF(sample_rate, 0)) FILTER (WHERE confidence = 'verified')), 0)
FROM bot_hits
WHERE heartbeat = FALSE
GROUP BY 1, 2, 3, 4, 5
ON CONFLICT (day, project_name, bot_name, bot_category, status_class) DO NOTHING;
