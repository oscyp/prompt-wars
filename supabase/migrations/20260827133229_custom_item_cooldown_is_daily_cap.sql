--------------------------------------------------------------------------------
-- Custom signature items are capped per day, not per week.
--
-- `create-custom-signature-item` enforces "3 custom items per UTC day" in code
-- (skipped for is_test_user) and is the only limit that has ever applied. The
-- price rows also carried cooldown_seconds = 604800, which that function never
-- reads -- it uses getEditPrice only for `credits`.
--
-- The two rules contradict each other: honouring the column would have cut
-- players from three items a day to one a week. The daily cap is the intended
-- design, so the unread column is cleared rather than enforced. This also stops
-- the client's new cooldown display (utils/editCooldowns.ts) from advertising a
-- week-long wait that nothing imposes.
--------------------------------------------------------------------------------

UPDATE character_edit_prices
   SET cooldown_seconds = 0
 WHERE edit_kind IN ('custom_item_text', 'custom_item_image')
   AND cooldown_seconds <> 0;

COMMENT ON COLUMN character_edit_prices.cooldown_seconds IS
  'Minimum seconds between edits of this kind, enforced by edit-character '
  'against character_edits. Custom signature items are exempt: they are capped '
  'per UTC day inside create-custom-signature-item instead.';
