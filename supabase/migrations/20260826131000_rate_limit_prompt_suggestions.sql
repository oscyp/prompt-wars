-- ============================================================================
-- check_rate_limit: add the `prompt_suggestions` action
-- ============================================================================
--
-- Ordering matters, and this migration exists separately for that reason
-- ---------------------------------------------------------------------
-- `check_rate_limit` returns {allowed: false, reason: 'unknown_action'} for
-- any action it does not know, and the new Edge Function fails CLOSED on a
-- disallowed result. Ship the function before this branch and every single
-- suggestion request 429s -- a total feature outage that looks like a rate
-- limit rather than a missing migration, which is a genuinely confusing thing
-- to debug. So: this lands first, on its own.
--
-- Caps
-- ----
-- 40/hour, 120/day -- above prompt_submit's 30/90. Browsing all three move
-- types across a Bo3 is 9 legitimate requests per battle, and a player may
-- reroll; the cap has to sit above honest play or it punishes the feature's
-- intended use. It is still far below what a script would want, and the paid
-- path is separately bounded by the wallet.
--
-- Counted from `move_prompt_suggestions` directly, like the other branches
-- count from their source tables, so no counter needs resetting. That read is
-- served by idx_move_prompt_suggestions_profile_created from 20260826130000.
--
-- CREATE OR REPLACE of the whole function: the existing branches are carried
-- forward verbatim, since PL/pgSQL has no way to patch one branch.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_profile_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hour_count INTEGER;
  v_day_count INTEGER;
  v_hour_cap INTEGER;
  v_day_cap INTEGER;
BEGIN
  IF p_action = 'battle_create' THEN
    v_hour_cap := 12;
    v_day_cap := 50;
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'),
      COUNT(*)
    INTO v_hour_count, v_day_count
    FROM battles
    WHERE (player_one_id = p_profile_id OR player_two_id = p_profile_id)
      AND created_at > NOW() - INTERVAL '24 hours';
  ELSIF p_action = 'prompt_submit' THEN
    v_hour_cap := 30;
    v_day_cap := 90;
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'),
      COUNT(*)
    INTO v_hour_count, v_day_count
    FROM battle_prompts
    WHERE profile_id = p_profile_id
      AND created_at > NOW() - INTERVAL '24 hours';
  ELSIF p_action = 'prompt_suggestions' THEN
    v_hour_cap := 40;
    v_day_cap := 120;
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'),
      COUNT(*)
    INTO v_hour_count, v_day_count
    FROM move_prompt_suggestions
    WHERE profile_id = p_profile_id
      AND created_at > NOW() - INTERVAL '24 hours';
  ELSE
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'unknown_action');
  END IF;

  IF v_hour_count >= v_hour_cap THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'hourly_cap',
      'limit', v_hour_cap,
      'count', v_hour_count
    );
  END IF;

  IF v_day_count >= v_day_cap THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'daily_cap',
      'limit', v_day_cap,
      'count', v_day_count
    );
  END IF;

  RETURN jsonb_build_object('allowed', TRUE);
END;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but restate it: this function
-- must never be client-callable, and 20260822150000 exists because that
-- assumption failed silently once already.
REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT) TO service_role;
