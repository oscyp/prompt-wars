-- =============================================================================
-- Enforced per-hour / per-day rate limits (§7.8)
-- =============================================================================
-- account_abuse_signals carries *_24h counters, but they never decay and
-- nothing ever blocked on them — §7.8's "server-side rate limits on battles
-- created and prompts submitted" was recorded, not enforced. This helper
-- counts directly from the source tables (battles / battle_prompts), which
-- have authoritative timestamps, so no counter-reset job is needed.
--
-- Callers (matchmaking, submit-prompt Edge Functions) turn a disallowed
-- result into HTTP 429. Caps are generous for humans and tight for scripts;
-- battle participation (either seat) counts toward the battle cap so joining
-- via matchmaking is limited the same as queueing.
-- =============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_profile_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Service-role only, like the other anti-abuse helpers.
REVOKE ALL ON FUNCTION check_rate_limit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT) TO service_role;

-- Index support: battles already has creation-time indexes per player via
-- idx_battles_player_one/two; battle_prompts is covered by its profile FK
-- lookups plus created_at filter on small per-user row counts.
