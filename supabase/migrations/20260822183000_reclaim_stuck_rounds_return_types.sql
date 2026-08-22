-- ============================================================================
-- Re-apply reclaim_stuck_rounds() with the SMALLINT return cast
-- ============================================================================
--
-- 20260822182000 fixed the round_status enum assignment, but the very next
-- invocation surfaced a second type fault:
--
--     42804: structure of query does not match function result type
--
-- `battle_rounds.round_number` is SMALLINT while RETURNS TABLE declared
-- INTEGER, and RETURNS TABLE requires exact type equality. Both faults share a
-- cause: PL/pgSQL does not plan a function body until first execution, so
-- `supabase db push` reported success for a function that raised on every call.
-- Neither was visible from the migration; both were found by invoking the
-- function against the live database.
--
-- 20260822182000 has already been applied to the linked project, and editing an
-- applied migration does not re-run it -- hence this follow-up. Its file on disk
-- carries the corrected body too, so a fresh `supabase db reset` also lands in
-- the right state; this migration is then a harmless re-apply.
--
-- Lesson worth keeping: a migration applying cleanly says nothing about whether
-- a PL/pgSQL function works. Call it.
--
-- Idempotent: CREATE OR REPLACE with an unchanged signature.
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
