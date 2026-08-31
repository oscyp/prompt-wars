-- =============================================================================
-- Fix: claim_leave_battle raised 55000 on every non-forfeit leave
-- =============================================================================
-- The original declared the two rating lookups as RECORDs and only assigned
-- them on the ranked-human branch. On the 'canceled' branch -- bots, unranked,
-- unmatched, which is most leaves -- they stayed unassigned, and reading a
-- field off an unassigned RECORD raises
--
--   55000: record "v_winner" is not assigned yet
--
-- at the closing jsonb_build_object. So every bot-battle leave 500'd.
--
-- Caught by executing the function, not by pushing it: PL/pgSQL bodies are not
-- planned until first call, so `db push` reported success on a function that
-- could not complete a single one of its most common paths.
--
-- The fix is the declarations. Scalars stay NULL when unassigned; RECORDs
-- refuse to be read at all. Body otherwise identical to 20260828121000.

CREATE OR REPLACE FUNCTION public.claim_leave_battle(
  p_battle_id       UUID,
  p_profile_id      UUID,
  p_credits         INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_battle          RECORD;
  v_has_locked      BOOLEAN;
  v_charge          INTEGER := 0;
  v_balance         INTEGER;
  v_transaction_id  UUID;
  v_replayed        BOOLEAN := FALSE;
  v_winner_id       UUID;
  v_action          TEXT;
  v_next_status     battle_status;
  v_rows            INTEGER;
  -- Scalars, not RECORDs. A RECORD that is never assigned -- which is exactly
  -- what happens on the 'canceled' path, where there is no winner -- raises
  -- 55000 "record is not assigned yet" the moment jsonb_build_object reads a
  -- field off it. Scalars simply stay NULL.
  v_winner_rating     NUMERIC;
  v_winner_deviation  NUMERIC;
  v_winner_volatility NUMERIC;
  v_loser_rating      NUMERIC;
  v_loser_deviation   NUMERIC;
  v_loser_volatility  NUMERIC;
BEGIN
  -- ---------------------------------------------------------------------
  -- Reads and rejections. Nothing below this block writes.
  -- ---------------------------------------------------------------------

  -- FOR UPDATE is the serialization primitive for the whole function: it is
  -- what stops two concurrent leaves, or a leave racing a resolve, from both
  -- passing the status check.
  SELECT b.id, b.status, b.mode, b.format, b.is_player_two_bot,
         b.player_one_id, b.player_two_id, b.current_round,
         b.player_one_rounds_won, b.player_two_rounds_won
  INTO v_battle
  FROM battles b
  WHERE b.id = p_battle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'battle_not_found');
  END IF;

  IF p_profile_id IS DISTINCT FROM v_battle.player_one_id
     AND p_profile_id IS DISTINCT FROM v_battle.player_two_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_participant');
  END IF;

  -- Already over. Idempotent success, not an error: the player asked for the
  -- battle to be finished and it is. First of two double-tap defences.
  IF v_battle.status IN ('completed', 'expired', 'canceled',
                         'moderation_failed', 'generation_failed') THEN
    RETURN jsonb_build_object(
      'success', TRUE, 'action', 'already_terminal', 'charged', 0
    );
  END IF;

  -- 'resolving', 'result_ready' and 'generating_video' are deliberately NOT
  -- leavable: the judge already has the battle. Racing round-resolve for the
  -- 'resolving' claim would be a far worse failure than telling the player
  -- they were a few seconds late.
  IF v_battle.status NOT IN ('created', 'matched', 'waiting_for_prompts') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'battle_in_progress');
  END IF;

  -- Scoped to THIS player, not the battle. The old gate counted locked prompts
  -- battle-wide, so the opponent locking first took away your free exit -- you
  -- were charged for their commitment. You pay for walking out on your own.
  -- No round filter: a leave ends the series, whichever round it happened in.
  SELECT EXISTS (
    SELECT 1 FROM battle_prompts bp
    WHERE bp.battle_id = p_battle_id
      AND bp.profile_id = p_profile_id
      AND bp.is_locked
  ) INTO v_has_locked;

  IF v_has_locked AND COALESCE(p_credits, 0) > 0 THEN
    v_charge := p_credits;

    -- THE SAME advisory key spend_for_prompt_suggestions (20260826130000:179)
    -- and purchase_cosmetic (20260619122000:159) take, so all three paid
    -- surfaces serialize against each other rather than each against itself.
    PERFORM pg_advisory_xact_lock(hashtext('wallet:' || p_profile_id::text));

    -- Replay, checked INSIDE the lock so two concurrent retries of the same
    -- key cannot both miss it. Second double-tap defence: even if two taps
    -- land before either commits, one waits on the lock and then sees this.
    SELECT id INTO v_transaction_id
    FROM wallet_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_transaction_id IS NOT NULL THEN
      v_replayed := TRUE;
    ELSE
      SELECT COALESCE(SUM(amount), 0) INTO v_balance
      FROM wallet_transactions
      WHERE profile_id = p_profile_id AND currency_type = 'credits';

      IF v_balance < v_charge THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'insufficient_credits',
          'balance', v_balance,
          'price', v_charge
        );
      END IF;

      -- No round number, no move type, nothing about the battle's shape in the
      -- metadata: this row is the ONLY record that the exit was paid for, and
      -- it must stay out of anything the judge can reach.
      v_transaction_id := spend_credits(
        p_profile_id,
        v_charge,
        'leave_battle',
        p_idempotency_key,
        p_battle_id,
        NULL,
        jsonb_build_object('feature', 'leave_battle')
      );
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Writes.
  -- ---------------------------------------------------------------------

  -- A bot, an unranked match, or a battle nobody was matched into has no
  -- opponent whose record is worth adjusting -- it is canceled, not forfeited.
  IF v_battle.mode <> 'ranked'
     OR v_battle.is_player_two_bot
     OR v_battle.player_two_id IS NULL THEN
    v_action := 'canceled';
    v_next_status := 'canceled';
  ELSE
    v_action := 'forfeited';
    -- resolve_battle's idempotency guard is `status = 'resolving'`
    -- (20260506120000:293) and it returns FALSE against anything else, so this
    -- flip is not bookkeeping -- it is the precondition for the caller being
    -- able to resolve at all.
    v_next_status := 'resolving';
    v_winner_id := CASE
      WHEN p_profile_id = v_battle.player_one_id THEN v_battle.player_two_id
      ELSE v_battle.player_one_id
    END;
  END IF;

  UPDATE battles
  SET status = v_next_status,
      completed_at = CASE WHEN v_next_status = 'canceled' THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE id = p_battle_id
    AND status IN ('created', 'matched', 'waiting_for_prompts');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- Unreachable behind FOR UPDATE; raising rather than returning so that a
    -- charge taken above rolls back with it rather than being stranded.
    RAISE EXCEPTION 'leave_claim_lost: battle % changed status mid-claim', p_battle_id;
  END IF;

  -- Close every open round, not just the current one. A round left in
  -- 'waiting_for_prompts' keeps a live lock_in_deadline, and expire-battles
  -- sweeps battle_rounds without checking the parent battle's status -- so an
  -- already-finished battle's stale round gets handed to round-resolve later.
  -- round_status has carried an unused 'canceled' value since 20260525120000;
  -- this is what it was for.
  --
  -- The round is NOT awarded to the opponent: the series is already theirs, and
  -- awarding both would double-count it in rounds_won.
  IF v_battle.format = 'bo3' THEN
    UPDATE battle_rounds
    SET status = 'canceled',
        resolved_at = NOW()
    WHERE battle_id = p_battle_id
      AND status IN ('pending', 'waiting_for_prompts');
  END IF;

  -- Glicko inputs for the caller, so it makes no second round trip. Mirrors
  -- what claim_forfeit_timeout_battles returns.
  IF v_action = 'forfeited' THEN
    SELECT rating, rating_deviation, rating_volatility
    INTO v_winner_rating, v_winner_deviation, v_winner_volatility
    FROM profiles WHERE id = v_winner_id;
    SELECT rating, rating_deviation, rating_volatility
    INTO v_loser_rating, v_loser_deviation, v_loser_volatility
    FROM profiles WHERE id = p_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'action', v_action,
    'charged', CASE WHEN v_replayed THEN 0 ELSE v_charge END,
    'replayed', v_replayed,
    'transaction_id', v_transaction_id,
    'previous_status', v_battle.status,
    'winner_id', v_winner_id,
    'loser_id', p_profile_id,
    'mode', v_battle.mode,
    'format', v_battle.format,
    'is_bot', v_battle.is_player_two_bot,
    'current_round', v_battle.current_round,
    'player_one_rounds_won', v_battle.player_one_rounds_won,
    'player_two_rounds_won', v_battle.player_two_rounds_won,
    'player_one_id', v_battle.player_one_id,
    'player_two_id', v_battle.player_two_id,
    'winner_rating', v_winner_rating,
    'winner_rating_deviation', v_winner_deviation,
    'winner_rating_volatility', v_winner_volatility,
    'loser_rating', v_loser_rating,
    'loser_rating_deviation', v_loser_deviation,
    'loser_rating_volatility', v_loser_volatility
  );
END;
$$;

COMMENT ON FUNCTION public.claim_leave_battle(UUID, UUID, INTEGER, TEXT) IS
  'Ends a battle at the leaving player''s request and charges for it in one '
  'transaction: free before that player has locked a prompt, p_credits after. '
  'Returns JSONB rather than raising so the caller can surface '
  'insufficient_credits. A ''forfeited'' result leaves the battle in '
  '''resolving'' for the caller to pass to resolve_battle.';

-- Service-role only. Schema public's default ACL grants EXECUTE to anon and
-- authenticated on every new function, and REVOKE ... FROM PUBLIC does not
-- remove those explicit grants -- so they are named here.
REVOKE ALL ON FUNCTION public.claim_leave_battle(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_leave_battle(UUID, UUID, INTEGER, TEXT)
  TO service_role;
