-- A public read path for equipped cosmetics.
--
-- Cosmetics are worn to be seen -- a "Champion" title or an "On Fire" badge has
-- no purpose that isn't social. But they live on `characters.cosmetic_config`,
-- and the only SELECT policy on that table is `characters_select_own`
-- (profile_id = auth.uid()), so no client can read anybody else's.
--
-- Battle surfaces get around this through the service-role payload composers
-- (sign-battle-portraits, compose-reveal-payload). The leaderboard has no such
-- composer: it is a plain client query joining `rankings` to `profiles`, and
-- standing up an Edge Function for a decoration would be the wrong shape.

--------------------------------------------------------------------------------
-- Why SECURITY DEFINER here, when the entitlement views were fixed to INVOKER
--------------------------------------------------------------------------------
-- The entitlement views were a defect precisely because they ran as their owner
-- and bypassed RLS on data that was supposed to be per-user. This is the
-- opposite case: the projection is public BY DESIGN, and the whole point is to
-- read past `characters_select_own`.
--
-- The alternative -- a permissive policy on `characters` -- was tried and is
-- wrong. RLS policies are OR'd and apply to the whole row, so
-- `USING (is_active = TRUE)` would have exposed every column of every active
-- character: names, battle cries, traits, prompts, seeds. A definer view is the
-- only construct here that can expose two columns and not the other twenty.
--
-- Safety therefore rests on the projection, so it is deliberately minimal:
-- profile_id (already public via `rankings`) and cosmetic_config. Nothing else
-- from the row travels. Widening this view means re-doing that argument.

CREATE OR REPLACE VIEW public_player_cosmetics
WITH (security_invoker = false) AS
  SELECT
    c.profile_id,
    c.cosmetic_config
  FROM characters c
  WHERE c.is_active = TRUE;

COMMENT ON VIEW public_player_cosmetics IS
  'Equipped cosmetics of each player''s active character. SECURITY DEFINER on purpose: cosmetics are public by design. Exposes only profile_id and cosmetic_config -- do not widen without revisiting why that is safe.';

-- Schema public's default ACL grants EXECUTE/SELECT to anon and authenticated on
-- creation, so state the intended grants rather than inheriting them.
REVOKE ALL ON public_player_cosmetics FROM PUBLIC;
REVOKE ALL ON public_player_cosmetics FROM anon;
GRANT SELECT ON public_player_cosmetics TO authenticated;
