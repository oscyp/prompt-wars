-- ============================================================================
-- public_player_cosmetics: also expose the active fighter's archetype + colour
-- ============================================================================
--
-- Rankings, the Battles list and the Arena's battle rows drew the neutral
-- illustration for every other player because `characters` is owner-only
-- under RLS. The archetype and signature colour are already public by design:
-- both are shown to every opponent on the face-off and in every reveal
-- payload, and the leaderboard is an identity surface (concept §9). The view
-- that already publishes the equipped cosmetics is the right place.
--
-- Owner-rights view on purpose (security_invoker stays false): it must read
-- every active character, not just the caller's. It exposes nothing that a
-- battle does not: no name, no battle cry, no prompt, no stats.
--
-- Idempotent: CREATE OR REPLACE VIEW; the SELECT grant to authenticated
-- already exists and is re-stated.
-- ============================================================================

CREATE OR REPLACE VIEW public.public_player_cosmetics
WITH (security_invoker = false) AS
  SELECT
    c.profile_id,
    c.cosmetic_config,
    c.archetype,
    c.signature_color
  FROM public.characters c
  WHERE c.is_active = true;

GRANT SELECT ON public.public_player_cosmetics TO authenticated;

COMMENT ON VIEW public.public_player_cosmetics IS
  'Per-player public presentation: equipped cosmetics plus the active fighter''s archetype and signature colour. Owner-rights view; exposes only what every opponent already sees in a battle.';
