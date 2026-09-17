import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { readBattleAppeal, type AppealAvailability } from '@/utils/appeals';
export function useBattleAppeal(
  battleId: string | null,
  userId: string | null,
  onChange?: () => unknown,
) {
  const [data, setData] = useState<AppealAvailability | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const scope = useRef('');
  scope.current = `${userId}:${battleId}`;
  const sequence = useRef(0);
  const changed = useRef(onChange);
  changed.current = onChange;
  const refresh = useCallback(
    async (action: 'status' | 'submit' = 'status') => {
      if (!battleId || !userId) return;
      const key = `${userId}:${battleId}`,
        request = ++sequence.current;
      setLoading(true);
      try {
        const next = await readBattleAppeal(battleId, action);
        if (scope.current === key && sequence.current === request) {
          setData(next);
          setError(null);
          if (
            ['upheld', 'overturned', 'no_contest'].includes(
              next.appeal?.review_status ?? '',
            )
          )
            changed.current?.();
        }
      } catch (e) {
        if (scope.current === key && sequence.current === request)
          setError(
            e instanceof Error ? e.message : 'Could not load appeal status.',
          );
      } finally {
        if (scope.current === key && sequence.current === request)
          setLoading(false);
      }
    },
    [battleId, userId],
  );
  useEffect(() => {
    setData(null);
    setError(null);
    if (!battleId || !userId) return;
    const channel = supabase
      .channel(`appeal:${userId}:${battleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appeals',
          filter: `battle_id=eq.${battleId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    const invalidate = () => {
      sequence.current++;
    };
    return () => {
      invalidate();
      void supabase.removeChannel(channel);
      app.remove();
    };
  }, [battleId, userId, refresh]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return {
    data,
    loading,
    error,
    refresh: () => refresh(),
    submit: () => refresh('submit'),
  };
}
