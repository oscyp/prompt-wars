import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, type Href } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { FINAL_BATTLE_STATUSES } from '@/utils/battles';
import {
  battleRouteFor,
  sortBattlesForList,
  type BattleListRow,
} from '@/utils/battleLists';

export interface CharacterEditLock {
  /** True when the character is committed to a battle that has not finished. */
  locked: boolean;
  activeBattleCount: number;
  primaryBattleRoute: Href | null;
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
  const [activeBattleCount, setActiveBattleCount] = useState(0);
  const [primaryBattleRoute, setPrimaryBattleRoute] = useState<Href | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!characterId) {
      setLocked(false);
      setActiveBattleCount(0);
      setPrimaryBattleRoute(null);
      setLoading(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('battles')
        .select('*, rounds:battle_rounds(*)')
        .or(
          `player_one_character_id.eq.${characterId},player_two_character_id.eq.${characterId}`,
        )
        .not('status', 'in', `(${FINAL_BATTLE_STATUSES.join(',')})`)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const active = sortBattlesForList(
        (data ?? []) as unknown as BattleListRow[],
        user?.id,
      );
      setLocked(active.length > 0);
      setActiveBattleCount(active.length);
      setPrimaryBattleRoute(
        active[0] ? battleRouteFor(active[0], user?.id) : null,
      );
    } catch (err) {
      // Fail open. A false lock hides the whole screen behind a banner the
      // player cannot clear; the server still rejects any edit that shouldn't
      // land, so being wrong in this direction costs one error message.
      console.warn('Could not determine character edit lock', err);
      setLocked(false);
      setActiveBattleCount(0);
      setPrimaryBattleRoute(null);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!characterId) return;
    const channel = supabase
      .channel(`character-edit-lock:${characterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [characterId, refresh]);

  return {
    locked,
    activeBattleCount,
    primaryBattleRoute,
    loading,
    refresh,
  };
}
