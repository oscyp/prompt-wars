-- Additive rollout: recorded v1 battles keep their rules and assigned clocks.
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS rules_version SMALLINT NOT NULL DEFAULT 1 CHECK (rules_version IN (1,2));
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS resolution_metadata JSONB;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS identity_snapshot JSONB;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS adjudication_revision INTEGER NOT NULL DEFAULT 0;

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

CREATE OR REPLACE FUNCTION public.apply_post_battle_rewards(p_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_battle RECORD;
  v_human_ids UUID[];
  v_profile_id UUID;
  v_move_type TEXT;
  v_streak INTEGER;
  v_best INTEGER;
  v_credits INTEGER;
  v_credits_eligible BOOLEAN;
  v_is_winner BOOLEAN;
  v_quests_advanced TEXT[];
  v_before JSONB;
  v_completed JSONB;
  v_summary JSONB := '{}'::jsonb;
BEGIN
  SELECT id, mode, player_one_id, player_two_id, winner_id, status, is_player_two_bot, rewards_applied_at, score_payload
  INTO v_battle
  FROM battles
  WHERE id = p_battle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only count fully completed battles, and only once.
  IF v_battle.status NOT IN ('completed', 'result_ready', 'generating_video') THEN
    RETURN;
  END IF;

  IF v_battle.rewards_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Claim the idempotency slot up-front.
  UPDATE battles SET rewards_applied_at = NOW()
  WHERE id = p_battle_id AND rewards_applied_at IS NULL;

  -- Human participants only (player_one is always human; player_two only
  -- when it is not a bot slot).
  v_human_ids := ARRAY[]::UUID[];
  IF v_battle.player_one_id IS NOT NULL THEN
    v_human_ids := array_append(v_human_ids, v_battle.player_one_id);
  END IF;
  IF v_battle.player_two_id IS NOT NULL AND COALESCE(v_battle.is_player_two_bot, FALSE) = FALSE THEN
    v_human_ids := array_append(v_human_ids, v_battle.player_two_id);
  END IF;

  -- Escalating streak credits only for ranked human battles, so bot and
  -- friend-challenge wins cannot be farmed for credits (concept §19/§7.8).
  v_credits_eligible := v_battle.mode = 'ranked'
    AND COALESCE(v_battle.is_player_two_bot, FALSE) = FALSE
    AND COALESCE((v_battle.score_payload->>'competitive_eligible')::boolean,TRUE);

  FOREACH v_profile_id IN ARRAY v_human_ids LOOP
    v_is_winner := v_battle.winner_id IS NOT NULL AND v_profile_id = v_battle.winner_id
      AND COALESCE((v_battle.score_payload->>'competitive_eligible')::boolean,TRUE);
    v_credits := 0;
    v_quests_advanced := ARRAY[]::TEXT[];

    -- Snapshot today's quest progress before advancing it, so the summary can
    -- name the quests THIS battle carried over the line.
    PERFORM ensure_daily_quests(v_profile_id);
    SELECT COALESCE(jsonb_object_agg(dq.quest_type, pdq.current_value), '{}'::jsonb)
    INTO v_before
    FROM player_daily_quests pdq
    JOIN daily_quests dq ON dq.id = pdq.daily_quest_id
    WHERE pdq.profile_id = v_profile_id
      AND pdq.quest_date = CURRENT_DATE
      AND dq.is_active = TRUE;

    -- Every completed battle advances the "complete N battles" quest.
    PERFORM increment_quest_progress(v_profile_id, 'complete_battles', 1);
    v_quests_advanced := array_append(v_quests_advanced, 'complete_battles');

    -- Winner-only quests + streak reward.
    IF v_is_winner THEN
      PERFORM increment_quest_progress(v_profile_id, 'win_battle', 1);
      v_quests_advanced := array_append(v_quests_advanced, 'win_battle');

      IF v_credits_eligible THEN
        SELECT current_streak INTO v_streak FROM profiles WHERE id = v_profile_id;
        v_credits := COALESCE(grant_win_streak_reward(v_profile_id, v_streak, p_battle_id), 0);
      END IF;
    END IF;

    -- Move-type quest (e.g. "use a finisher").
    SELECT move_type INTO v_move_type
    FROM battle_prompts
    WHERE battle_id = p_battle_id AND profile_id = v_profile_id
    ORDER BY locked_at DESC NULLS LAST
    LIMIT 1;

    IF v_move_type = 'finisher' THEN
      PERFORM increment_quest_progress(v_profile_id, 'use_finisher', 1);
      v_quests_advanced := array_append(v_quests_advanced, 'use_finisher');
    END IF;

    -- Quests that reached their target now and had not before.
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'quest_type', dq.quest_type,
        'title', dq.title,
        'reward_credits', dq.reward_credits
      ) ORDER BY dq.quest_type),
      '[]'::jsonb)
    INTO v_completed
    FROM player_daily_quests pdq
    JOIN daily_quests dq ON dq.id = pdq.daily_quest_id
    WHERE pdq.profile_id = v_profile_id
      AND pdq.quest_date = CURRENT_DATE
      AND dq.is_active = TRUE
      AND pdq.current_value >= dq.target_value
      AND COALESCE((v_before ->> dq.quest_type)::int, 0) < dq.target_value;

    SELECT current_streak, best_streak INTO v_streak, v_best
    FROM profiles WHERE id = v_profile_id;

    v_summary := v_summary || jsonb_build_object(
      v_profile_id::text,
      jsonb_build_object(
        'credits_granted', v_credits,
        'credit_reasons', CASE WHEN v_credits > 0 THEN jsonb_build_array('win_streak') ELSE '[]'::jsonb END,
        'credits_eligible', v_credits_eligible,
        'win_streak_after', COALESCE(v_streak, 0),
        'best_win_streak', COALESCE(v_best, 0),
        'streak_milestone', v_credits > 0,
        'quests_advanced', to_jsonb(v_quests_advanced),
        'quests_completed', v_completed,
        'mode', v_battle.mode
      )
    );
  END LOOP;

  UPDATE battles SET reward_payload = v_summary WHERE id = p_battle_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_leave_battle(
  p_battle_id       UUID,
  p_profile_id      UUID,
  p_credits         INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_battle          RECORD;
  v_has_locked      BOOLEAN;
  v_charge          INTEGER := 0;
  v_balance         INTEGER;
  v_transaction_id  UUID;
  v_replayed        BOOLEAN := FALSE;
  v_winner_id       UUID;
  v_action          TEXT;
  v_next_status     battle_status;
  v_rows            INTEGER;
  -- Scalars, not RECORDs. A RECORD that is never assigned -- which is exactly
  -- what happens on the 'canceled' path, where there is no winner -- raises
  -- 55000 "record is not assigned yet" the moment jsonb_build_object reads a
  -- field off it. Scalars simply stay NULL.
  v_winner_rating     NUMERIC;
  v_winner_deviation  NUMERIC;
  v_winner_volatility NUMERIC;
  v_loser_rating      NUMERIC;
  v_loser_deviation   NUMERIC;
  v_loser_volatility  NUMERIC;
BEGIN
  -- ---------------------------------------------------------------------
  -- Reads and rejections. Nothing below this block writes.
  -- ---------------------------------------------------------------------

  -- FOR UPDATE is the serialization primitive for the whole function: it is
  -- what stops two concurrent leaves, or a leave racing a resolve, from both
  -- passing the status check.
  SELECT b.id, b.status, b.mode, b.format, b.is_player_two_bot,
         b.player_one_id, b.player_two_id, b.current_round,
         b.player_one_rounds_won, b.player_two_rounds_won
  INTO v_battle
  FROM battles b
  WHERE b.id = p_battle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'battle_not_found');
  END IF;

  IF p_profile_id IS DISTINCT FROM v_battle.player_one_id
     AND p_profile_id IS DISTINCT FROM v_battle.player_two_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_participant');
  END IF;

  -- Already over. Idempotent success, not an error: the player asked for the
  -- battle to be finished and it is. First of two double-tap defences.
  IF v_battle.status IN ('completed', 'expired', 'canceled',
                         'moderation_failed', 'generation_failed') THEN
    RETURN jsonb_build_object(
      'success', TRUE, 'action', 'already_terminal', 'charged', 0
    );
  END IF;

  -- 'resolving', 'result_ready' and 'generating_video' are deliberately NOT
  -- leavable: the judge already has the battle. Racing round-resolve for the
  -- 'resolving' claim would be a far worse failure than telling the player
  -- they were a few seconds late.
  IF v_battle.status NOT IN ('created', 'matched', 'waiting_for_prompts') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'battle_in_progress');
  END IF;

  -- Lock rounds in the same battle-before-round order as the resolver.
  PERFORM 1 FROM battle_rounds WHERE battle_id=p_battle_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM battle_rounds WHERE battle_id=p_battle_id AND status='resolving') THEN
    RETURN jsonb_build_object('success',FALSE,'error','battle_in_progress');
  END IF;
  -- Free irrespective of historic prompt locks or the compatibility p_credits argument.

  -- ---------------------------------------------------------------------
  -- Writes.
  -- ---------------------------------------------------------------------

  -- A bot, an unranked match, or a battle nobody was matched into has no
  -- opponent whose record is worth adjusting -- it is canceled, not forfeited.
  IF v_battle.mode <> 'ranked'
     OR v_battle.is_player_two_bot
     OR v_battle.player_two_id IS NULL THEN
    v_action := 'canceled';
    v_next_status := 'canceled';
  ELSE
    v_action := 'forfeited';
    -- resolve_battle's idempotency guard is `status = 'resolving'`
    -- (20260506120000:293) and it returns FALSE against anything else, so this
    -- flip is not bookkeeping -- it is the precondition for the caller being
    -- able to resolve at all.
    v_next_status := 'resolving';
    v_winner_id := CASE
      WHEN p_profile_id = v_battle.player_one_id THEN v_battle.player_two_id
      ELSE v_battle.player_one_id
    END;
  END IF;

  UPDATE battles
  SET status = v_next_status,
      completed_at = CASE WHEN v_next_status = 'canceled' THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE id = p_battle_id
    AND status IN ('created', 'matched', 'waiting_for_prompts');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- Unreachable behind FOR UPDATE; raising rather than returning so that a
    -- charge taken above rolls back with it rather than being stranded.
    RAISE EXCEPTION 'leave_claim_lost: battle % changed status mid-claim', p_battle_id;
  END IF;

  -- Close every open round, not just the current one. A round left in
  -- 'waiting_for_prompts' keeps a live lock_in_deadline, and expire-battles
  -- sweeps battle_rounds without checking the parent battle's status -- so an
  -- already-finished battle's stale round gets handed to round-resolve later.
  -- round_status has carried an unused 'canceled' value since 20260525120000;
  -- this is what it was for.
  --
  -- The round is NOT awarded to the opponent: the series is already theirs, and
  -- awarding both would double-count it in rounds_won.
  IF v_battle.format = 'bo3' THEN
    UPDATE battle_rounds
    SET status = 'canceled',
        resolved_at = NOW()
    WHERE battle_id = p_battle_id
      AND status IN ('pending', 'waiting_for_prompts');
  END IF;

  -- Glicko inputs for the caller, so it makes no second round trip. Mirrors
  -- what claim_forfeit_timeout_battles returns.
  IF v_action = 'forfeited' THEN
    SELECT rating, rating_deviation, rating_volatility
    INTO v_winner_rating, v_winner_deviation, v_winner_volatility
    FROM profiles WHERE id = v_winner_id;
    SELECT rating, rating_deviation, rating_volatility
    INTO v_loser_rating, v_loser_deviation, v_loser_volatility
    FROM profiles WHERE id = p_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'action', v_action,
    'charged', CASE WHEN v_replayed THEN 0 ELSE v_charge END,
    'replayed', v_replayed,
    'transaction_id', v_transaction_id,
    'previous_status', v_battle.status,
    'winner_id', v_winner_id,
    'loser_id', p_profile_id,
    'mode', v_battle.mode,
    'format', v_battle.format,
    'is_bot', v_battle.is_player_two_bot,
    'current_round', v_battle.current_round,
    'player_one_rounds_won', v_battle.player_one_rounds_won,
    'player_two_rounds_won', v_battle.player_two_rounds_won,
    'player_one_id', v_battle.player_one_id,
    'player_two_id', v_battle.player_two_id,
    'winner_rating', v_winner_rating,
    'winner_rating_deviation', v_winner_deviation,
    'winner_rating_volatility', v_winner_volatility,
    'loser_rating', v_loser_rating,
    'loser_rating_deviation', v_loser_deviation,
    'loser_rating_volatility', v_loser_volatility
  );
END;
$$;

COMMENT ON FUNCTION public.claim_leave_battle(UUID,UUID,INTEGER,TEXT) IS 'Free atomic cancel/forfeit; compatibility price argument ignored.';

-- Service-role only. Schema public's default ACL grants EXECUTE to anon and
-- authenticated on every new function, and REVOKE ... FROM PUBLIC does not
-- remove those explicit grants -- so they are named here.
REVOKE ALL ON FUNCTION public.claim_leave_battle(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_leave_battle(UUID, UUID, INTEGER, TEXT)
  TO service_role;

-- Parent lock serializes resolution against free forfeits; no round survives a canceled parent.
CREATE OR REPLACE FUNCTION public.claim_battle_round(p_battle_id UUID,p_round_number INTEGER)
RETURNS SETOF public.battle_rounds LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_status public.battle_status; v_current INTEGER;
BEGIN
 SELECT status,current_round INTO v_status,v_current FROM battles WHERE id=p_battle_id FOR UPDATE;
 IF v_status IS NULL OR v_status NOT IN ('waiting_for_prompts','resolving') OR COALESCE(v_current,1)<>p_round_number THEN RETURN; END IF;
 RETURN QUERY UPDATE battle_rounds SET status='resolving',updated_at=NOW()
 WHERE battle_id=p_battle_id AND round_number=p_round_number AND status='waiting_for_prompts' RETURNING *;
 IF FOUND THEN UPDATE battles SET status='resolving',updated_at=NOW() WHERE id=p_battle_id; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_battle_round(UUID,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_battle_round(UUID,INTEGER) TO service_role;

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
      AND rules_version=p_rules_version
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


-- Face-off metadata, HP and first round commit together; retries never replace snapshots.
CREATE OR REPLACE FUNCTION public.start_battle_face_off(
 p_battle_id UUID,p_identity JSONB,p_one_stats JSONB,p_two_stats JSONB,
 p_one_hp INTEGER,p_two_hp INTEGER,p_deadline TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE;
BEGIN
 SELECT * INTO b FROM battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND OR b.format<>'bo3' OR b.face_off_revealed_at IS NOT NULL OR b.status<>'matched' THEN RETURN FALSE; END IF;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(p_battle_id,1,'waiting_for_prompts',p_deadline) ON CONFLICT(battle_id,round_number) DO NOTHING;
 UPDATE battles SET face_off_revealed_at=NOW(),identity_snapshot=p_identity,
 player_one_stats_snapshot=p_one_stats,player_two_stats_snapshot=p_two_stats,
 player_one_hp_max=p_one_hp,player_two_hp_max=p_two_hp,player_one_hp=p_one_hp,player_two_hp=p_two_hp,
 current_round=1,status='waiting_for_prompts',updated_at=NOW() WHERE id=p_battle_id;
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.start_battle_face_off(UUID,JSONB,JSONB,JSONB,INTEGER,INTEGER,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_battle_face_off(UUID,JSONB,JSONB,JSONB,INTEGER,INTEGER,TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_battle_round(p_round_id UUID,p_result JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE; r battle_rounds%ROWTYPE; bid UUID;
BEGIN
 SELECT battle_id INTO bid FROM battle_rounds WHERE id=p_round_id;
 SELECT * INTO b FROM battles WHERE id=bid FOR UPDATE;
 IF NOT FOUND OR b.status NOT IN ('waiting_for_prompts','resolving') THEN RETURN FALSE; END IF;
 SELECT * INTO r FROM battle_rounds WHERE id=p_round_id FOR UPDATE;
 IF r.status<>'resolving' THEN RETURN FALSE; END IF;
 UPDATE battle_rounds SET status='result_ready',round_winner_id=(p_result->>'round_winner_id')::UUID,
 is_draw=(p_result->>'is_draw')::BOOLEAN,player_one_score=(p_result->>'player_one_score')::NUMERIC,
 player_two_score=(p_result->>'player_two_score')::NUMERIC,score_gap=(p_result->>'score_gap')::NUMERIC,
 player_one_damage=(p_result->>'player_one_damage')::INTEGER,player_two_damage=(p_result->>'player_two_damage')::INTEGER,
 player_one_hp_after=(p_result->>'player_one_hp_after')::INTEGER,player_two_hp_after=(p_result->>'player_two_hp_after')::INTEGER,
 is_ko=(p_result->>'is_ko')::BOOLEAN,judge_payload=p_result->'judge_payload',
 judge_prompt_version=p_result->>'judge_prompt_version',judge_model_id=p_result->>'judge_model_id',
 stat_modifier_player_one=(p_result->>'stat_modifier_player_one')::NUMERIC,stat_modifier_player_two=(p_result->>'stat_modifier_player_two')::NUMERIC,
 move_type_modifier_player_one=(p_result->>'move_type_modifier_player_one')::NUMERIC,move_type_modifier_player_two=(p_result->>'move_type_modifier_player_two')::NUMERIC,
 resolved_at=NOW(),updated_at=NOW() WHERE id=p_round_id;
 UPDATE battles SET player_one_hp=(p_result->>'player_one_hp_after')::INTEGER,player_two_hp=(p_result->>'player_two_hp_after')::INTEGER,
 player_one_rounds_won=(SELECT count(*) FROM battle_rounds WHERE battle_id=bid AND status='result_ready' AND NOT is_draw AND round_winner_id=b.player_one_id),
 player_two_rounds_won=(SELECT count(*) FROM battle_rounds WHERE battle_id=bid AND status='result_ready' AND NOT is_draw AND round_winner_id IS NOT DISTINCT FROM b.player_two_id),
 updated_at=NOW() WHERE id=bid;
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.complete_battle_round(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_battle_round(UUID,JSONB) TO service_role;
