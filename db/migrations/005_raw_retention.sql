-- Completeness starts with the next full UTC day after upgrade. Earlier
-- pruning cannot be inferred from the oldest surviving event. An operator
-- can explicitly attest an earlier complete interval during reconciliation.
CREATE TABLE IF NOT EXISTS raw_retention_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  complete_from DATE NOT NULL,
  pruned_before DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO raw_retention_state (singleton, complete_from)
VALUES (TRUE, (now() AT TIME ZONE 'UTC')::date + 1)
ON CONFLICT (singleton) DO NOTHING;
