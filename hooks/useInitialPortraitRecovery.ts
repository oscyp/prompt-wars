import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  readInitialPortraitRecovery,
  reconcileInitialPortrait,
  type InitialPortraitRecovery,
} from '@/utils/characters';

/** Shared editor action guard: recover outstanding initial work before any new paid/free render. */
export function useInitialPortraitRecovery(
  characterId: string | null,
  onSettled: () => unknown,
) {
  const [request, setRequest] = useState<InitialPortraitRecovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const scope = useRef(characterId);
  scope.current = characterId;
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (!characterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await readInitialPortraitRecovery(characterId);
      if (scope.current === characterId) {
        setRequest(next);
        setError(null);
      }
    } catch (e) {
      if (scope.current === characterId)
        setError(e instanceof Error ? e.message : 'Could not check render.');
    } finally {
      if (scope.current === characterId) setLoading(false);
    }
  }, [characterId]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    setRequest(null);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const runOrRecover = useCallback(
    async (action: () => unknown) => {
      if (busy.current || loading || !characterId) return;
      if (error && !request) {
        await refresh();
        return;
      }
      if (!request) {
        await action();
        return;
      }
      busy.current = true;
      setChecking(true);
      try {
        const next = await reconcileInitialPortrait(
          characterId,
          request.requestId,
        );
        if (scope.current !== characterId) return;
        if (!next || next.status !== 'reserved') {
          await settled.current();
          const outstanding = await readInitialPortraitRecovery(characterId);
          if (scope.current === characterId) setRequest(outstanding);
        } else setRequest(next);
        setError(null);
      } catch (e) {
        if (scope.current === characterId)
          setError(e instanceof Error ? e.message : 'Could not check render.');
      } finally {
        busy.current = false;
        if (scope.current === characterId) setChecking(false);
      }
    },
    [characterId, request, loading, error, refresh],
  );
  return {
    request,
    loading,
    checking,
    error,
    blocked: loading || checking || !!request || !!error,
    refresh,
    runOrRecover,
  };
}
