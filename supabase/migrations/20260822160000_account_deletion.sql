-- ============================================================================
-- Account deletion (App Store guideline 5.1.1(v))
-- ============================================================================
--
-- What was missing
-- ----------------
-- The app had no in-app account deletion at all: no UI, no Edge Function, no
-- RPC. Apple rejects any account-creating app without one. landing/privacy-
-- policy.html:413-414 hedges with "where available", which is not a defence.
--
-- Why this anonymizes instead of hard-deleting
-- --------------------------------------------
-- A plain `DELETE FROM profiles` is destructive far beyond the requesting user.
-- Verified against the live schema on 2026-08-22:
--
--   battles.player_one_id        -> profiles   ON DELETE CASCADE
--   battles.player_two_id        -> profiles   ON DELETE CASCADE
--   battles.player_one_character_id -> characters ON DELETE CASCADE
--   battles.player_two_character_id -> characters ON DELETE CASCADE
--   purchases.profile_id         -> profiles   ON DELETE CASCADE
--   wallet_transactions.profile_id -> profiles ON DELETE CASCADE
--
-- So deleting one profile would erase every battle that player ever fought --
-- including the OPPONENT's match history, ranked record and reveal payloads --
-- plus the purchase and wallet ledgers that revenue reconciliation depends on.
-- Deleting their characters cascades to battles for the same reason.
--
-- Instead: scrub every piece of personal data, keep the row skeleton for
-- referential integrity, and delete the auth user so sign-in is impossible.
-- That satisfies both 5.1.1(v) (the account is gone and unrecoverable) and
-- GDPR erasure, which permits retaining anonymized records.
--
-- Note there is NO foreign key from profiles.id to auth.users -- the only FK on
-- profiles is the self-referencing rival_profile_id. Deleting the auth user
-- therefore does not cascade anywhere, which is what makes this approach safe.
-- The Edge Function deletes the auth user after this function returns.
--
-- What gets scrubbed:
--   profiles       username -> deleted_<8 hex of id> (UNIQUE, so derived from
--                  the id to guarantee no collision), display_name, avatar_url,
--                  age_confirmed_at, rival_profile_id
--   characters     name, battle_cry (user-authored text shown to opponents)
--   push_tokens    deleted outright (device identifiers)
--   notification_preferences  deleted outright
--
-- What is deliberately kept: battles, battle_prompts, wallet_transactions,
-- purchases, rankings. All are either shared with another player or needed for
-- financial reconciliation, and none carry identifying data once the profile is
-- scrubbed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, and the
-- function itself early-returns if the profile is already deleted.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Set by delete_my_account(). The row is retained anonymized so opponents keep '
  'their battle history; the auth user is deleted so sign-in is impossible.';

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.delete_my_account(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_already TIMESTAMPTZ;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'p_profile_id is required';
  END IF;

  SELECT deleted_at INTO v_already
  FROM profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Idempotent: a retried request must not fail or re-scrub.
  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('already_deleted', TRUE, 'deleted_at', v_already);
  END IF;

  -- User-authored character text is visible to past opponents on reveal
  -- screens, so it is scrubbed. The rows stay: deleting them would cascade
  -- to battles.
  UPDATE characters
  SET name        = 'Deleted character',
      battle_cry  = '',
      is_active   = FALSE
  WHERE profile_id = p_profile_id;

  -- Device identifiers and contact preferences: no reason to retain.
  DELETE FROM push_tokens              WHERE profile_id = p_profile_id;
  DELETE FROM notification_preferences WHERE profile_id = p_profile_id;

  -- Anyone who had this player tagged as their rival loses the tag.
  UPDATE profiles
  SET rival_profile_id = NULL
  WHERE rival_profile_id = p_profile_id;

  DELETE FROM rivals
  WHERE profile_id = p_profile_id OR rival_profile_id = p_profile_id;

  UPDATE profiles
  SET username         = 'deleted_' || substring(replace(p_profile_id::text, '-', '') from 1 for 8),
      display_name     = 'Deleted player',
      avatar_url       = NULL,
      age_confirmed_at = NULL,
      rival_profile_id = NULL,
      deleted_at       = NOW(),
      updated_at       = NOW()
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('already_deleted', FALSE, 'deleted_at', NOW());
END;
$$;

COMMENT ON FUNCTION public.delete_my_account(UUID) IS
  'Anonymizes a profile for account deletion. Service-role only: the caller '
  '(delete-account Edge Function) authenticates the user and then deletes the '
  'auth user, which is what actually revokes access.';

REVOKE ALL ON FUNCTION public.delete_my_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account(UUID) TO service_role;
