-- Add is_test_user flag to profiles for bypassing cooldowns, rate limits, and
-- active battle locks during development and QA.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_test_user IS
  'When true, Edge Functions skip cooldowns, daily limits, and active battle locks for this profile.';
