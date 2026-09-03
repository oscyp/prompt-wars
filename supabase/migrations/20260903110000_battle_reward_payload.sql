-- ============================================================================
-- battles.reward_payload: what each player got out of a battle, written once
-- ============================================================================
--
-- The result screen is the payoff moment and could not say what the player
-- earned: rating lived in rating_delta_payload, streak credits vanished into
-- wallet_transactions, quest progress into player_daily_quests, and the win
-- streak into profiles. apply_post_battle_rewards touches all of them, once,
-- so it is the one place that can write a per-player summary the client reads
-- from the battle row it is already subscribed to.
--
-- Shape (keyed by profile id; bots never appear):
--   {
--     "<profile_id>": {
--       "credits_granted": 5,                 -- from this battle, all reasons
--       "credit_reasons": ["win_streak"],
--       "credits_eligible": true,             -- ranked, human opponent
--       "win_streak_after": 5, "best_win_streak": 7, "streak_milestone": true,
--       "quests_advanced": ["complete_battles", "win_battle"],
--       "quests_completed": [{"quest_type": "win_battle", "title": "...", "reward_credits": 3}],
--       "mode": "ranked"
--     }
--   }
--
-- "quests_completed" means "carried over the target by this battle" — the
-- claim itself is still the player's tap on the Arena. Rewards logic is
-- unchanged: same quests, same grant_win_streak_reward, same idempotency slot.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE keeps the function's
-- ACL (service_role only — clients never call this).
-- ============================================================================

ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS reward_payload JSONB;

COMMENT ON COLUMN public.battles.reward_payload IS
  'Per-player reward summary written by apply_post_battle_rewards (credits, streak, quests). Keyed by profile id. Null until rewards are applied; absent for battles resolved before 2026-09-03.';

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
  SELECT id, mode, player_one_id, player_two_id, winner_id, status, is_player_two_bot, rewards_applied_at
  INTO v_battle
  FROM battles
  WHERE id = p_battle_id;

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
    AND COALESCE(v_battle.is_player_two_bot, FALSE) = FALSE;

  FOREACH v_profile_id IN ARRAY v_human_ids LOOP
    v_is_winner := v_battle.winner_id IS NOT NULL AND v_profile_id = v_battle.winner_id;
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
