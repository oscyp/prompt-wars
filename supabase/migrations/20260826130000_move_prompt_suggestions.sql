-- ============================================================================
-- Per-fighter move prompt suggestions: storage, free-slot rule, wallet lock
-- ============================================================================
--
-- Why
-- ---
-- Prompt help today is 14 static rows in `prompt_templates` with no character
-- dimension at all -- the same generic text regardless of whether the player
-- built a mystic or a titan. This table holds LLM-generated suggestions
-- written for the specific fighter, for a specific move type, in a specific
-- round.
--
-- The free set is an INDEX, not a counter
-- ---------------------------------------
-- A player gets one free set per (battle, round, move type); further sets cost
-- a credit. The obvious implementation -- count existing rows, decide free or
-- paid -- is a check-then-act race: two taps a few milliseconds apart both
-- read zero and both get a free set.
--
-- Instead the free slot is a partial unique index. The Edge Function ATTEMPTS
-- the free insert first and treats 23505 as "the slot is taken, this call is
-- paid". Two concurrent first taps: Postgres picks exactly one winner. The
-- client cannot lie about it because the client never asserts it.
--
-- Scoped per MOVE TYPE deliberately, so a player can look at what attack,
-- defense and finisher suggestions would be before committing to one -- the
-- choice is the interesting decision, and charging to view it would push
-- players back to the generic templates.
--
-- Provenance must never reach the judge
-- -------------------------------------
-- Whether a prompt came from a paid suggestion is recorded HERE and nowhere
-- else. `assertNoMonetizationDataInScoring` throws on a key named
-- credits/purchase/entitlement in the judge input, and `round-resolve` claims
-- the round into `resolving` BEFORE calling the judge -- so leaking this into
-- the scoring path would not merely bias a score, it would strand the round.
-- Nothing here is joined into the prompt read used for scoring.
--
-- Idempotent: CREATE TABLE/INDEX/POLICY IF NOT EXISTS throughout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.move_prompt_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  battle_id    UUID NOT NULL REFERENCES public.battles(id)   ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  character_id UUID          REFERENCES public.characters(id) ON DELETE SET NULL,

  round_number SMALLINT  NOT NULL DEFAULT 1,
  move_type    move_type NOT NULL,

  -- [{ "title": "...", "body": "..." }, ...]. Bounded 1..3 so a malformed
  -- provider response cannot be persisted as an empty or bloated set.
  suggestions JSONB NOT NULL,

  -- Economy
  is_paid                BOOLEAN NOT NULL DEFAULT FALSE,
  credits_spent          INTEGER NOT NULL DEFAULT 0,
  wallet_transaction_id  UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,

  -- Provider telemetry, same convention as video_jobs / judge_runs so
  -- daily_provider_costs can absorb this surface later.
  provider            TEXT,
  provider_model      TEXT,
  provider_cost_usd   NUMERIC(10, 6),
  provider_latency_ms INTEGER,

  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  idempotency_key   TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT move_prompt_suggestions_shape
    CHECK (jsonb_typeof(suggestions) = 'array'
           AND jsonb_array_length(suggestions) BETWEEN 1 AND 3),

  -- A free set must never carry a spend, and a paid set must carry one. This
  -- is the invariant a refund path is most likely to get half-right.
  CONSTRAINT move_prompt_suggestions_paid_consistency
    CHECK ((is_paid = FALSE AND credits_spent = 0)
           OR (is_paid = TRUE AND credits_spent > 0))
);

-- The free slot. One row per (battle, profile, round, move type) where
-- is_paid = FALSE; paid rows are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_move_prompt_suggestions_free_slot
  ON public.move_prompt_suggestions
     (battle_id, profile_id, round_number, move_type)
  WHERE is_paid = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_move_prompt_suggestions_idempotency
  ON public.move_prompt_suggestions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The read the client makes: everything I have for this round.
CREATE INDEX IF NOT EXISTS idx_move_prompt_suggestions_lookup
  ON public.move_prompt_suggestions
     (battle_id, profile_id, round_number, created_at DESC);

-- REQUIRED by the check_rate_limit branch in 20260826131000. Without it that
-- branch sequential-scans the whole table on every suggestion request.
CREATE INDEX IF NOT EXISTS idx_move_prompt_suggestions_profile_created
  ON public.move_prompt_suggestions (profile_id, created_at DESC);

COMMENT ON TABLE public.move_prompt_suggestions IS
  'LLM-generated prompt suggestions personalised to a fighter. One free set '
  'per (battle, profile, round, move_type) enforced by a partial unique '
  'index -- never by a counter, which would be racy.';

COMMENT ON COLUMN public.move_prompt_suggestions.is_paid IS
  'FALSE rows occupy the free slot. Provenance stays on this table and must '
  'never be joined into the judge input.';

-- ----------------------------------------------------------------------------
-- RLS: owner reads only
-- ----------------------------------------------------------------------------

ALTER TABLE public.move_prompt_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS move_prompt_suggestions_select_own
  ON public.move_prompt_suggestions;

CREATE POLICY move_prompt_suggestions_select_own
  ON public.move_prompt_suggestions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- No client INSERT/UPDATE/DELETE at any level: writes are the Edge Function's,
-- and a client-side insert would hand out free credits by claiming is_paid.
REVOKE ALL ON public.move_prompt_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.move_prompt_suggestions TO authenticated;
GRANT ALL    ON public.move_prompt_suggestions TO service_role;

-- ----------------------------------------------------------------------------
-- Reroll price
-- ----------------------------------------------------------------------------
--
-- Housed in `character_edit_prices` despite the name. That table is the only
-- server-owned credit price list, and every read of it is a keyed lookup
-- (`getEditPrice`, _shared/character-creation.ts:36) rather than a listing, so
-- an extra key shows up in no UI and repricing needs no deploy. The
-- alternative -- a constant in the Edge Function -- would make a price change
-- a code change, which is worse than an imprecise table name.

INSERT INTO public.character_edit_prices (edit_kind, credits, cooldown_seconds)
VALUES ('prompt_suggestions_reroll', 1, 0)
ON CONFLICT (edit_kind) DO NOTHING;

-- ----------------------------------------------------------------------------
-- spend_for_prompt_suggestions: the paid path, serialized per wallet
-- ----------------------------------------------------------------------------
--
-- `spend_credits` reads the balance and inserts with no row lock, so N
-- concurrent calls can all pass the balance check and overspend. This takes
-- THE SAME advisory key purchase_cosmetic uses (20260619122000:159), so the
-- two paid surfaces serialize against each other and not merely against
-- themselves -- a player buying a cosmetic and rerolling suggestions at the
-- same moment is exactly the case a per-function lock would miss.

CREATE OR REPLACE FUNCTION public.spend_for_prompt_suggestions(
  p_profile_id      UUID,
  p_battle_id       UUID,
  p_credits         INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_balance        INTEGER;
  v_transaction_id UUID;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid_amount');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || p_profile_id::text));

  -- Replay: an idempotency hit returns the original transaction rather than
  -- charging twice. Checked INSIDE the lock so two concurrent retries of the
  -- same key cannot both miss.
  SELECT id INTO v_transaction_id
  FROM wallet_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF v_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'replayed', TRUE,
      'transaction_id', v_transaction_id,
      'credits', p_credits
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits';

  IF v_balance < p_credits THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'insufficient_credits',
      'balance', v_balance,
      'price', p_credits
    );
  END IF;

  v_transaction_id := spend_credits(
    p_profile_id,
    p_credits,
    'prompt_suggestions',
    p_idempotency_key,
    p_battle_id,
    NULL,
    jsonb_build_object('feature', 'move_prompt_suggestions')
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'replayed', FALSE,
    'transaction_id', v_transaction_id,
    'credits', p_credits
  );
END;
$$;

COMMENT ON FUNCTION public.spend_for_prompt_suggestions(UUID, UUID, INTEGER, TEXT) IS
  'Charges for a suggestion reroll under the shared wallet advisory lock. '
  'Returns a JSONB result rather than raising, so the caller can surface '
  'insufficient_credits without unwinding its own transaction.';

REVOKE ALL ON FUNCTION
  public.spend_for_prompt_suggestions(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.spend_for_prompt_suggestions(UUID, UUID, INTEGER, TEXT)
  TO service_role;
