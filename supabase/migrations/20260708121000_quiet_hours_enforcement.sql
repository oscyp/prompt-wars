-- =============================================================================
-- Enforce quiet hours in can_send_notification (§20)
-- =============================================================================
-- notification_preferences has carried quiet_hours_enabled/start/end since the
-- economy schema landed, but can_send_notification never read them, so the
-- setting silently did nothing. Suppress soft categories inside the window;
-- result_ready keeps its must-send bypass (same contract as the category-off
-- and daily-cap gates).
--
-- Times are interpreted as UTC (the columns are bare TIME; the client is
-- responsible for converting the user's local quiet window to UTC). A window
-- with start > end wraps past midnight, e.g. 22:00–07:00. start = end is
-- treated as no window.
-- =============================================================================

CREATE OR REPLACE FUNCTION can_send_notification(
  p_profile_id UUID,
  p_category TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_max_per_day INTEGER;
  v_sent_today INTEGER;
  v_category_enabled BOOLEAN;
  v_quiet_enabled BOOLEAN;
  v_quiet_start TIME;
  v_quiet_end TIME;
  v_now_utc TIME;
BEGIN
  -- Get user preferences
  SELECT max_per_day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
  INTO v_max_per_day, v_quiet_enabled, v_quiet_start, v_quiet_end
  FROM notification_preferences WHERE profile_id = p_profile_id;

  v_max_per_day := COALESCE(v_max_per_day, 2);

  -- Check category enabled
  EXECUTE format('SELECT %I FROM notification_preferences WHERE profile_id = $1', p_category)
  INTO v_category_enabled USING p_profile_id;

  v_category_enabled := COALESCE(v_category_enabled, TRUE);

  IF NOT v_category_enabled AND p_category != 'result_ready' THEN
    RETURN FALSE; -- result_ready always sends
  END IF;

  -- Quiet hours: suppress soft categories inside the window
  IF p_category != 'result_ready'
     AND COALESCE(v_quiet_enabled, FALSE)
     AND v_quiet_start IS NOT NULL
     AND v_quiet_end IS NOT NULL
     AND v_quiet_start <> v_quiet_end THEN
    v_now_utc := (NOW() AT TIME ZONE 'UTC')::TIME;
    IF v_quiet_start < v_quiet_end THEN
      -- Same-day window
      IF v_now_utc >= v_quiet_start AND v_now_utc < v_quiet_end THEN
        RETURN FALSE;
      END IF;
    ELSE
      -- Window wraps past midnight
      IF v_now_utc >= v_quiet_start OR v_now_utc < v_quiet_end THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  -- Count sends today
  SELECT COUNT(*) INTO v_sent_today
  FROM notification_sends
  WHERE profile_id = p_profile_id AND sent_at >= CURRENT_DATE;

  RETURN v_sent_today < v_max_per_day OR p_category = 'result_ready';
END;
$$ LANGUAGE plpgsql;

-- Re-assert hardening (CREATE OR REPLACE keeps ACLs, but stay explicit).
REVOKE ALL ON FUNCTION can_send_notification(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_send_notification(UUID, TEXT) TO service_role;
