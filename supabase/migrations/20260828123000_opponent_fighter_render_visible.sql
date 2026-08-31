-- =============================================================================
-- The opponent's full-body render is no longer reserved
-- =============================================================================
-- `character_portraits_select_opponent_current` was documented as: "Opponents
-- may see the AVATAR row only. The fighter render is the video reference and
-- reveal asset and stays owner-only."
--
-- That reservation is lifted: tapping an avatar in a battle now opens the other
-- fighter's full-body render, on the reasoning that a character you are fighting
-- is a character you should be able to look at.
--
-- NOTE WHAT DOES AND DOES NOT CHANGE. The policy body is untouched, because it
-- was never the mechanism: storage RLS keys on the owner's uid in the object
-- path, so a client could never fetch the bytes through this policy anyway. The
-- fighter render reaches the opponent through `sign-battle-portraits`, which is
-- service-role and participant-gated and signs a time-limited URL per battle.
-- Direct row reads stay avatar-only.
--
-- Only the comment changes, so that the next person to read this policy is not
-- told the opposite of what the product does.
COMMENT ON POLICY character_portraits_select_opponent_current
  ON public.character_portraits IS
  'Opponents may read the AVATAR row directly. The fighter render is served to '
  'them through sign-battle-portraits (service-role, participant-gated, '
  'time-limited signed URL) for the tap-to-enlarge viewer, never by direct row '
  'read. Note this policy exposes rows, not bytes -- storage RLS still keys on '
  'the owner uid in the path.';
