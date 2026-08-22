-- ============================================================================
-- Fix reclaim_stuck_rounds(): battle_rounds.status is an enum, not text
-- ============================================================================
--
-- 20260822181000 created the function with:
--
--     status = CASE WHEN ... THEN 'expired' ELSE 'waiting_for_prompts' END
--
-- `battle_rounds.status` is of type `round_status`
-- (pending | waiting_for_prompts | resolving | result_ready | expired |
-- canceled | moderation_failed), and a CASE over bare string literals resolves
-- to `text`, so the assignment raised:
--
--     42804: column "status" is of type round_status but expression is of
--            type text
--
-- PL/pgSQL does not plan a function body until it first executes, so
-- `supabase db push` applied the migration cleanly and the fault only appeared
-- when the function was actually called. It would have thrown on EVERY sweep --
-- caught by invoking it against the live database rather than trusting the
-- successful migration.
--
-- Fix: cast the CASE result to round_status. The `r.status = 'expired'`
-- comparison in RETURNING is fine as-is; PostgreSQL coerces the literal to the
-- enum for comparison. Only the assignment needed the explicit cast.
--
-- Second fault found the same way: `battle_rounds.round_number` is SMALLINT,
-- not INTEGER, so the RETURNS TABLE contract raised
--
--     42804: structure of query does not match function result type
--
-- on the next invocation. RETURNS TABLE is strict about exact types. The
-- projected columns are now cast explicitly rather than relying on the column
-- types matching the declaration.
--
-- Idempotent: CREATE OR REPLACE with an unchanged signature, so grants survive.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reclaim_stuck_rounds(
  p_stale_minutes INTEGER DEFAULT 10,
  p_max_attempts  INTEGER DEFAULT 3
)
RETURNS TABLE (
  round_id      UUID,
  battle_id     UUID,
  round_number  INTEGER,
  attempts      INTEGER,
  dead_lettered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - make_interval(mins => GREATEST(p_stale_minutes, 1));
BEGIN
  RETURN QUERY
  WITH stale AS (
    SELECT r.id
    FROM battle_rounds r
    WHERE r.status = 'resolving'
      AND r.updated_at < v_cutoff
    ORDER BY r.updated_at ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  ),
  bumped AS (
    UPDATE battle_rounds r
    SET
      resolve_attempts = r.resolve_attempts + 1,
      status = (
        CASE
          WHEN r.resolve_attempts + 1 > p_max_attempts THEN 'expired'
          ELSE 'waiting_for_prompts'
        END
      )::round_status,
      resolved_at = CASE
        WHEN r.resolve_attempts + 1 > p_max_attempts THEN NOW()
        ELSE r.resolved_at
      END,
      updated_at = NOW()
    FROM stale s
    WHERE r.id = s.id
    RETURNING
      r.id,
      r.battle_id,
      r.round_number,
      r.resolve_attempts,
      (r.status = 'expired') AS dead_lettered
  )
  SELECT
    b.id,
    b.battle_id,
    b.round_number::INTEGER,
    b.resolve_attempts::INTEGER,
    b.dead_lettered
  FROM bumped b;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stuck_rounds(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_rounds(INTEGER, INTEGER)
  TO service_role;
