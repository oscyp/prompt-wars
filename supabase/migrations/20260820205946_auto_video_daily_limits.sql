-- Automatic post-battle cinematic queue.
--
-- Product policy:
--   * one shared video is eligible after a completed battle;
--   * the sponsoring participant may sponsor at most 1 automatic video/day;
--   * the project may enqueue at most 100 automatic videos/day;
--   * automatic jobs never spend credits or subscription allowance;
--   * manual paid upgrades remain available when no automatic job is queued.
--
-- The advisory transaction lock makes the counter checks + insert atomic even
-- when many battles resolve together. The function is service-role only and
-- therefore cannot be used by the mobile client to bypass limits.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('battle-videos', 'battle-videos', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE OR REPLACE FUNCTION public.enqueue_auto_battle_video(
  p_battle_id UUID,
  p_battle_round_id UUID,
  p_round_number SMALLINT,
  p_request_payload_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_existing_job_id UUID;
  v_video_job_id UUID;
  v_candidate UUID;
  v_candidates UUID[];
  v_day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_global_count INTEGER;
  v_profile_count INTEGER;
  v_daily_profile_cap CONSTANT INTEGER := 1;
  v_daily_global_cap CONSTANT INTEGER := 100;
BEGIN
  IF p_request_payload_hash IS NULL OR length(p_request_payload_hash) < 16 THEN
    RAISE EXCEPTION 'request payload hash required';
  END IF;

  -- One lock per UTC day serializes the global/profile cap checks.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('auto-video:' || v_day_start::TEXT, 0)
  );

  SELECT * INTO v_battle
  FROM public.battles
  WHERE id = p_battle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle not found';
  END IF;

  IF v_battle.status::TEXT NOT IN ('result_ready', 'completed') THEN
    RAISE EXCEPTION 'battle is not complete';
  END IF;

  IF p_battle_round_id IS NULL THEN
    IF COALESCE(v_battle.format::TEXT, 'single') <> 'single' THEN
      RAISE EXCEPTION 'bo3 automatic video requires a final battle round';
    END IF;

    SELECT id INTO v_existing_job_id
    FROM public.video_jobs
    WHERE battle_id = p_battle_id
      AND battle_round_id IS NULL
      AND tier = 1
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    IF COALESCE(v_battle.format::TEXT, 'single') <> 'bo3' THEN
      RAISE EXCEPTION 'single battle cannot target a battle round';
    END IF;
    IF p_round_number IS NULL OR p_round_number NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'valid round number required';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.battle_rounds br
      WHERE br.id = p_battle_round_id
        AND br.battle_id = p_battle_id
        AND br.round_number = p_round_number
        AND br.status::TEXT = 'result_ready'
    ) THEN
      RAISE EXCEPTION 'final battle round not ready';
    END IF;

    SELECT id INTO v_existing_job_id
    FROM public.video_jobs
    WHERE battle_round_id = p_battle_round_id
      AND tier = 1
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Returning an existing job keeps repeated completion callbacks idempotent.
  IF v_existing_job_id IS NOT NULL THEN
    RETURN v_existing_job_id;
  END IF;

  SELECT count(*) INTO v_global_count
  FROM public.video_jobs
  WHERE trigger = 'auto_free'
    AND created_at >= v_day_start;

  IF v_global_count >= v_daily_global_cap THEN
    RETURN NULL;
  END IF;

  v_candidates := CASE
    WHEN v_battle.is_player_two_bot OR v_battle.player_two_id IS NULL
      THEN ARRAY[v_battle.player_one_id]
    ELSE ARRAY[v_battle.player_one_id, v_battle.player_two_id]
  END;

  FOREACH v_candidate IN ARRAY v_candidates LOOP
    SELECT count(*) INTO v_profile_count
    FROM public.video_jobs
    WHERE trigger = 'auto_free'
      AND requester_profile_id = v_candidate
      AND created_at >= v_day_start;

    EXIT WHEN v_profile_count < v_daily_profile_cap;
    v_candidate := NULL;
  END LOOP;

  IF v_candidate IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.video_jobs (
    battle_id,
    battle_round_id,
    round_number,
    tier,
    trigger,
    provider,
    status,
    request_payload_hash,
    input_payload_hash,
    requester_profile_id,
    entitlement_source,
    spend_transaction_id,
    credits_charged,
    cost_units
  ) VALUES (
    p_battle_id,
    p_battle_round_id,
    p_round_number,
    1,
    'auto_free',
    'xai',
    'queued',
    p_request_payload_hash,
    p_request_payload_hash,
    v_candidate,
    'daily_auto_free',
    NULL,
    0,
    0
  )
  RETURNING id INTO v_video_job_id;

  IF p_battle_round_id IS NOT NULL THEN
    UPDATE public.battle_rounds
    SET cinematic_video_job_id = v_video_job_id,
        updated_at = now()
    WHERE id = p_battle_round_id;
  END IF;

  RETURN v_video_job_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_battle_round_id IS NULL THEN
      SELECT id INTO v_existing_job_id
      FROM public.video_jobs
      WHERE battle_id = p_battle_id
        AND battle_round_id IS NULL
        AND tier = 1
      ORDER BY created_at DESC
      LIMIT 1;
    ELSE
      SELECT id INTO v_existing_job_id
      FROM public.video_jobs
      WHERE battle_round_id = p_battle_round_id
        AND tier = 1
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
    RETURN v_existing_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_auto_battle_video(UUID, UUID, SMALLINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_auto_battle_video(UUID, UUID, SMALLINT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.enqueue_auto_battle_video(UUID, UUID, SMALLINT, TEXT) IS
  'Atomically queues one free post-battle cinematic under per-profile (1/day) and global (100/day) limits. Service-role only.';
