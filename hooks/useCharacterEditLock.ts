import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { FINAL_BATTLE_STATUSES } from '@/utils/battles';

export interface CharacterEditLock {
  /** True when the character is committed to a battle that has not finished. */
  locked: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Whether this character can be edited right now.
 *
 * Every mutating character endpoint rejects edits during an active battle with
 * `409 battle_locked`, but the app only discovered that after the player had
 * composed an edit and tapped a (sometimes paid) button. The constraint is
 * knowable on load, so we check for it and say so up front.
 *
 * No new endpoint is needed: `battles_select_participant` already scopes the
 * client to its own battles, so filtering by character id is safe.
 */
export function useCharacterEditLock(
  characterId: string | null | undefined,
): CharacterEditLock {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!characterId) {
      setLocked(false);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('battles')
        .select('id')
        .or(
          `player_one_character_id.eq.${characterId},player_two_character_id.eq.${characterId}`,
        )
        .not('status', 'in', `(${FINAL_BATTLE_STATUSES.join(',')})`)
        .limit(1);
      if (error) throw new Error(error.message);
      setLocked((data ?? []).length > 0);
    } catch (err) {
      // Fail open. A false lock hides the whole screen behind a banner the
      // player cannot clear; the server still rejects any edit that shouldn't
      // land, so being wrong in this direction costs one error message.
      console.warn('Could not determine character edit lock', err);
      setLocked(false);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { locked, loading, refresh };
}
