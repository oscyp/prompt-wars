--------------------------------------------------------------------------------
-- character_edits.edit_kind: allow the portrait kinds that actually occur.
--
-- Two problems with the existing CHECK constraint:
--
-- 1. `regenerate-portrait` writes `edit_kind: priceKey`, which for the avatar
--    ladder is 'regenerate_avatar' or 'initial_avatar'. Neither was permitted,
--    so every avatar render failed its audit insert. The failure was invisible
--    because that insert does not check its error -- the portrait itself was
--    stored and the character updated, only the log row was lost. Confirmed
--    against the live table: zero rows of either kind have ever been written.
--
-- 2. 'portrait_restore' is new, written by the restore-portrait function when a
--    player reverts to an earlier render (free).
--
-- Rewritten as an explicit drop + add so the constraint has one definition
-- rather than an accumulation of ALTERs.
--------------------------------------------------------------------------------

ALTER TABLE character_edits
  DROP CONSTRAINT IF EXISTS character_edits_edit_kind_check;

ALTER TABLE character_edits
  ADD CONSTRAINT character_edits_edit_kind_check CHECK (
    edit_kind = ANY (ARRAY[
      'traits',
      'signature_item',
      'palette',
      'name',
      'regenerate_portrait',
      'new_portrait',
      'regenerate_avatar',
      'initial_avatar',
      'portrait_restore',
      'custom_item_text',
      'custom_item_image',
      'battle_cry',
      'signature_color',
      'archetype'
    ])
  );
