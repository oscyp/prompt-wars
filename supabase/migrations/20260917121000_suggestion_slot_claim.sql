-- Multi-slot free claim for move prompt suggestions, plus the provenance the
-- rate limit needs.
--
-- Why a function and not an upsert
-- --------------------------------
-- Generating all three move types in ONE model call means claiming up to three
-- free slots at once. A wholesale three-row INSERT is wrong: if the player has
-- already used the free `attack` slot, the whole statement 23505s and the
-- caller concludes "this call is paid" while two free slots sit unclaimed.
--
-- The right statement is ON CONFLICT DO NOTHING ... RETURNING, which claims
-- exactly what is available and reports which. That cannot be expressed
-- through PostgREST: idx_move_prompt_suggestions_free_slot is a PARTIAL index
-- (WHERE is_paid = FALSE), so inferring it requires repeating the predicate,
-- which postgrest-js has no way to send -- the request fails with 42P10. So it
-- lives here, where the predicate can simply be written down.
--
-- Rows are claimed with a PLACEHOLDER before the model is called, exactly as
-- the single-slot path always has: the claim is what stops a concurrent
-- request taking the same free slot while we wait on the provider.

-- --------------------------------------------------------------------------
-- Provenance
-- --------------------------------------------------------------------------
-- `source` exists because the rate limit counts rows in this table, and
-- prefetched rows are not something the player asked for. Defaulting to
-- 'player' backfills every historical row correctly -- they were all
-- player-initiated.
ALTER TABLE public.move_prompt_suggestions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS generation_id UUID;

DO $$
BEGIN
  ALTER TABLE public.move_prompt_suggestions
    ADD CONSTRAINT move_prompt_suggestions_source_check
    CHECK (source IN ('player', 'prefetch'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN public.move_prompt_suggestions.source IS
  'Who caused this row: a player action, or a server-side prefetch. Only player rows count toward the suggestion rate limit.';
COMMENT ON COLUMN public.move_prompt_suggestions.generation_id IS
  'One id per model call, shared by the rows it produced, so the rate limit can count CALLS rather than rows. NULL on rows predating combined generation.';

-- Counting distinct generations per profile is the rate limit's hot path.
CREATE INDEX IF NOT EXISTS idx_move_prompt_suggestions_rate_window
  ON public.move_prompt_suggestions (profile_id, created_at)
  WHERE source = 'player';

-- --------------------------------------------------------------------------
-- claim_free_suggestion_slots
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_free_suggestion_slots(
  p_battle_id UUID,
  p_profile_id UUID,
  p_character_id UUID,
  p_round_number SMALLINT,
  p_move_types move_type[],
  p_generation_id UUID,
  p_source TEXT DEFAULT 'player',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, move_type move_type)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.move_prompt_suggestions (
    battle_id, profile_id, character_id, round_number, move_type,
    suggestions, is_paid, credits_spent, moderation_status,
    source, generation_id, idempotency_key
  )
  SELECT
    p_battle_id,
    p_profile_id,
    p_character_id,
    p_round_number,
    m,
    -- Placeholder. The read path filters on moderation_status so this text can
    -- never reach a player; it exists only to hold the slot.
    '[{"title":"pending","body":"generation in progress"}]'::jsonb,
    FALSE,
    0,
    'pending',
    p_source,
    p_generation_id,
    -- Only the first claimed slot can carry the caller's idempotency key: it
    -- is UNIQUE, so reusing it across three rows would conflict with itself.
    CASE WHEN m = p_move_types[1] THEN p_idempotency_key ELSE NULL END
  FROM unnest(p_move_types) AS m
  ON CONFLICT DO NOTHING
  RETURNING
    move_prompt_suggestions.id,
    move_prompt_suggestions.move_type;
$$;

REVOKE ALL ON FUNCTION public.claim_free_suggestion_slots(UUID, UUID, UUID, SMALLINT, move_type[], UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_suggestion_slots(UUID, UUID, UUID, SMALLINT, move_type[], UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.claim_free_suggestion_slots(UUID, UUID, UUID, SMALLINT, move_type[], UUID, TEXT, TEXT) IS
  'Claims whichever of the requested free suggestion slots are still available, as placeholder rows, and returns them. Service-role only.';
