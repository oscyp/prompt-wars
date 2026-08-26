--------------------------------------------------------------------------------
-- Let creation-flow drafts re-roll their portrait as often as the player likes.
--
-- portrait_seed was write-once from the moment it was set, so the creation
-- screen's "Regenerate" button could never actually produce a different look --
-- a re-roll needs a fresh seed. The guard is right for a finalized character
-- (its stored resolved prompt and every future paid regeneration key off that
-- seed) but wrong for a character the player is still designing.
--
-- "Still a draft" needs a marker the client cannot forge. The placeholder
-- battle_cry the onboarding client writes is not one: `characters` has an
-- UPDATE policy for the owning user, and U+2026 is a valid 1-character battle
-- cry that finalize-character-creation would happily accept, so a player could
-- put their character back into draft state and mint free portraits forever.
-- finalized_at is written only by service-role code and, per the trigger below,
-- can never be cleared once set.
--------------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

COMMENT ON COLUMN characters.finalized_at IS
  'Set by finalize-character-creation when the character leaves the creation '
  'flow. NULL means the row is still a draft: it may re-roll its portrait for '
  'free. Server-owned -- the guard trigger refuses to clear it once set.';

-- Backfill: anything that is not carrying the onboarding placeholder battle_cry
-- has already been through creation. chr(8230) is U+2026, the placeholder.
UPDATE characters
   SET finalized_at = COALESCE(last_edited_at, created_at, NOW())
 WHERE finalized_at IS NULL
   AND battle_cry IS DISTINCT FROM chr(8230);

CREATE INDEX IF NOT EXISTS idx_characters_draft
  ON characters(profile_id)
  WHERE finalized_at IS NULL;

--------------------------------------------------------------------------------
-- Guard trigger: seed is write-once for finalized characters only, and
-- finalized_at is one-way.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION characters_guard_and_touch()
RETURNS TRIGGER AS $$
BEGIN
  -- One-way latch. Without this, a client UPDATE could drop the row back into
  -- draft state and reopen both the free-portrait path and finalize-character-
  -- creation's rename/re-trait path, both of which are otherwise paid.
  IF OLD.finalized_at IS NOT NULL AND NEW.finalized_at IS NULL THEN
    RAISE EXCEPTION 'finalized_at cannot be cleared once set';
  END IF;

  -- Seed stays write-once after finalization; drafts re-roll freely.
  IF OLD.portrait_seed IS NOT NULL
     AND NEW.portrait_seed IS DISTINCT FROM OLD.portrait_seed
     AND OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'portrait_seed is immutable once set';
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    NEW.last_edited_at := NOW();
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS characters_guard_and_touch_trg ON characters;
CREATE TRIGGER characters_guard_and_touch_trg
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION characters_guard_and_touch();
