-- Drop the redundant 5-argument `lock_prompt` overload.
--
-- `lock_prompt` was originally defined with 5 args
-- (p_battle_id, p_profile_id, p_prompt_template_id, p_custom_prompt_text,
-- p_move_type). Migration 20260525130000 added a `p_moderation_status` arg,
-- but because PostgreSQL keys functions by their full argument signature,
-- `CREATE OR REPLACE` created a SECOND function rather than replacing the
-- original. Both overloads have coexisted ever since.
--
-- This causes PostgREST to fail with PGRST203 ("Could not choose the best
-- candidate function") whenever `lock_prompt` is called with only the 5
-- shared arguments, since both overloads match. Production (submit-prompt)
-- always passes all 6 args and is unaffected, but any 5-arg caller breaks.
--
-- The 6-arg version is a strict superset: `p_moderation_status DEFAULT NULL`
-- reproduces the original 5-arg behavior exactly, so dropping the 5-arg
-- overload is safe and removes the ambiguity. Idempotent.

DROP FUNCTION IF EXISTS public.lock_prompt(uuid, uuid, uuid, text, move_type);
