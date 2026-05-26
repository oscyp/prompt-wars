-- Bo3 Round-Unit Monetization
--
-- Migrates entitlements from per-battle Tier 1 video allowance to per-round
-- units, in support of Best-of-3 rounds where each round has its own optional
-- Tier 1 video upgrade.
--
-- Compatibility: original `entitlements` view is preserved for one release.
-- New code reads `entitlements_v2`. Legacy `free_tier1_reveals_remaining` is
-- preserved; a new column `new_user_round_grants_remaining` (max 3, 1/battle)
-- governs the Bo3 grant flow. Subscriber counters are extended with
-- `monthly_round_allowance_*` and `monthly_full_battle_cap_*`.
--
-- Anti-pay-to-win: this migration touches monetization-only state. No column
-- here is ever read by the judge, scoring, HP, or stat-modifier paths.

--------------------------------------------------------------------------------
-- WALLET_TRANSACTIONS: round-unit ledger columns + hold/finalize status
--------------------------------------------------------------------------------

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS round_number SMALLINT
    CHECK (round_number IS NULL OR round_number BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final'
    CHECK (status IN ('final','held','spent','released','refunded')),
  ADD COLUMN IF NOT EXISTS source TEXT;
    -- subscriber_full | subscriber_round | credit | new_user_grant | system

COMMENT ON COLUMN wallet_transactions.round_number IS
  'Bo3 round (1..3) this entry applies to. NULL for single-format / non-round entries.';
COMMENT ON COLUMN wallet_transactions.status IS
  'Lifecycle of the ledger entry. "held" = reserved, "spent"/"released"/"refunded" terminal.';
COMMENT ON COLUMN wallet_transactions.source IS
  'Entitlement source that produced this entry; matches request-video-upgrade source labels.';

-- Idempotency: per (battle, round, reason) at most one hold/charge entry.
-- Partial unique excludes legacy rows where round_number IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_round_charge_unique
  ON wallet_transactions(battle_id, round_number, reason)
  WHERE battle_id IS NOT NULL
    AND round_number IS NOT NULL
    AND reason IN (
      'round_upgrade_hold',
      'round_upgrade_grant_hold',
      'round_upgrade_subscriber_audit'
    );

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_battle_round
  ON wallet_transactions(battle_id, round_number)
  WHERE battle_id IS NOT NULL AND round_number IS NOT NULL;

--------------------------------------------------------------------------------
-- SUBSCRIPTIONS: round-unit + full-battle cap counters
--------------------------------------------------------------------------------
-- Concept doc target: 30 full-cinematic Bo3 battles/month = 90 round-upgrades.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS monthly_round_allowance INTEGER NOT NULL DEFAULT 90
    CHECK (monthly_round_allowance >= 0),
  ADD COLUMN IF NOT EXISTS monthly_round_allowance_used INTEGER NOT NULL DEFAULT 0
    CHECK (monthly_round_allowance_used >= 0),
  ADD COLUMN IF NOT EXISTS monthly_full_battle_cap INTEGER NOT NULL DEFAULT 30
    CHECK (monthly_full_battle_cap >= 0),
  ADD COLUMN IF NOT EXISTS monthly_full_battle_cap_used INTEGER NOT NULL DEFAULT 0
    CHECK (monthly_full_battle_cap_used >= 0);

COMMENT ON COLUMN subscriptions.monthly_round_allowance IS
  'Bo3 round-unit allowance per period (subscriber). 90 = 30 battles * 3 rounds.';
COMMENT ON COLUMN subscriptions.monthly_full_battle_cap IS
  'Cap on whole-battle auto-cinematic Bo3 battles per period (subscriber).';

--------------------------------------------------------------------------------
-- PROFILES: Bo3 new-user grant tokens (distinct from legacy per-battle reveals)
--------------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS new_user_round_grants_remaining INTEGER NOT NULL DEFAULT 3
    CHECK (new_user_round_grants_remaining BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS new_user_round_grants_granted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS new_user_grant_per_battle_limit SMALLINT NOT NULL DEFAULT 1
    CHECK (new_user_grant_per_battle_limit >= 1);

COMMENT ON COLUMN profiles.new_user_round_grants_remaining IS
  'Bo3 new-user round-upgrade tokens. 1 token/round, max 1 token/battle, 7-day expiry.';
COMMENT ON COLUMN profiles.new_user_grant_per_battle_limit IS
  'Hard ceiling on Bo3 new-user round-upgrade tokens that can be applied within a single battle.';

-- Backfill from legacy column for existing accounts (capped at 3).
UPDATE profiles
SET new_user_round_grants_remaining = LEAST(
      COALESCE(free_tier1_reveals_remaining, 0),
      3
    ),
    new_user_round_grants_granted_at = COALESCE(
      free_tier1_reveals_granted_at,
      created_at,
      NOW()
    )
WHERE new_user_round_grants_remaining = 3
  AND free_tier1_reveals_remaining IS NOT NULL;

--------------------------------------------------------------------------------
-- ENTITLEMENTS_V2 VIEW
--------------------------------------------------------------------------------
-- Single source of truth for round-unit feature gates. Old `entitlements` view
-- is left intact (one-release deprecation window).

CREATE OR REPLACE VIEW entitlements_v2 AS
SELECT
  p.id AS profile_id,
  COALESCE(s.status = 'active', FALSE) AS is_subscriber,
  s.tier AS subscription_tier,

  -- Legacy field (deprecated; kept for one release for old clients/RPCs):
  COALESCE(s.monthly_video_allowance - s.monthly_video_allowance_used, 0)
    AS monthly_video_allowance_remaining,

  -- Round-unit subscriber counters:
  COALESCE(s.monthly_round_allowance - s.monthly_round_allowance_used, 0)
    AS monthly_round_allowance_remaining,
  COALESCE(s.monthly_full_battle_cap - s.monthly_full_battle_cap_used, 0)
    AS monthly_full_battle_cap_remaining,
  s.allowance_reset_at,

  -- New-user grant (Bo3 round-upgrade tokens, 7-day expiry):
  CASE
    WHEN p.new_user_round_grants_granted_at IS NULL THEN 0
    WHEN NOW() - p.new_user_round_grants_granted_at > INTERVAL '7 days' THEN 0
    ELSE COALESCE(p.new_user_round_grants_remaining, 0)
  END AS new_user_round_grants_remaining,
  p.new_user_grant_per_battle_limit,

  -- Credit balance from immutable ledger (held entries reserve credits, so they
  -- are netted in via amount; released entries are reversed elsewhere).
  COALESCE((
    SELECT SUM(amount)
    FROM wallet_transactions wt
    WHERE wt.profile_id = p.id
      AND wt.currency_type = 'credits'
      AND wt.status IN ('final', 'held', 'spent', 'refunded')
  ), 0) AS credits_balance,

  COALESCE(s.status = 'active', FALSE) AS priority_queue,
  '[]'::JSONB AS cosmetic_unlocks,
  GREATEST(
    p.updated_at,
    s.updated_at,
    (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.profile_id = p.id)
  ) AS updated_at
FROM profiles p
LEFT JOIN subscriptions s
  ON s.profile_id = p.id AND s.status = 'active';

COMMENT ON VIEW entitlements_v2 IS
  'Round-unit feature-gate view for Bo3 Tier 1 video upgrades. Replaces `entitlements` over one release.';

--------------------------------------------------------------------------------
-- ROUND-UNIT WALLET RPCs (hold / finalize / release)
--------------------------------------------------------------------------------

-- Reserve 1 credit for a round upgrade. Idempotent on (battle_id, round_number).
-- Returns the wallet_transactions.id of the hold row.
CREATE OR REPLACE FUNCTION reserve_round_upgrade_credit(
  p_profile_id UUID,
  p_battle_id UUID,
  p_round_number SMALLINT,
  p_idempotency_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_existing UUID;
  v_balance INTEGER;
  v_tx_id UUID;
BEGIN
  -- Idempotency: existing hold for this (battle, round) returns same id.
  SELECT id INTO v_existing
  FROM wallet_transactions
  WHERE battle_id = p_battle_id
    AND round_number = p_round_number
    AND reason = 'round_upgrade_hold'
    AND profile_id = p_profile_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Lock balance computation via row lock on profile.
  PERFORM 1 FROM profiles WHERE id = p_profile_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id
    AND currency_type = 'credits'
    AND status IN ('final', 'held', 'spent', 'refunded');

  IF v_balance < 1 THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  INSERT INTO wallet_transactions (
    profile_id, amount, balance_after, currency_type,
    reason, status, source,
    battle_id, round_number,
    idempotency_key,
    metadata
  ) VALUES (
    p_profile_id, -1, v_balance - 1, 'credits',
    'round_upgrade_hold', 'held', 'credit',
    p_battle_id, p_round_number,
    p_idempotency_key,
    jsonb_build_object('tier', 'tier1', 'unit', 'round')
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reserve_round_upgrade_credit IS
  'Reserves (holds) 1 credit for a Bo3 round upgrade. Idempotent on (battle_id, round_number).';

-- Reserve a new-user grant token for a round upgrade. Enforces per-battle limit.
CREATE OR REPLACE FUNCTION reserve_round_upgrade_grant(
  p_profile_id UUID,
  p_battle_id UUID,
  p_round_number SMALLINT,
  p_idempotency_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_existing UUID;
  v_remaining INTEGER;
  v_granted_at TIMESTAMPTZ;
  v_per_battle_limit SMALLINT;
  v_grants_this_battle INTEGER;
  v_balance INTEGER;
  v_tx_id UUID;
BEGIN
  -- Idempotency for same (battle, round).
  SELECT id INTO v_existing
  FROM wallet_transactions
  WHERE battle_id = p_battle_id
    AND round_number = p_round_number
    AND reason = 'round_upgrade_grant_hold'
    AND profile_id = p_profile_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT new_user_round_grants_remaining,
         new_user_round_grants_granted_at,
         new_user_grant_per_battle_limit
    INTO v_remaining, v_granted_at, v_per_battle_limit
  FROM profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_granted_at IS NULL
     OR NOW() - v_granted_at > INTERVAL '7 days' THEN
    RAISE EXCEPTION 'grant_expired';
  END IF;

  IF COALESCE(v_remaining, 0) <= 0 THEN
    RAISE EXCEPTION 'no_grants_remaining';
  END IF;

  SELECT COUNT(*) INTO v_grants_this_battle
  FROM wallet_transactions
  WHERE battle_id = p_battle_id
    AND profile_id = p_profile_id
    AND source = 'new_user_grant'
    AND status IN ('held', 'spent');

  IF v_grants_this_battle >= v_per_battle_limit THEN
    RAISE EXCEPTION 'per_battle_grant_limit_reached';
  END IF;

  UPDATE profiles
  SET new_user_round_grants_remaining = new_user_round_grants_remaining - 1
  WHERE id = p_profile_id;

  -- Zero-amount audit hold row (grants don't move credits balance).
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id
    AND currency_type = 'credits'
    AND status IN ('final', 'held', 'spent', 'refunded');

  INSERT INTO wallet_transactions (
    profile_id, amount, balance_after, currency_type,
    reason, status, source,
    battle_id, round_number,
    idempotency_key,
    metadata
  ) VALUES (
    p_profile_id, 0, v_balance, 'credits',
    'round_upgrade_grant_hold', 'held', 'new_user_grant',
    p_battle_id, p_round_number,
    p_idempotency_key,
    jsonb_build_object('tier', 'tier1', 'unit', 'round', 'grant', true)
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reserve_round_upgrade_grant IS
  'Reserves a Bo3 new-user round-upgrade token. Enforces 7-day window and 1/battle.';

-- Finalize a held round-upgrade reservation.
CREATE OR REPLACE FUNCTION finalize_round_upgrade(
  p_reservation_id UUID,
  p_outcome TEXT  -- 'succeeded' | 'failed' | 'moderation_failed'
)
RETURNS VOID AS $$
DECLARE
  v_row wallet_transactions%ROWTYPE;
  v_balance INTEGER;
BEGIN
  IF p_outcome NOT IN ('succeeded', 'failed', 'moderation_failed') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  SELECT * INTO v_row FROM wallet_transactions
  WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  -- Idempotent: already terminal.
  IF v_row.status IN ('spent', 'released', 'refunded') THEN
    RETURN;
  END IF;

  IF v_row.status <> 'held' THEN
    RAISE EXCEPTION 'reservation_not_held';
  END IF;

  IF p_outcome = 'succeeded' THEN
    UPDATE wallet_transactions
    SET status = 'spent'
    WHERE id = p_reservation_id;
    RETURN;
  END IF;

  -- Refund/release path.
  IF v_row.source = 'credit' THEN
    -- Restore balance with a positive reversal row, leave hold marked 'released'.
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM wallet_transactions
    WHERE profile_id = v_row.profile_id
      AND currency_type = 'credits'
      AND status IN ('final', 'held', 'spent', 'refunded');

    INSERT INTO wallet_transactions (
      profile_id, amount, balance_after, currency_type,
      reason, status, source,
      battle_id, round_number,
      idempotency_key,
      metadata
    ) VALUES (
      v_row.profile_id,
      -v_row.amount,            -- positive (since hold was negative)
      v_balance - v_row.amount,
      'credits',
      'round_upgrade_refund',
      'refunded',
      'credit',
      v_row.battle_id, v_row.round_number,
      'refund:' || v_row.id::text,
      jsonb_build_object(
        'reservation_id', v_row.id,
        'outcome', p_outcome
      )
    );

    UPDATE wallet_transactions
    SET status = 'released'
    WHERE id = p_reservation_id;

  ELSIF v_row.source = 'new_user_grant' THEN
    UPDATE profiles
    SET new_user_round_grants_remaining = LEAST(
          new_user_round_grants_remaining + 1, 3)
    WHERE id = v_row.profile_id;

    UPDATE wallet_transactions
    SET status = 'released'
    WHERE id = p_reservation_id;
  ELSE
    -- Unknown source: just mark released; no balance to move.
    UPDATE wallet_transactions
    SET status = 'released'
    WHERE id = p_reservation_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION finalize_round_upgrade IS
  'Terminates a held round-upgrade reservation: spend on success, refund/release on failure. Idempotent.';

-- Subscriber decrement on confirmed success (no decrement on failure).
CREATE OR REPLACE FUNCTION decrement_subscriber_round_allowance(
  p_profile_id UUID,
  p_battle_id UUID,
  p_round_number SMALLINT,
  p_is_full_battle BOOLEAN,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing UUID;
  v_sub_id UUID;
BEGIN
  -- Idempotency.
  SELECT id INTO v_existing FROM wallet_transactions
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  SELECT id INTO v_sub_id FROM subscriptions
  WHERE profile_id = p_profile_id AND status = 'active'
  ORDER BY starts_at DESC LIMIT 1
  FOR UPDATE;

  IF v_sub_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE subscriptions
  SET monthly_round_allowance_used = monthly_round_allowance_used + 1,
      monthly_full_battle_cap_used =
        CASE WHEN p_is_full_battle
             THEN monthly_full_battle_cap_used + 1
             ELSE monthly_full_battle_cap_used END,
      updated_at = NOW()
  WHERE id = v_sub_id;

  INSERT INTO wallet_transactions (
    profile_id, amount, balance_after, currency_type,
    reason, status, source,
    battle_id, round_number,
    idempotency_key,
    metadata
  )
  SELECT
    p_profile_id, 0,
    COALESCE(SUM(amount), 0),
    'credits',
    'round_upgrade_subscriber_audit',
    'spent',
    CASE WHEN p_is_full_battle THEN 'subscriber_full' ELSE 'subscriber_round' END,
    p_battle_id, p_round_number,
    p_idempotency_key,
    jsonb_build_object('subscription_id', v_sub_id, 'full_battle', p_is_full_battle)
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits'
    AND status IN ('final','held','spent','refunded');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decrement_subscriber_round_allowance IS
  'Decrements subscriber round (and optionally full-battle) counters on confirmed success. Idempotent.';

--------------------------------------------------------------------------------
-- NOTES
--------------------------------------------------------------------------------
-- handle_new_user() is unchanged: defaults on `new_user_round_grants_remaining`
-- (3) and `new_user_round_grants_granted_at` (NOW()) automatically seed new
-- profiles. Existing accounts are backfilled above from `free_tier1_reveals_*`.
--
-- Subscriber period boundary (INITIAL_PURCHASE / RENEWAL) resets are handled
-- by the revenuecat-webhook Edge Function (see same-day commit).
