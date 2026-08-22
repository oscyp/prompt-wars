-- ============================================================================
-- Provider cost telemetry: replace an abstract unit with measured money
-- ============================================================================
--
-- Why
-- ---
-- Nothing in this repo records what a generation actually costs.
-- `video_jobs.cost_units` is an abstract integer with no currency and no
-- conversion, so every economic statement about this product -- subscription
-- allowance, credit pack pricing, the daily free-video cap, whether the free
-- faucet is affordable -- currently rests on a guessed cost per clip.
--
-- Until that guess is replaced by a measurement, repricing is not an engineering
-- decision, it is a coin flip. This migration adds the recording; repricing is
-- deliberately NOT done here.
--
-- What is recorded
-- ----------------
--   provider_cost_usd     what the provider charged, in USD (NUMERIC, exact)
--   provider_latency_ms   submit -> terminal, for capacity and timeout tuning
--
-- Judge calls are recorded too, on `judge_runs`. That cost is easy to overlook:
-- runJudgePipeline calls the provider 2-3 times per ROUND, and every battle is
-- Bo3, so a completed battle can be 9 judge calls. At Grok 4 pricing that is
-- the same order of magnitude as a short video, and any model-choice or
-- allowance decision that ignores it will be wrong.
--
-- `daily_provider_costs` rolls both up per UTC day so the number can be read at
-- a glance instead of assembled by hand each time.
--
-- NUMERIC(10,6) rather than a float: money, and per-call amounts are fractions
-- of a cent that must not accumulate binary rounding error over thousands of
-- rows.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE VIEW.
-- ============================================================================

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS provider_cost_usd   NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS provider_latency_ms INTEGER;

COMMENT ON COLUMN public.video_jobs.provider_cost_usd IS
  'Actual provider charge in USD for this job. NULL for mock/unbilled runs. '
  'Replaces cost_units, which was an abstract integer with no currency.';

COMMENT ON COLUMN public.video_jobs.provider_latency_ms IS
  'Submit to terminal state, in ms. Informs the hard-timeout constant.';

ALTER TABLE public.judge_runs
  ADD COLUMN IF NOT EXISTS provider_cost_usd   NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS provider_latency_ms INTEGER;

COMMENT ON COLUMN public.judge_runs.provider_cost_usd IS
  'Actual judge provider charge in USD. The pipeline runs 2-3 calls per round '
  'and every battle is Bo3, so this is a material per-battle cost, not noise.';

CREATE INDEX IF NOT EXISTS idx_video_jobs_cost_day
  ON public.video_jobs (created_at)
  WHERE provider_cost_usd IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judge_runs_cost_day
  ON public.judge_runs (created_at)
  WHERE provider_cost_usd IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Daily rollup
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.daily_provider_costs
WITH (security_invoker = true) AS
SELECT
  day,
  SUM(video_cost)     AS video_cost_usd,
  SUM(video_calls)    AS video_calls,
  SUM(judge_cost)     AS judge_cost_usd,
  SUM(judge_calls)    AS judge_calls,
  SUM(video_cost) + SUM(judge_cost) AS total_cost_usd
FROM (
  SELECT
    date_trunc('day', v.created_at)::DATE AS day,
    COALESCE(SUM(v.provider_cost_usd), 0) AS video_cost,
    COUNT(*) FILTER (WHERE v.provider_cost_usd IS NOT NULL) AS video_calls,
    0::NUMERIC AS judge_cost,
    0::BIGINT  AS judge_calls
  FROM public.video_jobs v
  GROUP BY 1

  UNION ALL

  SELECT
    date_trunc('day', j.created_at)::DATE AS day,
    0::NUMERIC,
    0::BIGINT,
    COALESCE(SUM(j.provider_cost_usd), 0),
    COUNT(*) FILTER (WHERE j.provider_cost_usd IS NOT NULL)
  FROM public.judge_runs j
  GROUP BY 1
) parts
GROUP BY day
ORDER BY day DESC;

COMMENT ON VIEW public.daily_provider_costs IS
  'Measured provider spend per UTC day across video and judge calls. This is '
  'the input the economy work needs: do not reprice allowances or credit packs '
  'from an assumed cost per clip while this view has real numbers in it.';

REVOKE ALL ON public.daily_provider_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.daily_provider_costs TO service_role;
