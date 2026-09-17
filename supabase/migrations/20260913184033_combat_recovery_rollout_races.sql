-- Review round 1: serialize all live timeout/recovery writers with exits and submissions.
CREATE OR REPLACE FUNCTION resolve_battle(
  p_battle_id UUID,
  p_winner_id UUID, -- NULL if draw
  p_is_draw BOOLEAN,
  p_score_payload JSONB,
  p_rating_delta_payload JSONB,
  p_judge_prompt_version TEXT,
  p_judge_model_id TEXT,
  p_judge_seed INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_player_one_id UUID;
  v_player_two_id UUID;
  v_mode battle_mode;
  v_is_bot_battle BOOLEAN;
  v_rows_updated INTEGER;
  v_competitive BOOLEAN;
BEGIN
  -- Get battle players
  SELECT player_one_id, player_two_id, mode, is_player_two_bot
  INTO v_player_one_id, v_player_two_id, v_mode, v_is_bot_battle
  FROM battles WHERE id = p_battle_id FOR UPDATE;
  -- Same order as appeal corrections: parent battle, then sorted participants.
  -- Lock before reading/mutating profile state; overlapping matches cannot deadlock.
  PERFORM 1 FROM profiles WHERE id IN (v_player_one_id,v_player_two_id) ORDER BY id FOR UPDATE;
  -- The server-owned per-round audit also gates forfeits following a mocked round.
  v_competitive := NOT (v_mode='ranked' AND (
    COALESCE((p_score_payload->>'mock_assisted')::boolean,FALSE)
    OR COALESCE((p_score_payload->>'competitive_eligible')::boolean,TRUE)=FALSE
    OR EXISTS (SELECT 1 FROM battle_rounds WHERE battle_id=p_battle_id AND judge_payload->>'mock_assisted'='true')
  ));
  IF NOT v_competitive THEN
    p_rating_delta_payload := NULL;
    p_score_payload := COALESCE(p_score_payload,'{}'::jsonb) || '{"mock_assisted":true,"competitive_eligible":false,"rating_gated":"mock_assisted"}'::jsonb;
  END IF;
  
  -- Update battle with idempotency guard
  UPDATE battles
  SET 
    status = 'result_ready',
    winner_id = p_winner_id,
    is_draw = p_is_draw,
    score_payload = p_score_payload,
    rating_delta_payload = p_rating_delta_payload,
    judge_prompt_version = p_judge_prompt_version,
    judge_model_id = p_judge_model_id,
    judge_seed = p_judge_seed,
    completed_at = NOW()
  WHERE id = p_battle_id AND status = 'resolving';
  
  -- Get row count to guard against double-apply in concurrent resolve races
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  -- If no rows were updated, battle was already resolved; return FALSE to prevent double stats
  IF v_rows_updated = 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Update player stats (for bot battles, only update player_one)
  IF NOT v_competitive THEN
    UPDATE profiles SET total_battles=total_battles+1,
      first_battle_completed_at=COALESCE(first_battle_completed_at,NOW())
    WHERE id=v_player_one_id OR (NOT v_is_bot_battle AND id=v_player_two_id);
  ELSIF v_is_bot_battle THEN
    -- Bot battles: only update human player stats with null-safe loss logic
    UPDATE profiles
    SET 
      total_battles = total_battles + 1,
      wins = CASE WHEN id = p_winner_id THEN wins + 1 ELSE wins END,
      losses = CASE WHEN id IS DISTINCT FROM p_winner_id AND NOT p_is_draw THEN losses + 1 ELSE losses END,
      draws = CASE WHEN p_is_draw THEN draws + 1 ELSE draws END,
      current_streak = CASE 
        WHEN id = p_winner_id THEN current_streak + 1
        WHEN NOT p_is_draw THEN 0
        ELSE current_streak
      END,
      best_streak = CASE 
        WHEN id = p_winner_id AND current_streak + 1 > best_streak THEN current_streak + 1
        ELSE best_streak
      END,
      first_battle_completed_at = COALESCE(first_battle_completed_at, NOW())
    WHERE id = v_player_one_id;
  ELSE
    -- Human vs human: update both players with null-safe loss logic
    UPDATE profiles
    SET 
      total_battles = total_battles + 1,
      wins = CASE WHEN id = p_winner_id THEN wins + 1 ELSE wins END,
      losses = CASE WHEN id IS DISTINCT FROM p_winner_id AND NOT p_is_draw THEN losses + 1 ELSE losses END,
      draws = CASE WHEN p_is_draw THEN draws + 1 ELSE draws END,
      current_streak = CASE 
        WHEN id = p_winner_id THEN current_streak + 1
        WHEN NOT p_is_draw THEN 0
        ELSE current_streak
      END,
      best_streak = CASE 
        WHEN id = p_winner_id AND current_streak + 1 > best_streak THEN current_streak + 1
        ELSE best_streak
      END,
      first_battle_completed_at = COALESCE(first_battle_completed_at, NOW())
    WHERE id IN (v_player_one_id, v_player_two_id);
  END IF;
  
  -- Update ratings for ranked battles (skip for bot battles)
  IF v_competitive AND v_mode = 'ranked' AND p_rating_delta_payload IS NOT NULL AND NOT v_is_bot_battle THEN
    UPDATE profiles
    SET 
      rating = rating + COALESCE((p_rating_delta_payload->(id::text)->>'delta')::NUMERIC, 0),
      rating_deviation = COALESCE((p_rating_delta_payload->(id::text)->>'rd')::NUMERIC, rating_deviation),
      rating_volatility = COALESCE((p_rating_delta_payload->(id::text)->>'vol')::NUMERIC, rating_volatility),
      last_rated_at = NOW()
    WHERE id IN (v_player_one_id, v_player_two_id);
  END IF;
  
  -- Update rival counts (30-day window, skip for bot battles)
  IF NOT v_is_bot_battle AND v_player_two_id IS NOT NULL THEN
    INSERT INTO rivals (profile_id, rival_profile_id, battles_count_30d, last_battle_at)
    VALUES 
      (v_player_one_id, v_player_two_id, 1, NOW()),
      (v_player_two_id, v_player_one_id, 1, NOW())
    ON CONFLICT (profile_id, rival_profile_id) 
    DO UPDATE SET 
      battles_count_30d = rivals.battles_count_30d + 1,
      last_battle_at = NOW();
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;


REVOKE ALL ON FUNCTION public.resolve_battle(UUID,UUID,BOOLEAN,JSONB,JSONB,TEXT,TEXT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_battle(UUID,UUID,BOOLEAN,JSONB,JSONB,TEXT,TEXT,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.create_matchmaking_battle_versioned(
  p_player_one_id UUID,
  p_character_id UUID,
  p_mode battle_mode,
  p_request_id UUID,
  p_rules_version SMALLINT,
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
  IF p_rules_version NOT IN (1,2) OR p_rules_version IS NULL THEN RAISE EXCEPTION 'Unsupported rules version'; END IF;
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
      rules_version,
      player_one_id,
      player_one_character_id,
      mode,
      status,
      format,
      best_of,
      matchmaking_request_id,
      player_one_prompt_deadline
    ) VALUES (
      p_rules_version,
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
      rules_version,
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
      p_rules_version,
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

REVOKE ALL ON FUNCTION public.create_matchmaking_battle_versioned(
  UUID, UUID, battle_mode, UUID, SMALLINT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_matchmaking_battle_versioned(
  UUID, UUID, battle_mode, UUID, SMALLINT, UUID, TEXT
) TO service_role;


CREATE OR REPLACE FUNCTION public.lock_prompt(
  p_battle_id UUID,
  p_profile_id UUID,
  p_prompt_template_id UUID DEFAULT NULL,
  p_custom_prompt_text TEXT DEFAULT NULL,
  p_move_type move_type DEFAULT 'attack',
  p_moderation_status moderation_status DEFAULT NULL,
  p_round_number INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt_id UUID;
  v_battle_status battle_status;
  v_word_count INTEGER;
  v_is_bot_battle BOOLEAN;
  v_moderation_status moderation_status;
  v_format battle_format;
  v_new_status battle_status;
  v_player_one_id UUID;
  v_player_two_id UUID;
  v_round_number INTEGER;
BEGIN
  v_round_number := COALESCE(p_round_number, 1);

  -- Matches the battle_prompts.round_number CHECK (BETWEEN 1 AND 3).
  IF v_round_number < 1 OR v_round_number > 3 THEN
    RAISE EXCEPTION 'Invalid round number %', v_round_number;
  END IF;

  SELECT status, is_player_two_bot, format, player_one_id, player_two_id
    INTO v_battle_status, v_is_bot_battle, v_format, v_player_one_id, v_player_two_id
  FROM battles WHERE id = p_battle_id FOR UPDATE;

  IF v_battle_status IS NULL THEN
    RAISE EXCEPTION 'Battle not found';
  END IF;

  IF p_profile_id IS NULL
     OR (p_profile_id IS DISTINCT FROM v_player_one_id
         AND p_profile_id IS DISTINCT FROM v_player_two_id) THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;

  -- Single-format battles only ever have round 1.
  IF COALESCE(v_format, 'single'::battle_format) = 'single'
     AND v_round_number <> 1 THEN
    RAISE EXCEPTION 'Single-format battles only accept round 1';
  END IF;

  -- Idempotent return for retries on the same (battle, player, round).
  SELECT id INTO v_prompt_id
  FROM battle_prompts
  WHERE battle_id = p_battle_id
    AND profile_id = p_profile_id
    AND round_number = v_round_number;

  IF v_prompt_id IS NOT NULL THEN
    -- Retry path: make sure the per-side lock stamp exists (older battles or
    -- rows locked before 20260731120000). Only fires when currently NULL, so
    -- retries never emit spurious Realtime UPDATEs.
    UPDATE battles
    SET player_one_locked_at = NOW()
    WHERE id = p_battle_id
      AND p_profile_id = v_player_one_id
      AND player_one_locked_at IS NULL;

    UPDATE battles
    SET player_two_locked_at = NOW()
    WHERE id = p_battle_id
      AND p_profile_id = v_player_two_id
      AND player_two_locked_at IS NULL;

    RETURN v_prompt_id;
  END IF;

  IF v_battle_status NOT IN ('matched', 'waiting_for_prompts') THEN
    RAISE EXCEPTION 'Battle not ready for prompt submission';
  END IF;

  IF p_custom_prompt_text IS NOT NULL THEN
    v_word_count := array_length(regexp_split_to_array(trim(p_custom_prompt_text), '\s+'), 1);
  END IF;

  v_moderation_status := COALESCE(
    p_moderation_status,
    CASE
      WHEN p_prompt_template_id IS NOT NULL THEN 'approved'::moderation_status
      ELSE 'pending'::moderation_status
    END
  );

  INSERT INTO battle_prompts (
    battle_id,
    profile_id,
    round_number,
    prompt_template_id,
    custom_prompt_text,
    move_type,
    moderation_status,
    is_locked,
    locked_at,
    word_count
  )
  VALUES (
    p_battle_id,
    p_profile_id,
    v_round_number,
    p_prompt_template_id,
    p_custom_prompt_text,
    p_move_type,
    v_moderation_status,
    TRUE,
    NOW(),
    v_word_count
  )
  RETURNING id INTO v_prompt_id;

  -- Decide the new battle status. The "both locked" count is scoped to THIS
  -- round; for single format / round 1 this is identical to the previous
  -- all-rounds count, and for Bo3 rounds 2+ it no longer miscounts prior
  -- rounds' rows.
  IF v_is_bot_battle THEN
    v_new_status := 'resolving';
  ELSIF (
    SELECT COUNT(*) FROM battle_prompts
    WHERE battle_id = p_battle_id
      AND round_number = v_round_number
      AND is_locked = TRUE
  ) = 2 THEN
    v_new_status := 'resolving';
  ELSE
    v_new_status := 'waiting_for_prompts';
  END IF;

  -- Stamp the caller's per-side lock timestamp in the same UPDATE as the
  -- status transition (single Realtime event). Stamped for ALL formats;
  -- COALESCE keeps the first lock time for Bo3 rounds 2+.
  UPDATE battles SET
    status = v_new_status,
    player_one_locked_at = CASE
      WHEN p_profile_id = v_player_one_id
        THEN COALESCE(player_one_locked_at, NOW())
      ELSE player_one_locked_at
    END,
    player_two_locked_at = CASE
      WHEN p_profile_id = v_player_two_id
        THEN COALESCE(player_two_locked_at, NOW())
      ELSE player_two_locked_at
    END
  WHERE id = p_battle_id;

  ---------------------------------------------------------------------------
  -- Keep battle_rounds in sync for SINGLE-format only.
  -- Bo3 is owned by the submit-prompt Edge Function.
  ---------------------------------------------------------------------------
  IF v_format = 'single' THEN
    -- Ensure the round-1 row exists (covers battles created after the Bo3
    -- migration, which backfilled only pre-existing rows).
    INSERT INTO battle_rounds (
      battle_id, round_number, status, lock_in_deadline
    )
    SELECT
      b.id,
      1,
      'waiting_for_prompts'::round_status,
      COALESCE(b.player_one_prompt_deadline, b.player_two_prompt_deadline)
    FROM battles b
    WHERE b.id = p_battle_id
    ON CONFLICT (battle_id, round_number) DO NOTHING;

    -- When the battle has just moved to 'resolving' (both prompts locked or
    -- bot battle), stamp `both_locked_at` so the visibility-aware
    -- battle_prompts RLS policy reveals the opponent's prompt.
    IF v_new_status = 'resolving' THEN
      UPDATE battle_rounds
      SET both_locked_at = COALESCE(both_locked_at, NOW()),
          updated_at = NOW()
      WHERE battle_id = p_battle_id
        AND round_number = 1
        AND both_locked_at IS NULL;
    END IF;
  END IF;

  RETURN v_prompt_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Re-apply service-role-only ACLs (20260731122000) on the new signature.
-- SECURITY DEFINER + trusted p_profile_id: must not be client-callable.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.reclaim_stuck_rounds(p_stale_minutes INTEGER DEFAULT 10,p_max_attempts INTEGER DEFAULT 3)
RETURNS TABLE(round_id UUID,battle_id UUID,round_number INTEGER,attempts INTEGER,dead_lettered BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE candidate RECORD; b battles%ROWTYPE; r battle_rounds%ROWTYPE;
 cutoff TIMESTAMPTZ:=NOW()-make_interval(mins=>GREATEST(p_stale_minutes,1)); dead BOOLEAN;
BEGIN
 -- Candidate scan does not lock rounds before their parent.
 FOR candidate IN SELECT br.id,br.battle_id FROM battle_rounds br
   WHERE br.status='resolving' AND br.updated_at<cutoff ORDER BY br.updated_at LIMIT 50
 LOOP
   SELECT * INTO b FROM battles WHERE id=candidate.battle_id FOR UPDATE SKIP LOCKED;
   IF NOT FOUND OR b.status NOT IN ('resolving','waiting_for_prompts') THEN CONTINUE; END IF;
   SELECT * INTO r FROM battle_rounds WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
   IF NOT FOUND OR r.status<>'resolving' OR r.updated_at>=cutoff OR r.round_number<>COALESCE(b.current_round,1) THEN CONTINUE; END IF;
   dead:=COALESCE(r.resolve_attempts,0)+1>GREATEST(p_max_attempts,0);
   UPDATE battle_rounds SET resolve_attempts=COALESCE(r.resolve_attempts,0)+1,
    status=CASE WHEN dead THEN 'expired'::round_status ELSE 'waiting_for_prompts'::round_status END,
    resolved_at=CASE WHEN dead THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=r.id;
   IF dead THEN
     -- No inferred winner, rating change or competitive reward after judge recovery failure.
     UPDATE battle_rounds SET status='canceled',resolved_at=NOW(),updated_at=NOW()
       WHERE battle_rounds.battle_id=b.id AND status IN ('pending','waiting_for_prompts');
     UPDATE battles SET status='expired',winner_id=NULL,is_draw=FALSE,completed_at=NOW(),updated_at=NOW(),
       resolution_metadata=jsonb_build_object('decidingRule','no_contest','reason','judge_recovery_exhausted','round_number',r.round_number),
       score_payload=jsonb_build_object('resolution','no_contest','reason','judge_recovery_exhausted','competitive_eligible',FALSE,
         'explanation','The judge could not finish this series. No competitive result was applied.')
       WHERE id=b.id;
   ELSE
     UPDATE battles SET status='waiting_for_prompts',updated_at=NOW() WHERE id=b.id;
   END IF;
   round_id:=r.id;battle_id:=b.id;round_number:=r.round_number::INTEGER;attempts:=COALESCE(r.resolve_attempts,0)+1;dead_lettered:=dead;
   RETURN NEXT;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.reclaim_stuck_rounds(INTEGER,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_rounds(INTEGER,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_round_timeout(p_round_id UUID,p_rating_delta_payload JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bid UUID; b battles%ROWTYPE; r battle_rounds%ROWTYPE; winner UUID; payload JSONB; applied BOOLEAN;
BEGIN
 SELECT battle_rounds.battle_id INTO bid FROM battle_rounds WHERE id=p_round_id;
 SELECT * INTO b FROM battles WHERE id=bid FOR UPDATE;
 IF NOT FOUND OR b.format<>'bo3' OR b.status<>'waiting_for_prompts' THEN RETURN jsonb_build_object('action','stale'); END IF;
 SELECT * INTO r FROM battle_rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'waiting_for_prompts' OR r.round_number<>COALESCE(b.current_round,1)
    OR r.lock_in_deadline IS NULL OR r.lock_in_deadline>=NOW() THEN RETURN jsonb_build_object('action','stale'); END IF;
 -- lock_prompt uses the same parent lock. Count committed prompt rows as well as
 -- side stamps, because submission commits the prompt before lock_round_side.
 IF r.player_one_locked_at IS NOT NULL OR r.player_two_locked_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM battle_prompts WHERE battle_id=b.id AND round_number=r.round_number AND is_locked) THEN
   RETURN jsonb_build_object('action','resolve');
 END IF;
 UPDATE battle_rounds SET status='expired',resolved_at=NOW(),updated_at=NOW() WHERE id=r.id;
 IF COALESCE(b.player_one_rounds_won,0)=COALESCE(b.player_two_rounds_won,0) THEN
   UPDATE battles SET status='expired',completed_at=NOW(),updated_at=NOW(),
    resolution_metadata=jsonb_build_object('decidingRule','double_no_show','round_number',r.round_number)
    WHERE id=b.id;
   RETURN jsonb_build_object('action','expired');
 END IF;
 winner:=CASE WHEN b.player_one_rounds_won>b.player_two_rounds_won THEN b.player_one_id ELSE b.player_two_id END;
 payload:=jsonb_build_object('resolution','series_abandoned','reason','double_no_show',
   'rounds_won',jsonb_build_object('player_one',b.player_one_rounds_won,'player_two',b.player_two_rounds_won),
   'explanation','Neither player locked in before the deadline. The series was awarded to the player leading on rounds won.');
 UPDATE battles SET status='resolving',updated_at=NOW(),
   resolution_metadata=jsonb_build_object('decidingRule','double_no_show_round_lead','round_number',r.round_number)
   WHERE id=b.id;
 applied:=resolve_battle(b.id,winner,FALSE,payload,p_rating_delta_payload,'forfeit-v1','forfeit',0);
 IF NOT applied THEN RAISE EXCEPTION 'Timeout resolution lost its claim'; END IF;
 PERFORM apply_post_battle_rewards(b.id);
 UPDATE battles SET status='completed',updated_at=NOW() WHERE id=b.id AND status='result_ready';
 RETURN jsonb_build_object('action','awarded');
END; $$;
REVOKE ALL ON FUNCTION public.resolve_round_timeout(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_round_timeout(UUID,JSONB) TO service_role;
