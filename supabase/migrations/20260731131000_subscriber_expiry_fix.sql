-- Subscriber expiry fix for entitlement views
--
-- Problem: RevenueCat fires CANCELLATION the moment a user turns OFF
-- auto-renew, while the user remains PAID until expires_at. Both entitlement
-- views keyed subscriber benefits on `status = 'active'` only, so:
--   (a) a paying subscriber lost allowance/badge/cosmetics/priority for the
--       rest of their already-paid period the moment they canceled, and
--   (b) a missed EXPIRATION webhook left an 'active' row granting benefits
--       forever (no expires_at check).
--
-- Fix: subscriber predicate becomes
--   status IN ('active', 'canceled') AND expires_at > NOW()
--
-- Notes:
-- * `entitlements` / `entitlements_v2` are derived VIEWs, never tables.
--   CREATE OR REPLACE VIEW preserves existing ACLs and comments, and the
--   output column lists below are byte-identical to the prior definitions
--   (only the subscription join + subscriber boolean expressions change),
--   so no re-grants are required.
-- * The join moves to a LATERAL subquery with LIMIT 1. The old plain join
--   (`ON ... AND s.status = 'active'`) could already fan out with two active
--   rows; with 'canceled' now qualifying, a cancel-then-resubscribe user
--   would reliably have two matching rows and duplicate view rows would
--   break `.single()` consumers. The lateral picks the active row first,
--   then the latest-expiring one.
-- * A NULL expires_at fails the predicate (NULL > NOW() is not true), which
--   is the intended fail-closed behavior: the webhook always writes
--   expires_at, so a row without one is not trusted for benefits.
-- * 'expired' and 'paused' remain non-subscriber regardless of expires_at;
--   EXPIRATION stays a terminal status.

-- Partial index supporting the new lateral lookup (the existing
-- idx_subscriptions_profile_active only covers status = 'active').
CREATE INDEX IF NOT EXISTS idx_subscriptions_profile_entitled
  ON subscriptions (profile_id, expires_at DESC)
  WHERE status IN ('active', 'canceled');

--------------------------------------------------------------------------------
-- entitlements (latest prior definition: 20260619122000_cosmetics_shop.sql)
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW entitlements AS
SELECT
  p.id AS profile_id,
  (s.profile_id IS NOT NULL) AS is_subscriber,
  s.tier AS subscription_tier,
  COALESCE(s.monthly_video_allowance - s.monthly_video_allowance_used, 0) AS monthly_video_allowance_remaining,
  COALESCE(
    (SELECT SUM(amount) FROM wallet_transactions wt
     WHERE wt.profile_id = p.id AND wt.currency_type = 'credits'),
    0
  ) AS credits_balance,
  (s.profile_id IS NOT NULL) AS priority_queue,
  COALESCE(
    (SELECT jsonb_agg(c.slug ORDER BY c.slug)
     FROM player_cosmetics pc
     JOIN cosmetics_catalog c ON c.id = pc.cosmetic_id
     WHERE pc.profile_id = p.id),
    '[]'::jsonb
  ) AS cosmetic_unlocks,
  GREATEST(p.updated_at, s.updated_at,
    (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.profile_id = p.id)
  ) AS updated_at
FROM profiles p
LEFT JOIN LATERAL (
  SELECT *
  FROM subscriptions sub
  WHERE sub.profile_id = p.id
    AND sub.status IN ('active', 'canceled')
    AND sub.expires_at > NOW()
  ORDER BY (sub.status = 'active') DESC, sub.expires_at DESC
  LIMIT 1
) s ON TRUE;

COMMENT ON VIEW entitlements IS
  'Derived feature-gate view (never a table). Subscriber = status IN (''active'',''canceled'') AND expires_at > now(): CANCELLATION only turns off auto-renew, benefits run until paid period ends; expired/missing expires_at fails closed.';

--------------------------------------------------------------------------------
-- entitlements_v2 (latest prior definition: 20260525150000_entitlements_round_units.sql)
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW entitlements_v2 AS
SELECT
  p.id AS profile_id,
  (s.profile_id IS NOT NULL) AS is_subscriber,
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

  (s.profile_id IS NOT NULL) AS priority_queue,
  '[]'::JSONB AS cosmetic_unlocks,
  GREATEST(
    p.updated_at,
    s.updated_at,
    (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.profile_id = p.id)
  ) AS updated_at
FROM profiles p
LEFT JOIN LATERAL (
  SELECT *
  FROM subscriptions sub
  WHERE sub.profile_id = p.id
    AND sub.status IN ('active', 'canceled')
    AND sub.expires_at > NOW()
  ORDER BY (sub.status = 'active') DESC, sub.expires_at DESC
  LIMIT 1
) s ON TRUE;

COMMENT ON VIEW entitlements_v2 IS
  'Round-unit feature-gate view for Bo3 Tier 1 video upgrades. Replaces `entitlements` over one release. Subscriber = status IN (''active'',''canceled'') AND expires_at > now() (CANCELLATION keeps benefits until the paid period ends; fails closed on missing expires_at).';
