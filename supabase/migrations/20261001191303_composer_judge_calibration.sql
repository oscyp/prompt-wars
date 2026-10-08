-- Draw is a first-class expected outcome. Existing 1/2 labels retain their meaning.
ALTER TABLE public.judge_calibration_sets ALTER COLUMN expected_winner DROP NOT NULL;
ALTER TABLE public.judge_calibration_sets ADD COLUMN IF NOT EXISTS judge_policy_version text NOT NULL DEFAULT 'v1.0.0-mvp';
ALTER TABLE public.judge_calibration_sets ADD COLUMN IF NOT EXISTS dataset_split text NOT NULL DEFAULT 'tuning' CHECK (dataset_split IN ('tuning', 'holdout'));
ALTER TABLE public.judge_calibration_sets ADD COLUMN IF NOT EXISTS label_provenance text NOT NULL DEFAULT 'authored_candidate' CHECK (label_provenance IN ('authored_candidate', 'independently_human_reviewed'));
ALTER TABLE public.judge_calibration_sets ADD COLUMN IF NOT EXISTS situation_snapshot jsonb;
ALTER TABLE public.judge_calibration_runs ADD COLUMN IF NOT EXISTS evaluation_metadata jsonb;
COMMENT ON COLUMN public.judge_calibration_runs.evaluation_metadata IS 'Versioned promotion evidence, actual-model provenance and holdout metrics; authored labels and mock runs cannot authorize promotion.';
-- No policy changes, client grants, seed activation or fabricated review records.
