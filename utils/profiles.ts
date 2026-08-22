/**
 * Column list for client-side reads of the `profiles` table.
 *
 * The client no longer holds full-table SELECT on `profiles`. Migration
 * 20260822152000 revoked it and re-granted only the public, game-facing
 * columns, because the previous `profiles_select_own` policy was a tautology
 * (`id = auth.uid() OR rating IS NOT NULL`, and `rating` is NOT NULL DEFAULT
 * 1500) that exposed every player's `is_test_user`, `shadow_rating`,
 * `age_confirmed_at` and grant counters to every other player.
 *
 * `select('*')` now fails with "permission denied for column", so reads must
 * name their columns. Keep this list in lockstep with the GRANT in that
 * migration — adding a column here without granting it fails at runtime, and
 * granting one without a reason re-widens the leak.
 *
 * Server-owned economy and safety state (credits, allowances, entitlements) is
 * not here by design; read it through `getWalletBalance()` in
 * `utils/monetization.ts`, which goes through a server-side RPC.
 */
export const PUBLIC_PROFILE_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'rating',
  'level',
  'xp',
  'total_battles',
  'wins',
  'losses',
  'draws',
  'current_streak',
  'best_streak',
  'created_at',
].join(', ');
