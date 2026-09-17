import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import {
  battleAttentionCount,
  readBattleResults,
  subscribeBattleResultRead,
} from '@/utils/battleAttention';
import type { BattleListRow } from '@/utils/battleLists';
export function useBattleAttention() {
  const { user } = useAuth();
  const path = usePathname();
  const [count, setCount] = useState<number | undefined>();
  const countAccount = useRef<string | undefined>(undefined);
  useEffect(() => {
    const accountId = user?.id;
    if (countAccount.current !== accountId) {
      countAccount.current = accountId;
      setCount(undefined);
    }
    if (!accountId) {
      setCount(undefined);
      return;
    }
    let active = true;
    let run = 0;
    const refresh = async () => {
      const request = ++run;
      try {
        const read = await readBattleResults(accountId);
        const rows: BattleListRow[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase
            .from('battles')
            .select(
              'id,status,created_at,player_one_id,player_two_id,is_player_two_bot,is_draw,winner_id,adjudication_revision,current_round,player_one_locked_at,player_two_locked_at,rounds:battle_rounds(round_number,player_one_locked_at,player_two_locked_at)',
            )
            .or(`player_one_id.eq.${accountId},player_two_id.eq.${accountId}`)
            .order('id')
            .range(offset, offset + 499);
          if (error) throw error;
          rows.push(...((data ?? []) as unknown as BattleListRow[]));
          if (!active || request !== run) return;
          if (!data || data.length < 500) break;
        }
        if (active && request === run)
          setCount(battleAttentionCount(rows, accountId, read) || undefined);
      } catch {
        /* Keep the last known badge on a failed refresh. */
      }
    };
    void refresh();
    const unsubscribe = subscribeBattleResultRead(() => void refresh());
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const channel = supabase
      .channel(`battle-attention:${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battle_rounds' },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      active = false;
      unsubscribe();
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  }, [user?.id, path]);
  return countAccount.current === user?.id ? count : undefined;
}
