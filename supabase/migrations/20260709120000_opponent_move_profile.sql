-- =============================================================================
-- Opponent move profile RPC (§7.1 move-type legibility)
-- =============================================================================
-- §7.1 requires two pre-prompt surfaces that RLS correctly prevents the client
-- from computing itself (opponents' prompts are not readable across battles):
--   1. The opponent's last 5 move types.
--   2. Counter-pick win rate per move type vs. the opponent's archetype.
--
-- `get_opponent_move_profile(p_battle_id)` is SECURITY DEFINER and callable by
-- authenticated users, but only discloses aggregates:
--   * caller must be a participant of the battle;
--   * recent moves come exclusively from RESOLVED battles (never the current
--     one), so a pending pick can't leak pre-lock;
--   * win rates are global per-move-type aggregates against the opponent's
--     archetype (last 90 days), not per-player data.
-- Bot battles return an empty profile (bots don't play through battle_prompts).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_opponent_move_profile(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_battle RECORD;
  v_opponent_id UUID;
  v_opponent_character_id UUID;
  v_opponent_archetype TEXT;
  v_recent_moves JSONB;
  v_counter_rates JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id, player_one_id, player_two_id,
         player_one_character_id, player_two_character_id,
         is_player_two_bot
  INTO v_battle
  FROM battles
  WHERE id = p_battle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  IF v_caller = v_battle.player_one_id THEN
    v_opponent_id := v_battle.player_two_id;
    v_opponent_character_id := v_battle.player_two_character_id;
  ELSIF v_caller = v_battle.player_two_id THEN
    v_opponent_id := v_battle.player_one_id;
    v_opponent_character_id := v_battle.player_one_character_id;
  ELSE
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  -- Bot battles: no human prompt history to profile.
  IF v_opponent_id IS NULL OR v_battle.is_player_two_bot THEN
    RETURN jsonb_build_object(
      'recent_moves', '[]'::jsonb,
      'opponent_archetype', NULL,
      'counter_win_rates', '{}'::jsonb
    );
  END IF;

  SELECT archetype::text INTO v_opponent_archetype
  FROM characters WHERE id = v_opponent_character_id;

  -- Last 5 move types from RESOLVED battles only (excludes the current one).
  SELECT COALESCE(jsonb_agg(move_type ORDER BY rn DESC), '[]'::jsonb)
  INTO v_recent_moves
  FROM (
    SELECT bp.move_type::text AS move_type,
           ROW_NUMBER() OVER (ORDER BY bp.locked_at DESC) AS rn
    FROM battle_prompts bp
    JOIN battles b ON b.id = bp.battle_id
    WHERE bp.profile_id = v_opponent_id
      AND bp.is_locked = TRUE
      AND bp.battle_id <> p_battle_id
      AND b.status IN ('result_ready', 'generating_video', 'generation_failed', 'completed')
    ORDER BY bp.locked_at DESC
    LIMIT 5
  ) recent;

  -- Global win rate per move type against this archetype (90-day window).
  -- A row = one locked prompt in a decided battle whose opposing character
  -- has the opponent's archetype; a win = that prompt's owner won the battle.
  SELECT COALESCE(jsonb_object_agg(move_type, jsonb_build_object(
    'total', total,
    'wins', wins,
    'win_rate', ROUND(wins::numeric / GREATEST(total, 1), 2)
  )), '{}'::jsonb)
  INTO v_counter_rates
  FROM (
    SELECT bp.move_type::text AS move_type,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE b.winner_id = bp.profile_id) AS wins
    FROM battle_prompts bp
    JOIN battles b ON b.id = bp.battle_id
    JOIN characters opp_char ON opp_char.id = CASE
      WHEN bp.profile_id = b.player_one_id THEN b.player_two_character_id
      ELSE b.player_one_character_id
    END
    WHERE bp.is_locked = TRUE
      AND b.status IN ('result_ready', 'generating_video', 'generation_failed', 'completed')
      AND b.is_draw = FALSE
      AND b.winner_id IS NOT NULL
      AND NOT b.is_player_two_bot
      AND b.created_at > NOW() - INTERVAL '90 days'
      AND opp_char.archetype::text = v_opponent_archetype
    GROUP BY bp.move_type
  ) rates;

  RETURN jsonb_build_object(
    'recent_moves', v_recent_moves,
    'opponent_archetype', v_opponent_archetype,
    'counter_win_rates', v_counter_rates
  );
END;
$$;

-- Callable by signed-in players (participation is validated inside);
-- never by anon.
REVOKE ALL ON FUNCTION get_opponent_move_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_opponent_move_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_opponent_move_profile(UUID) TO service_role;

COMMENT ON FUNCTION get_opponent_move_profile IS
  '§7.1 move legibility: opponent last-5 move types (resolved battles only) + per-move-type win rates vs their archetype. Participant-gated.';
