-- ============================================================================
-- Reclaim Bo3 rounds stuck in 'resolving'
-- ============================================================================
--
-- The failure
-- -----------
-- `round-resolve` claims a round with a compare-and-swap
-- (waiting_for_prompts -> resolving, index.ts:240-247) and only THEN calls the
-- judge. If anything after the claim throws or the function times out -- a
-- judge outage, a provider timeout, an Edge Function 150s wall -- the round is
-- left in `resolving` forever:
--
--   * `expire-battles` only sweeps `status = 'waiting_for_prompts'`, so it
--     never sees it.
--   * The participant retry path in `resolve-battle` dispatches to
--     round-resolve, whose CAS no longer matches, so it returns
--     already_resolved and does not unstick anything.
--
-- One transient failure therefore bricks a battle permanently, with no
-- operator recourse short of hand-editing the row.
--
-- The fix
-- -------
-- Track attempts on the round and let a sweeper hand it back:
--
--   * `resolve_attempts` counts claim attempts, so a round that fails
--     repeatedly (a poison prompt, a persistent provider error) is not retried
--     forever.
--   * `reclaim_stuck_rounds()` returns rounds sitting in `resolving` past a
--     staleness window to `waiting_for_prompts` so round-resolve can re-claim
--     them, and returns the ids so the caller can re-drive resolution.
--   * Past the attempt cap the round is marked `expired` rather than retried,
--     which is the dead-letter state -- the existing per-round timeout handling
--     then applies and the series can still complete.
--
-- Staleness window: rounds normally resolve in seconds, and the Edge Function
-- wall is well under 10 minutes, so anything older than that is genuinely
-- abandoned rather than in flight. Passed as a parameter so it can be tuned
-- without a migration.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================================

ALTER TABLE public.battle_rounds
  ADD COLUMN IF NOT EXISTS resolve_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.battle_rounds.resolve_attempts IS
  'Times round-resolve has claimed this round. Incremented by '
  'reclaim_stuck_rounds() when a claim is handed back; a cap turns a poison '
  'round into a dead letter instead of an infinite retry.';

-- Partial index: the sweep runs every minute and only ever looks at 'resolving'.
CREATE INDEX IF NOT EXISTS idx_battle_rounds_resolving_stale
  ON public.battle_rounds (updated_at)
  WHERE status = 'resolving';

CREATE OR REPLACE FUNCTION public.reclaim_stuck_rounds(
  p_stale_minutes INTEGER DEFAULT 10,
  p_max_attempts  INTEGER DEFAULT 3
)
RETURNS TABLE (
  round_id     UUID,
  battle_id    UUID,
  round_number INTEGER,
  attempts     INTEGER,
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
      -- Under the cap: hand the claim back so round-resolve's CAS matches
      -- again. At or past it: dead-letter the round.
      status = CASE
        WHEN r.resolve_attempts + 1 > p_max_attempts THEN 'expired'
        ELSE 'waiting_for_prompts'
      END,
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
  SELECT b.id, b.battle_id, b.round_number, b.resolve_attempts, b.dead_lettered
  FROM bumped b;
END;
$$;

COMMENT ON FUNCTION public.reclaim_stuck_rounds(INTEGER, INTEGER) IS
  'Returns Bo3 rounds abandoned in ''resolving'' to ''waiting_for_prompts'' so '
  'round-resolve can re-claim them, dead-lettering to ''expired'' past the '
  'attempt cap. Without this a single Edge Function timeout bricks a battle.';

REVOKE ALL ON FUNCTION public.reclaim_stuck_rounds(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_rounds(INTEGER, INTEGER)
  TO service_role;
