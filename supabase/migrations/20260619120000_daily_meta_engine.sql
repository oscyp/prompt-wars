--------------------------------------------------------------------------------
-- DAILY META ENGINE
--------------------------------------------------------------------------------
-- Activates the F2P credit spine that was previously schema-only:
--   * assigns the day's curated quests to each player
--   * advances quest progress as battles complete
--   * grants escalating win-streak milestone credits
-- All writes are server-owned (SECURITY DEFINER) and idempotent. Tier 0 reveals
-- and battle completion never depend on any of this; it is purely additive
-- engagement + credit economy.
--------------------------------------------------------------------------------

-- Idempotency guard so post-battle rewards are applied exactly once per battle,
-- even if resolve-battle / round-resolve is retried.
ALTER TABLE battles ADD COLUMN IF NOT EXISTS rewards_applied_at TIMESTAMPTZ;

--------------------------------------------------------------------------------
-- ensure_daily_quests: materialize today's active quests for a player
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_daily_quests(p_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO player_daily_quests (profile_id, daily_quest_id, current_value, completed, quest_date)
  SELECT p_profile_id, dq.id, 0, FALSE, CURRENT_DATE
  FROM daily_quests dq
  WHERE dq.is_active = TRUE
    AND dq.active_date = CURRENT_DATE
  ON CONFLICT (profile_id, daily_quest_id, quest_date) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- increment_quest_progress: advance progress for a player's matching quests
--------------------------------------------------------------------------------
-- Advances current_value (clamped to target) for today's quests of a given type.
-- Does NOT auto-claim: the reward is granted through the existing grant-credits
-- "quest_complete" claim path so the player gets an explicit reward moment.
CREATE OR REPLACE FUNCTION increment_quest_progress(
  p_profile_id UUID,
  p_quest_type TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  -- Make sure the player actually has today's quests before advancing them.
  PERFORM ensure_daily_quests(p_profile_id);

  UPDATE player_daily_quests pdq
  SET current_value = LEAST(pdq.current_value + p_amount, dq.target_value)
  FROM daily_quests dq
  WHERE pdq.daily_quest_id = dq.id
    AND pdq.profile_id = p_profile_id
    AND pdq.quest_date = CURRENT_DATE
    AND pdq.completed = FALSE
    AND dq.quest_type = p_quest_type
    AND dq.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- grant_win_streak_reward: escalating, capped milestone credits
--------------------------------------------------------------------------------
-- Milestones at 3, 5, 7, 10, then every +5. Credits escalate but are hard
-- capped so streaks can never become a pay-to-win or runaway economy lever.
CREATE OR REPLACE FUNCTION grant_win_streak_reward(
  p_profile_id UUID,
  p_streak INTEGER,
  p_battle_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_is_milestone BOOLEAN;
  v_credits INTEGER;
  v_today_streak_credits INTEGER;
BEGIN
  IF p_streak IS NULL OR p_streak < 3 THEN
    RETURN 0;
  END IF;

  v_is_milestone := (p_streak IN (3, 5, 7))
    OR (p_streak >= 10 AND p_streak % 5 = 0);

  IF NOT v_is_milestone THEN
    RETURN 0;
  END IF;

  -- Hard per-day cap on streak credits so the faucet is bounded even under
  -- win-trading (rating-side anti-collusion in §7.8 does not gate credits).
  SELECT COALESCE(SUM(amount), 0) INTO v_today_streak_credits
  FROM wallet_transactions
  WHERE profile_id = p_profile_id
    AND reason = 'win_streak'
    AND created_at >= CURRENT_DATE;

  IF v_today_streak_credits >= 20 THEN
    RETURN 0;
  END IF;

  -- Escalating but capped: 2 credits at streak 3, scaling to a hard cap of 15.
  v_credits := LEAST(2 + (p_streak / 3), 15);

  PERFORM grant_credits(
    p_profile_id,
    v_credits,
    'win_streak',
    'win_streak_' || p_battle_id::text || '_' || p_profile_id::text || '_' || p_streak::text,
    p_battle_id,
    NULL,
    jsonb_build_object('streak', p_streak)
  );

  RETURN v_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- apply_post_battle_rewards: single orchestrator called after battle resolution
--------------------------------------------------------------------------------
-- Advances quests for every HUMAN participant and grants win-streak milestone
-- credits to the winner. Idempotent via battles.rewards_applied_at. Bots are
-- skipped (no profile row). Never raises on missing data — engagement rewards
-- must never block battle completion.
CREATE OR REPLACE FUNCTION apply_post_battle_rewards(p_battle_id UUID)
RETURNS VOID AS $$
DECLARE
  v_battle RECORD;
  v_already TIMESTAMPTZ;
  v_human_ids UUID[];
  v_profile_id UUID;
  v_move_type TEXT;
  v_streak INTEGER;
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

  -- Build the human participant list (player_one is always human; player_two
  -- only when it is not a bot slot).
  v_human_ids := ARRAY[]::UUID[];
  IF v_battle.player_one_id IS NOT NULL THEN
    v_human_ids := array_append(v_human_ids, v_battle.player_one_id);
  END IF;
  IF v_battle.player_two_id IS NOT NULL AND COALESCE(v_battle.is_player_two_bot, FALSE) = FALSE THEN
    v_human_ids := array_append(v_human_ids, v_battle.player_two_id);
  END IF;

  FOREACH v_profile_id IN ARRAY v_human_ids LOOP
    -- Every completed battle advances the "complete N battles" quest.
    PERFORM increment_quest_progress(v_profile_id, 'complete_battles', 1);

    -- Winner-only quests + streak reward.
    IF v_battle.winner_id IS NOT NULL AND v_profile_id = v_battle.winner_id THEN
      PERFORM increment_quest_progress(v_profile_id, 'win_battle', 1);

      -- Escalating streak credits only for ranked human battles, so bot and
      -- friend-challenge wins cannot be farmed for credits (concept §19/§7.8).
      IF v_battle.mode = 'ranked' AND COALESCE(v_battle.is_player_two_bot, FALSE) = FALSE THEN
        SELECT current_streak INTO v_streak FROM profiles WHERE id = v_profile_id;
        PERFORM grant_win_streak_reward(v_profile_id, v_streak, p_battle_id);
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
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- Daily quest rotation: keep at least one active set for "today"
--------------------------------------------------------------------------------
-- Clones the most recent active quest definitions forward to CURRENT_DATE if no
-- quests exist for today. Lets the daily meta keep working without a manual seed
-- every day; the curated catalog can still be replaced at any time.
CREATE OR REPLACE FUNCTION rollover_daily_quests()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM daily_quests
  WHERE active_date = CURRENT_DATE AND is_active = TRUE;

  IF v_count > 0 THEN
    RETURN v_count;
  END IF;

  INSERT INTO daily_quests (title, description, quest_type, target_value, reward_credits, reward_xp, active_date, is_active)
  SELECT title, description, quest_type, target_value, reward_credits, reward_xp, CURRENT_DATE, TRUE
  FROM daily_quests src
  WHERE src.active_date = (
    SELECT MAX(active_date) FROM daily_quests WHERE is_active = TRUE AND active_date < CURRENT_DATE
  )
    AND src.is_active = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock every daily-meta function to service-role only. The sole callers are
-- service-role edge functions; clients must never invoke these directly.
-- Postgres grants EXECUTE to PUBLIC by default (which Supabase exposes to the
-- anon/authenticated roles), so an explicit REVOKE is mandatory.
REVOKE ALL ON FUNCTION ensure_daily_quests(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_quest_progress(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_win_streak_reward(UUID, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_post_battle_rewards(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION rollover_daily_quests() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ensure_daily_quests(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_quest_progress(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION grant_win_streak_reward(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION apply_post_battle_rewards(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rollover_daily_quests() TO service_role;
