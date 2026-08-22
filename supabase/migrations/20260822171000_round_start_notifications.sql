-- ============================================================================
-- round_start push category
-- ============================================================================
--
-- Why the column is mandatory, not optional
-- -----------------------------------------
-- `can_send_notification(p_profile_id, p_category)` resolves the category as a
-- COLUMN IDENTIFIER:
--
--     EXECUTE format('SELECT %I FROM notification_preferences WHERE profile_id = $1',
--                    p_category)
--
-- (20260708121000_quiet_hours_enforcement.sql). Sending a category with no
-- matching boolean column raises, and `_shared/push.ts` treats a gate error as
-- "allow only for result_ready" -- so a round_start push would be silently
-- dropped for every player. The column has to exist before the code ships.
--
-- What this notification is for
-- -----------------------------
-- Bo3 rounds 2 and 3 spawn with a lock-in deadline whenever the previous round
-- resolves, which in an async game is often while the player is away. Until
-- now nothing told them a new round had started -- `_shared/push.ts` only had
-- result_ready, opponent_submitted and video_ready -- so a player could lose a
-- round to a clock they never knew was running. That became a live fairness
-- problem the moment migration 20260802120000 turned Bo3 on for every mode.
--
-- Defaults to TRUE like every other category. It is not a must-send: unlike
-- result_ready it respects the category toggle, quiet hours and the 2-per-day
-- cap, because a round opening is less important than a result landing.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS round_start BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_preferences.round_start IS
  'Opt-in for "round N is live" pushes in Bo3 battles. Read by name via '
  'can_send_notification(); the column must exist for the category to work.';
