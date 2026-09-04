-- Tester-feedback reliability pass.
--
-- 1. Give explicit matchmaking attempts a durable identity so retries cannot
--    create another bot battle or queue row.
-- 2. Enforce one open queue row per player/mode/active fighter while leaving
--    already-matched async battles unconstrained.
-- 3. Give the minute worker an atomic stale-queue cleanup primitive.
-- 4. Complete provider-cost reporting with portrait and prompt-suggestion
--    surfaces. No economy or provider choice changes here.

ALTER TABLE public.battles
  ADD COLUMN IF NOT EXISTS matchmaking_request_id UUID;

COMMENT ON COLUMN public.battles.matchmaking_request_id IS
  'Client-generated id for an explicit matchmaking action. Retries by the '
  'initiating player replay the battle carrying this id.';

-- Keep the newest queue row if a pre-fix client produced duplicates. Older
-- rows are closed deterministically before the partial unique index is added.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY player_one_id, mode, player_one_character_id
      ORDER BY created_at DESC, id DESC
    ) AS queue_rank
  FROM public.battles
  WHERE status = 'created'
)
UPDATE public.battles AS b
SET
  status = 'canceled'::battle_status,
  updated_at = NOW()
FROM ranked AS r
WHERE b.id = r.id
  AND r.queue_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_battles_matchmaking_request
  ON public.battles (player_one_id, matchmaking_request_id)
  WHERE matchmaking_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_battles_one_open_queue
  ON public.battles (player_one_id, mode, player_one_character_id)
  WHERE status = 'created';

-- One battle can be reached by two explicit matchmaking actions: the action
-- that opened its queue row and the other player's action that claimed it.
-- Keep the first request on battles for cheap diagnostics, and keep the full
-- replay map here so either player can safely retry.
CREATE TABLE IF NOT EXISTS public.matchmaking_requests (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_requests_battle
  ON public.matchmaking_requests (battle_id);

ALTER TABLE public.matchmaking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matchmaking_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.matchmaking_requests TO service_role;

-- The Edge Function validates ownership and rate limits before calling this.
-- The function is nevertheless service-role only, and owns the final replay /
-- insert decision inside one transaction. Advisory locks make identical bot
-- calls and concurrent human queue opens deterministic.
CREATE OR REPLACE FUNCTION public.create_matchmaking_battle(
  p_player_one_id UUID,
  p_character_id UUID,
  p_mode battle_mode,
  p_request_id UUID,
  p_bot_persona_id UUID DEFAULT NULL,
  p_theme TEXT DEFAULT NULL
)
RETURNS TABLE (
  battle_id UUID,
  replayed_request BOOLEAN,
  matched BOOLEAN,
  theme TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_mapped_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required' USING ERRCODE = '22023';
  END IF;

  -- Serialise a literal request replay first. hashtextextended is stable inside
  -- Postgres and avoids a separate lock table.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_player_one_id::TEXT || ':' || p_request_id::TEXT, 0)
  );

  SELECT mr.battle_id
  INTO v_mapped_battle_id
  FROM public.matchmaking_requests AS mr
  WHERE mr.profile_id = p_player_one_id
    AND mr.request_id = p_request_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_battle
    FROM public.battles
    WHERE id = v_mapped_battle_id;

    RETURN QUERY SELECT
      v_battle.id,
      TRUE,
      v_battle.status <> 'created'::battle_status,
      v_battle.theme;
    RETURN;
  END IF;

  -- Compatibility lookup for a deployment upgraded from the short-lived
  -- single-column implementation.
  SELECT *
  INTO v_battle
  FROM public.battles
  WHERE player_one_id = p_player_one_id
    AND matchmaking_request_id = p_request_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
    VALUES (p_player_one_id, p_request_id, v_battle.id)
    ON CONFLICT (profile_id, request_id) DO NOTHING;
    RETURN QUERY SELECT
      v_battle.id,
      TRUE,
      v_battle.status <> 'created'::battle_status,
      v_battle.theme;
    RETURN;
  END IF;

  v_timeout_hours := CASE
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked', 'bot') THEN 8
    ELSE 2
  END;

  IF p_mode <> 'bot'::battle_mode THEN
    -- A different tap/request for an already-open search resumes that search.
    -- Lock the natural queue key so concurrent first calls cannot both insert.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_player_one_id::TEXT || ':' || p_mode::TEXT || ':' || p_character_id::TEXT,
        1
      )
    );

    SELECT *
    INTO v_battle
    FROM public.battles
    WHERE player_one_id = p_player_one_id
      AND player_one_character_id = p_character_id
      AND mode = p_mode
      AND status = 'created'::battle_status
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
      VALUES (p_player_one_id, p_request_id, v_battle.id)
      ON CONFLICT (profile_id, request_id) DO NOTHING;
      RETURN QUERY SELECT v_battle.id, TRUE, FALSE, v_battle.theme;
      RETURN;
    END IF;

    INSERT INTO public.battles (
      player_one_id,
      player_one_character_id,
      mode,
      status,
      format,
      best_of,
      matchmaking_request_id,
      player_one_prompt_deadline
    ) VALUES (
      p_player_one_id,
      p_character_id,
      p_mode,
      'created'::battle_status,
      'bo3',
      3,
      p_request_id,
      NOW() + (v_timeout_hours || ' hours')::INTERVAL
    )
    RETURNING * INTO v_battle;
  ELSE
    IF p_bot_persona_id IS NULL THEN
      RAISE EXCEPTION 'bot_persona_id required for bot matchmaking'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.battles (
      player_one_id,
      player_one_character_id,
      is_player_two_bot,
      bot_persona_id,
      mode,
      status,
      format,
      best_of,
      theme,
      theme_revealed_at,
      matched_at,
      matchmaking_request_id,
      player_one_prompt_deadline
    ) VALUES (
      p_player_one_id,
      p_character_id,
      TRUE,
      p_bot_persona_id,
      p_mode,
      'matched'::battle_status,
      'bo3',
      3,
      p_theme,
      NOW(),
      NOW(),
      p_request_id,
      NOW() + (v_timeout_hours || ' hours')::INTERVAL
    )
    RETURNING * INTO v_battle;
  END IF;

  INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
  VALUES (p_player_one_id, p_request_id, v_battle.id);

  RETURN QUERY SELECT
    v_battle.id,
    FALSE,
    v_battle.status <> 'created'::battle_status,
    v_battle.theme;
END;
$$;

REVOKE ALL ON FUNCTION public.create_matchmaking_battle(
  UUID, UUID, battle_mode, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_matchmaking_battle(
  UUID, UUID, battle_mode, UUID, UUID, TEXT
) TO service_role;

-- Claiming an existing human queue row and recording the joining player's
-- request must commit together. A timeout after commit can therefore replay
-- the same matched battle instead of opening a second queue row.
CREATE OR REPLACE FUNCTION public.match_battle_request(
  p_battle_id UUID,
  p_player_two_id UUID,
  p_player_two_character_id UUID,
  p_theme TEXT,
  p_request_id UUID,
  p_previous_battle_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_battle_id UUID;
  v_did_match BOOLEAN;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_player_two_id::TEXT || ':' || p_request_id::TEXT, 0)
  );

  SELECT battle_id
  INTO v_existing_battle_id
  FROM public.matchmaking_requests
  WHERE profile_id = p_player_two_id
    AND request_id = p_request_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_battle_id = p_battle_id THEN
      RETURN TRUE;
    END IF;
    -- A waiting-screen retry may move its request from the player's own queue
    -- row to the older opponent row it just claimed. No other remap is valid.
    IF p_previous_battle_id IS NULL OR
       v_existing_battle_id <> p_previous_battle_id OR
       NOT EXISTS (
         SELECT 1 FROM public.battles
         WHERE id = p_previous_battle_id
           AND player_one_id = p_player_two_id
           AND status = 'created'::battle_status
       ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT public.match_battle(
    p_battle_id,
    p_player_two_id,
    p_player_two_character_id,
    p_theme
  ) INTO v_did_match;

  IF v_did_match THEN
    INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
    VALUES (p_player_two_id, p_request_id, p_battle_id)
    ON CONFLICT (profile_id, request_id)
    DO UPDATE SET battle_id = EXCLUDED.battle_id;

    IF p_previous_battle_id IS NOT NULL AND
       p_previous_battle_id <> p_battle_id THEN
      UPDATE public.battles
      SET status = 'canceled'::battle_status, updated_at = NOW()
      WHERE id = p_previous_battle_id
        AND player_one_id = p_player_two_id
        AND status = 'created'::battle_status;
    END IF;
  END IF;

  RETURN COALESCE(v_did_match, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.match_battle_request(UUID, UUID, UUID, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_battle_request(UUID, UUID, UUID, TEXT, UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_stale_matchmaking_battles(
  p_stale_minutes INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_stale_minutes < 1 THEN
    RAISE EXCEPTION 'p_stale_minutes must be positive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.battles
  SET
    status = 'canceled'::battle_status,
    updated_at = NOW()
  WHERE status = 'created'::battle_status
    AND mode IN ('ranked'::battle_mode, 'unranked'::battle_mode)
    AND created_at < NOW() - make_interval(mins => p_stale_minutes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stale_matchmaking_battles(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stale_matchmaking_battles(INTEGER)
  TO service_role;

-- Provider-cost completeness. NULL remains the correct value for mock runs or
-- providers that do not expose a billable amount.
ALTER TABLE public.portrait_jobs
  ADD COLUMN IF NOT EXISTS provider_cost_usd NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS provider_latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_portrait_jobs_cost_day
  ON public.portrait_jobs (created_at)
  WHERE provider_cost_usd IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_move_prompt_suggestions_cost_day
  ON public.move_prompt_suggestions (created_at)
  WHERE provider_cost_usd IS NOT NULL;

CREATE OR REPLACE VIEW public.daily_provider_costs
WITH (security_invoker = true) AS
WITH cost_parts AS (
  SELECT
    date_trunc('day', created_at)::DATE AS day,
    COALESCE(SUM(provider_cost_usd), 0) AS video_cost,
    COUNT(*) FILTER (WHERE provider_cost_usd IS NOT NULL) AS video_calls,
    0::NUMERIC AS judge_cost,
    0::BIGINT AS judge_calls,
    0::NUMERIC AS portrait_cost,
    0::BIGINT AS portrait_calls,
    0::NUMERIC AS suggestion_cost,
    0::BIGINT AS suggestion_calls
  FROM public.video_jobs
  GROUP BY 1

  UNION ALL

  SELECT date_trunc('day', created_at)::DATE,
    0::NUMERIC, 0::BIGINT,
    COALESCE(SUM(provider_cost_usd), 0),
    COUNT(*) FILTER (WHERE provider_cost_usd IS NOT NULL),
    0::NUMERIC, 0::BIGINT, 0::NUMERIC, 0::BIGINT
  FROM public.judge_runs
  GROUP BY 1

  UNION ALL

  SELECT date_trunc('day', created_at)::DATE,
    0::NUMERIC, 0::BIGINT, 0::NUMERIC, 0::BIGINT,
    COALESCE(SUM(provider_cost_usd), 0),
    COUNT(*) FILTER (WHERE provider_cost_usd IS NOT NULL),
    0::NUMERIC, 0::BIGINT
  FROM public.portrait_jobs
  GROUP BY 1

  UNION ALL

  SELECT date_trunc('day', created_at)::DATE,
    0::NUMERIC, 0::BIGINT, 0::NUMERIC, 0::BIGINT,
    0::NUMERIC, 0::BIGINT,
    COALESCE(SUM(provider_cost_usd), 0),
    COUNT(*) FILTER (WHERE provider_cost_usd IS NOT NULL)
  FROM public.move_prompt_suggestions
  GROUP BY 1
), costs AS (
  SELECT
    day,
    SUM(video_cost) AS video_cost,
    SUM(video_calls) AS video_calls,
    SUM(judge_cost) AS judge_cost,
    SUM(judge_calls) AS judge_calls,
    SUM(portrait_cost) AS portrait_cost,
    SUM(portrait_calls) AS portrait_calls,
    SUM(suggestion_cost) AS suggestion_cost,
    SUM(suggestion_calls) AS suggestion_calls
  FROM cost_parts
  GROUP BY day
), resolved AS (
  SELECT
    date_trunc('day', COALESCE(completed_at, updated_at))::DATE AS day,
    COUNT(*)::BIGINT AS resolved_battles
  FROM public.battles
  WHERE status IN (
    'completed'::battle_status,
    'result_ready'::battle_status,
    'generating_video'::battle_status,
    'generation_failed'::battle_status
  )
  GROUP BY 1
), all_days AS (
  SELECT day FROM costs
  UNION
  SELECT day FROM resolved
)
SELECT
  all_days.day,
  COALESCE(costs.video_cost, 0) AS video_cost_usd,
  COALESCE(costs.video_calls, 0) AS video_calls,
  COALESCE(costs.judge_cost, 0) AS judge_cost_usd,
  COALESCE(costs.judge_calls, 0) AS judge_calls,
  COALESCE(costs.video_cost, 0) + COALESCE(costs.judge_cost, 0)
    + COALESCE(costs.portrait_cost, 0) + COALESCE(costs.suggestion_cost, 0)
    AS total_cost_usd,
  COALESCE(costs.portrait_cost, 0) AS portrait_cost_usd,
  COALESCE(costs.portrait_calls, 0) AS portrait_calls,
  COALESCE(costs.suggestion_cost, 0) AS prompt_suggestion_cost_usd,
  COALESCE(costs.suggestion_calls, 0) AS prompt_suggestion_calls,
  COALESCE(resolved.resolved_battles, 0) AS resolved_battles,
  CASE
    WHEN COALESCE(resolved.resolved_battles, 0) = 0 THEN NULL
    ELSE ROUND(
      (COALESCE(costs.video_cost, 0) + COALESCE(costs.judge_cost, 0)
        + COALESCE(costs.portrait_cost, 0) + COALESCE(costs.suggestion_cost, 0))
        / resolved.resolved_battles,
      6
    )
  END AS cost_per_resolved_battle_usd
FROM all_days
LEFT JOIN costs USING (day)
LEFT JOIN resolved USING (day)
ORDER BY all_days.day DESC;

COMMENT ON VIEW public.daily_provider_costs IS
  'Measured provider spend per UTC day across video, judging, portraits and '
  'prompt suggestions, with a resolved-battle unit-cost denominator. NULL '
  'provider costs are mock or not reported; do not silently treat them as billed.';

REVOKE ALL ON public.daily_provider_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.daily_provider_costs TO service_role;
