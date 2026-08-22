-- ============================================================================
-- Fix battles_record_opponent_history(): battle_status is an enum
-- ============================================================================
--
-- 20260822200000 guarded the trigger with:
--
--     IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed'
--
-- `battles.status` is of type `battle_status`. COALESCE forces its arguments to
-- a common type, so `''` was coerced into the enum and raised:
--
--     22P02: invalid input value for enum battle_status: ""
--
-- Because this is an AFTER UPDATE trigger on `battles`, that error would have
-- fired on EVERY battle completion -- not a silent no-op but a hard failure of
-- the transaction that finishes a battle. The migration applied cleanly; the
-- fault only appeared when a status update actually ran.
--
-- OLD is never NULL in an UPDATE trigger, so the COALESCE was pointless as well
-- as harmful. Comparing the enum directly is both correct and simpler; the
-- IS DISTINCT FROM form additionally handles a NULL OLD.status safely.
--
-- Idempotent: CREATE OR REPLACE, trigger left in place (it references the
-- function by name, so replacing the body is enough).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.battles_record_opponent_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.record_opponent_history(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
