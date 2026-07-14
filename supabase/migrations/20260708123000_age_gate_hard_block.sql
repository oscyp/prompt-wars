-- =============================================================================
-- Server-side age gate hard block (§22: "no minor accounts at signup")
-- =============================================================================
-- The 18+ gate lived only in the client (welcome/sign-up screens); nothing
-- server-side recorded or enforced it, so any API caller could create an
-- account without ever passing the gate. Enforce it where the account is
-- born: handle_new_user() rejects auth signups whose user metadata does not
-- carry an explicit `age_confirmed: true`, which aborts the auth.users INSERT
-- (GoTrue surfaces a signup error) — a true hard block, not a UI alert.
--
-- The attestation moment is stamped onto the profile (age_confirmed_at) for
-- compliance/audit. Existing accounts predate the server gate but attested
-- via the client flow; they are backfilled so they are not locked out.
--
-- Note: the app is email/password only today. If OAuth providers are added
-- later, their signup path must inject age_confirmed metadata after its own
-- gate, or signups will be rejected by design.
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;

-- Legacy accounts attested through the old client-only flow.
UPDATE profiles
SET age_confirmed_at = COALESCE(age_confirmed_at, created_at);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- §22 hard block: failed/absent age gate aborts account creation entirely.
  IF COALESCE((NEW.raw_user_meta_data->>'age_confirmed')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation';
  END IF;

  INSERT INTO profiles (id, username, display_name, age_confirmed_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET age_confirmed_at = COALESCE(profiles.age_confirmed_at, NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN profiles.age_confirmed_at IS
  'When the account holder attested 18+ at signup (server-enforced by handle_new_user)';
