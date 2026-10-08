-- ============================================================================
-- check_rate_limit: count suggestion GENERATIONS the player asked for
-- ============================================================================
--
-- Why
-- ---
-- The `prompt_suggestions` branch counts rows in move_prompt_suggestions, and
-- the 40/hour cap was sized for exactly the ~9 rows a Bo3 produces when a
-- player browses all three move types each round (see 20260826131000).
--
-- Two things break that sizing at once:
--
--   * Suggestions are now PREFETCHED server-side. Those rows are not something
--     the player did, and counting them means ~9 rows per battle whether or
--     not the ideas tab is ever opened -- roughly 4 battles an hour before a
--     429. Because the caller fails closed, that 429 would land on a PAID
--     reroll: the player is charged nothing but is told to come back later,
--     for something they never triggered.
--
--   * One model call now writes three rows (one per move type). Counting rows
--     would treat a single generation as three requests.
--
-- So the counter is changed to measure what the cap was always about: model
-- calls the player asked for. `source = 'player'` drops prefetch;
-- COUNT(DISTINCT generation_id) collapses one call's rows into one.
--
-- With the counter now honest, the caps come DOWN to match prompt_submit.
-- What is left on the player's side is rerolls and prefetch-miss fallbacks,
-- and this is a money endpoint -- tightening it is the right direction.
--
-- No abuse surface opens: prefetch volume is bounded by battle creation, which
-- check_rate_limit itself caps at 12/hour. Twelve battles x 3 rounds is 36
-- prefetch calls an hour, each ONE model call where the old shape could have
-- been three -- a lower provider-call rate than before, not a higher one.
--
-- CREATE OR REPLACE of the whole function: the battle_create and
-- prompt_submit branches are carried forward VERBATIM. PL/pgSQL has no way to
-- patch one branch, and a typo in the ones left alone would silently change
-- matchmaking limits.
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
    v_hour_cap := 30;
    v_day_cap := 90;
    -- COALESCE(generation_id, id) is load-bearing and easy to lose.
    -- COUNT(DISTINCT generation_id) alone would fold every historical row --
    -- all of which predate the column and have it NULL -- into a single
    -- countable value, quietly resetting those players' limits. Falling back
    -- to the row's own id keeps a pre-combined row counting as one call,
    -- which is exactly what it was.
    SELECT
      COUNT(DISTINCT COALESCE(generation_id, id))
        FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'),
      COUNT(DISTINCT COALESCE(generation_id, id))
    INTO v_hour_count, v_day_count
    FROM move_prompt_suggestions
    WHERE profile_id = p_profile_id
      AND source = 'player'
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
