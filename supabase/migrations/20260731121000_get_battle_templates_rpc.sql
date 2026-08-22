-- =============================================================================
-- Server-side template serving: get_battle_templates(p_battle_id)
-- =============================================================================
-- Replaces the client-side "fetch all prompt_templates and slice(0, 5)"
-- pattern with a deterministic, server-selected set of 3 templates for a
-- given battle:
--   * one template per move type (attack / defense / finisher — the full
--     move_type enum used by battle_prompts.move_type);
--   * deterministic per (battle_id, caller profile id) via md5-based ordering,
--     so each player gets a stable (and usually different) set and refetches
--     never reshuffle;
--   * same difficulty tier across the 3 where feasible: a preferred tier is
--     chosen deterministically (the tier covering the most move types, hash
--     tie-break), and each move-type slot prefers that tier before falling
--     back to any tier;
--   * only currently-active templates (active_from <= now() < active_until);
--   * ranked battles additionally require is_ranked_safe = TRUE;
--   * fewer than 3 rows only when the library lacks a move type — never an
--     error for that case.
--
-- SECURITY DEFINER (search_path pinned) so selection is not constrained by
-- the prompt_templates RLS policy shape; caller must be an authenticated
-- participant of the battle, validated inside (house style:
-- 20260709120000_opponent_move_profile.sql). Idempotent: CREATE OR REPLACE +
-- REVOKE/GRANT.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_battle_templates(p_battle_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  category TEXT,
  suggested_move_type move_type
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_battle RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT b.mode, b.player_one_id, b.player_two_id
  INTO v_battle
  FROM battles b
  WHERE b.id = p_battle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  IF v_caller IS DISTINCT FROM v_battle.player_one_id
     AND v_caller IS DISTINCT FROM v_battle.player_two_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  RETURN QUERY
  WITH pool AS (
    SELECT
      pt.id,
      pt.title,
      pt.body,
      pt.category,
      pt.suggested_move_type,
      pt.difficulty,
      md5(p_battle_id::text || ':' || v_caller::text || ':' || pt.id::text) AS pick_hash
    FROM prompt_templates pt
    WHERE pt.suggested_move_type IS NOT NULL
      AND pt.active_from <= NOW()
      AND (pt.active_until IS NULL OR pt.active_until > NOW())
      AND (v_battle.mode <> 'ranked' OR pt.is_ranked_safe = TRUE)
  ),
  preferred_tier AS (
    -- Deterministically pick the difficulty tier with the broadest move-type
    -- coverage; hash tie-break varies the tier across battles/callers.
    SELECT p2.difficulty AS tier
    FROM pool p2
    WHERE p2.difficulty IS NOT NULL
    GROUP BY p2.difficulty
    ORDER BY
      COUNT(DISTINCT p2.suggested_move_type) DESC,
      md5(p_battle_id::text || ':' || v_caller::text || ':' || p2.difficulty)
    LIMIT 1
  ),
  ranked AS (
    SELECT
      p.*,
      ROW_NUMBER() OVER (
        PARTITION BY p.suggested_move_type
        ORDER BY
          (p.difficulty IS NOT DISTINCT FROM (SELECT t.tier FROM preferred_tier t)) DESC,
          p.pick_hash
      ) AS rn
    FROM pool p
  )
  SELECT r.id, r.title, r.body, r.category, r.suggested_move_type
  FROM ranked r
  WHERE r.rn = 1
  ORDER BY r.suggested_move_type;
END;
$$;

-- Callable by signed-in players (participation is validated inside);
-- never by anon.
REVOKE ALL ON FUNCTION get_battle_templates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_battle_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_battle_templates(UUID) TO service_role;

COMMENT ON FUNCTION get_battle_templates IS
  'Server-selected prompt templates for a battle: 3 rows, one per move type, deterministic per (battle, caller), ranked-safe filter for ranked mode. Participant-gated.';
