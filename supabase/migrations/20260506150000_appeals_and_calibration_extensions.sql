-- Appeals and Judge Calibration Extensions
-- Adds reversion_payload to appeals and creates judge_calibration_runs table

-- Add reversion_payload to appeals for storing rating/stat changes when appeals overturn
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS reversion_payload JSONB;

-- Judge calibration runs (nightly accuracy checks)
CREATE TABLE IF NOT EXISTS judge_calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Judge configuration
  judge_prompt_version TEXT NOT NULL,
  judge_model_id TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  
  -- Results
  total_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  accuracy NUMERIC(5, 4) NOT NULL, -- e.g., 0.9250 for 92.50%
  threshold NUMERIC(5, 4) NOT NULL, -- e.g., 0.9000 for 90%
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
  
  -- Per-item results
  per_item_results JSONB NOT NULL, -- Array of {id, expected, actual, correct, scores}
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: no client access (service-role only)
ALTER TABLE judge_calibration_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS judge_calibration_runs_no_client_access ON judge_calibration_runs;
CREATE POLICY judge_calibration_runs_no_client_access ON judge_calibration_runs FOR SELECT USING (FALSE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_judge_calibration_runs_created ON judge_calibration_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_judge_calibration_runs_status ON judge_calibration_runs(status, created_at DESC);
