import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  checkPortraitOperation,
  dismissPortraitOperation,
  readPortraitOperation,
  startPortraitOperation,
  type PaidPortraitMode,
  type PortraitOperation,
  type PortraitOperationContext,
  type PortraitOperationOutcome,
} from '@/utils/portraitOperations';
import type { PortraitJobResult } from '@/utils/characters';

interface RecoveryState {
  scope: object;
  operation: PortraitOperation | null;
  result: PortraitJobResult | null;
  loading: boolean;
  checking: boolean;
  dispatching: boolean;
  error: string | null;
}
const blank = (scope: object): RecoveryState => ({
  scope,
  operation: null,
  result: null,
  loading: true,
  checking: false,
  dispatching: false,
  error: null,
});
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Could not check your render. Try again.';

/** Durable paid-render recovery. Focus/resume and Check status only read existing work. */
export function usePortraitOperationRecovery(
  accountId: string | null,
  characterId: string | null,
) {
  const identity = `${accountId ?? ''}:${characterId ?? ''}`;
  const scope = useRef({ identity });
  if (scope.current.identity !== identity) scope.current = { identity };
  const currentScope = scope.current;
  const mounted = useRef(true);
  const busy = useRef<object | null>(null);
  const refreshVersion = useRef(0);
  const [stored, setStored] = useState(() => blank(currentScope));
  const state = stored.scope === currentScope ? stored : blank(currentScope);
  const isCurrent = useCallback(
    () => mounted.current && scope.current === currentScope,
    [currentScope],
  );
  const patch = useCallback(
    (update: Partial<RecoveryState>) => {
      if (!isCurrent()) return;
      setStored((previous) => ({
        ...(previous.scope === currentScope ? previous : blank(currentScope)),
        ...update,
      }));
    },
    [currentScope, isCurrent],
  );
  const accept = useCallback(
    (outcome: PortraitOperationOutcome) => {
      patch({
        operation: outcome.operation,
        result: outcome.result,
        error: outcome.error,
      });
    },
    [patch],
  );

  const refresh =
    useCallback(async (): Promise<PortraitOperationOutcome | null> => {
      if (!isCurrent() || busy.current === currentScope) return null;
      const version = ++refreshVersion.current;
      patch({ loading: true });
      try {
        if (!accountId || !characterId) {
          patch({ operation: null, result: null, error: null });
          return null;
        }
        const operation = await readPortraitOperation(accountId, characterId);
        if (!isCurrent() || version !== refreshVersion.current) return null;
        // Preserve the identity even when the following network read fails.
        patch({ operation, result: null, error: null });
        if (!operation) return null;
        const outcome = await checkPortraitOperation(operation);
        if (!isCurrent() || version !== refreshVersion.current) return null;
        accept(outcome);
        return outcome;
      } catch (error) {
        if (version === refreshVersion.current)
          patch({ error: message(error) });
        return null;
      } finally {
        if (version === refreshVersion.current) patch({ loading: false });
      }
    }, [accountId, characterId, currentScope, isCurrent, patch, accept]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const start = useCallback(
    async (
      mode: PaidPortraitMode,
      context: PortraitOperationContext = {},
    ): Promise<PortraitOperationOutcome | null> => {
      if (
        !isCurrent() ||
        !accountId ||
        !characterId ||
        busy.current === currentScope ||
        state.loading ||
        state.operation ||
        state.error
      )
        return null;
      busy.current = currentScope;
      ++refreshVersion.current;
      patch({ dispatching: true, error: null });
      try {
        const outcome = await startPortraitOperation(
          accountId,
          characterId,
          mode,
          context,
        );
        if (!isCurrent()) return null;
        accept(outcome);
        return outcome;
      } catch (error) {
        patch({ error: message(error) });
        return null;
      } finally {
        if (busy.current === currentScope) busy.current = null;
        patch({ dispatching: false });
      }
    },
    [
      accountId,
      characterId,
      currentScope,
      isCurrent,
      state.loading,
      state.operation,
      state.error,
      patch,
      accept,
    ],
  );

  const checkStatus =
    useCallback(async (): Promise<PortraitOperationOutcome | null> => {
      if (!isCurrent() || busy.current === currentScope) return null;
      if (!state.operation) return refresh();
      busy.current = currentScope;
      ++refreshVersion.current;
      patch({ checking: true, error: null });
      try {
        const outcome = await checkPortraitOperation(state.operation);
        if (!isCurrent()) return null;
        accept(outcome);
        return outcome;
      } catch (error) {
        patch({ error: message(error) });
        return null;
      } finally {
        if (busy.current === currentScope) busy.current = null;
        patch({ checking: false, loading: false });
      }
    }, [currentScope, isCurrent, state.operation, refresh, patch, accept]);

  const dismiss = useCallback(async () => {
    if (
      !isCurrent() ||
      busy.current === currentScope ||
      !state.operation ||
      state.operation.status === 'pending'
    )
      return false;
    busy.current = currentScope;
    ++refreshVersion.current;
    try {
      const cleared = await dismissPortraitOperation(state.operation);
      if (cleared)
        patch({ operation: null, result: null, error: null, loading: false });
      return isCurrent() && cleared;
    } catch (error) {
      patch({ error: message(error) });
      return false;
    } finally {
      if (busy.current === currentScope) busy.current = null;
    }
  }, [currentScope, isCurrent, state.operation, patch]);

  return {
    operation: state.operation,
    result: state.result,
    loading: state.loading,
    checking: state.checking,
    dispatching: state.dispatching,
    error: state.error,
    blocked:
      !accountId ||
      !characterId ||
      state.loading ||
      state.checking ||
      state.dispatching ||
      !!state.operation ||
      !!state.error,
    start,
    checkStatus,
    dismiss,
    refresh,
  };
}
