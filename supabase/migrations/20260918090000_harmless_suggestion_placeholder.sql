-- Make the suggestion placeholder harmless to a client that renders it.
--
-- The slot for a suggestion set is claimed with a placeholder row BEFORE the
-- model is called -- that claim is what stops a concurrent request taking the
-- same free slot while we wait on the provider. The new client never shows it,
-- because it reads `moderation_status` and treats 'pending' as "still coming".
--
-- App builds already in players' hands do not. They read the row's
-- `suggestions` array and render whatever is in it, so for the ~8-10s a
-- prefetch is in flight they would show a card titled "pending" reading
-- "generation in progress" -- and at 23 characters that clears the 20-char
-- minimum in validatePromptText, so a player could tap Use and submit it as
-- their actual battle prompt.
--
-- The claim cannot simply be empty: move_prompt_suggestions_shape bounds the
-- array to 1..3 entries, which is what stops a malformed provider response
-- being persisted. So instead the placeholder becomes a real, bland, valid
-- prompt for the move it is holding a slot for. If a player does catch the
-- window and submit it, they have submitted something ordinary rather than
-- something broken -- and within seconds the real suggestions overwrite it.
--
-- This is a stopgap for older clients, not a permanent design: once every
-- build filters on moderation_status the text stops being reachable at all.

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
    CASE m
      WHEN 'attack' THEN
        '[{"title":"Opening move","body":"Describe how your fighter opens the exchange, using their signature item and the arena around them."}]'::jsonb
      WHEN 'defense' THEN
        '[{"title":"Turn the attack","body":"Describe how your fighter absorbs or redirects what is coming, using their signature item and the arena around them."}]'::jsonb
      ELSE
        '[{"title":"Close it out","body":"Describe how your fighter ends the exchange for good, using their signature item and the arena around them."}]'::jsonb
    END,
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
