-- ============================================================================
-- Scope profiles SELECT to public game fields; drop policies that gate nothing
-- ============================================================================
--
-- What was wrong
-- --------------
-- 1. `profiles_select_own` (20260506100000_core_gameplay_schema.sql:425-428) is
--    a tautology. Verified live on 2026-08-22 its expression is:
--
--        ((id = auth.uid()) OR (rating IS NOT NULL))
--
--    `rating` is NUMERIC NOT NULL DEFAULT 1500.00, so the second disjunct is
--    ALWAYS true and the policy reduces to `USING (true)`. Combined with the
--    full-table SELECT grant, every authenticated user could read every other
--    user's complete profile row: is_test_user, shadow_rating,
--    shadow_rating_enabled, age_confirmed_at, free_tier1_reveals_remaining and
--    the new_user_* grant counters.
--
-- 2. Four write policies imply a client write path that must never exist:
--    battle_prompts_insert_own, player_daily_quests_insert_own,
--    player_daily_quests_update_own, appeals_insert_own. The first is the worst
--    -- a client could insert its own prompt row with
--    moderation_status='approved' and is_locked=true, and lock_prompt's
--    idempotent early return (20260731130000:94-118) would then accept it,
--    bypassing moderation, rate limits and the quality floor entirely.
--
-- The fix
-- -------
--   * Replace the tautology with an honest `USING (true)` policy and let
--     column-level grants do the real gating. Rows must stay readable: both
--     app/(tabs)/rankings.tsx and utils/battles.ts:235-242 join
--     profiles(username, display_name) for other players, so restricting to
--     `id = auth.uid()` would blank the leaderboard and the battles list.
--   * Grant SELECT only on the public, game-facing columns.
--   * Drop the four dead write policies.
--
-- Column list rationale: verified by reading every consumer. app/(tabs)/profile.tsx
-- and app/(profile)/stats.tsx use display_name, username, rating, total_battles,
-- wins, losses and draws; rankings.tsx and utils/battles.ts use username and
-- display_name. level/xp/streaks/avatar_url/created_at are included as
-- game-facing fields a profile or leaderboard screen would reasonably show.
-- Everything else stays unreadable by the client.
--
-- Notes:
--   * No RLS policy anywhere references the `profiles` table, so narrowing the
--     column grant cannot break policy evaluation. Verified against pg_policy.
--   * This migration REQUIRES the matching client change in the same release:
--     app/(tabs)/profile.tsx and app/(profile)/stats.tsx must stop using
--     select('*'), because `*` expands to columns the role no longer holds and
--     PostgREST would return "permission denied for column".
--   * Dropping the four policies is defence in depth. 20260822151000 already
--     revoked the underlying INSERT/UPDATE privileges; removing the policies
--     means a future blanket re-grant cannot silently re-open them.
--   * Edge Functions are unaffected -- service_role bypasses both grants and RLS.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY, REVOKE/GRANT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles: honest policy + column-scoped SELECT
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_public_game_fields ON public.profiles
  FOR SELECT
  USING (TRUE);

COMMENT ON POLICY profiles_select_public_game_fields ON public.profiles IS
  'Rows are intentionally readable by any authenticated user so leaderboards and '
  'battle history can show opponent names. Sensitive columns are withheld by the '
  'column-level SELECT grant, not by this policy. Do not widen that grant.';

REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  rating,
  level,
  xp,
  total_battles,
  wins,
  losses,
  draws,
  current_streak,
  best_streak,
  created_at
) ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Drop write policies that must never have a client path
-- ----------------------------------------------------------------------------

-- All prompt writes go through submit-prompt -> lock_prompt (service_role),
-- which is where moderation, rate limiting and the quality floor live.
DROP POLICY IF EXISTS battle_prompts_insert_own ON public.battle_prompts;

-- Quest progress is awarded by apply_post_battle_rewards / daily-meta and
-- converts directly into credits.
DROP POLICY IF EXISTS player_daily_quests_insert_own ON public.player_daily_quests;
DROP POLICY IF EXISTS player_daily_quests_update_own ON public.player_daily_quests;

-- Appeals go through the appeal-battle Edge Function, which enforces the
-- documented one-per-day cap via can_appeal.
DROP POLICY IF EXISTS appeals_insert_own ON public.appeals;
