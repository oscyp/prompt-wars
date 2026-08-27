-- Character appearance version
--
-- The edit screen told players "your portrait is out of date" whenever
-- `characters.last_edited_at` was newer than the current render. That timestamp
-- is touched by `characters_guard_and_touch` on ANY column change, so renaming a
-- fighter or rewriting a battle cry -- neither of which the portrait prompt even
-- reads -- produced a nudge to spend a credit on a render that would come back
-- identical.
--
-- This replaces the heuristic with a counter that moves only when something the
-- render actually depends on changes. The appearance-affecting set is exactly
-- what `resolvePortraitPrompt` consumes
-- (supabase/functions/_shared/portrait-prompt-resolver.ts): archetype,
-- signature_color, signature_item_id, the five traits, art_style and the raw
-- prompt override. `name` and `battle_cry` are deliberately excluded.
--
-- signature_color is in the set on purpose: `describeSignatureColor` feeds the
-- prompt, so it tints the render as well as the UI accents.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS appearance_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE character_portraits
  ADD COLUMN IF NOT EXISTS appearance_version INTEGER;

-- Backfill every existing render to 0, matching the characters default, so all
-- current characters read FRESH at migration time.
--
-- This is a deliberate one-time amnesty. We cannot reconstruct which traits a
-- historical render was produced under, and a false-fresh state is a strictly
-- better failure mode than the false-stale one this migration exists to remove:
-- the first genuine visual edit afterwards bumps the character past its render
-- and the nudge becomes truthful from then on.
UPDATE character_portraits
  SET appearance_version = 0
  WHERE appearance_version IS NULL;

-- Rebased on the body from 20260826154210 (the finalized_at latch and the
-- draft-seed rules), NOT the original from 20260513120000. Replacing the older
-- body would silently reopen the free portrait re-roll and free rename paths
-- that latch exists to close.
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

  -- Only columns the portrait prompt reads bump the appearance version.
  IF NEW.archetype             IS DISTINCT FROM OLD.archetype
     OR NEW.signature_color    IS DISTINCT FROM OLD.signature_color
     OR NEW.signature_item_id  IS DISTINCT FROM OLD.signature_item_id
     OR NEW.vibe               IS DISTINCT FROM OLD.vibe
     OR NEW.silhouette         IS DISTINCT FROM OLD.silhouette
     OR NEW.palette_key        IS DISTINCT FROM OLD.palette_key
     OR NEW.era                IS DISTINCT FROM OLD.era
     OR NEW.expression         IS DISTINCT FROM OLD.expression
     OR NEW.art_style          IS DISTINCT FROM OLD.art_style
     OR NEW.portrait_prompt_raw IS DISTINCT FROM OLD.portrait_prompt_raw
  THEN
    NEW.appearance_version := COALESCE(OLD.appearance_version, 0) + 1;
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    NEW.last_edited_at := NOW();
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is unchanged; recreate defensively so a database that
-- somehow lost it comes back consistent.
DROP TRIGGER IF EXISTS characters_guard_and_touch_trg ON characters;
CREATE TRIGGER characters_guard_and_touch_trg
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION characters_guard_and_touch();

COMMENT ON COLUMN characters.appearance_version IS
  'Bumped by characters_guard_and_touch when a column the portrait prompt reads changes. Compare against character_portraits.appearance_version to tell whether the live render still matches the character.';
COMMENT ON COLUMN character_portraits.appearance_version IS
  'The characters.appearance_version this render was produced under. NULL on rows predating the column; treat NULL as up to date.';
