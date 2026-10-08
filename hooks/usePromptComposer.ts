import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  composerReducer,
  createComposerState,
  type AuthoringMode,
  type BuilderChange,
  type IntentHint,
  type ApproachHint,
  type ComposerDraftSnapshot,
} from '@/utils/promptComposer';

export function usePromptComposer(
  accountId: string | undefined,
  scope: string,
) {
  const [state, dispatch] = useReducer(composerReducer, undefined, () =>
    createComposerState(),
  );
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [preference, setPreference] = useState<{
    account: string;
    mode: AuthoringMode | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (!accountId) return;
    Promise.resolve(
      AsyncStorage.getItem(
        `prompt-authoring-mode:${encodeURIComponent(accountId)}`,
      ),
    )
      .then((mode) => {
        if (active)
          setPreference({
            account: accountId,
            mode: mode === 'build' || mode === 'write' ? mode : null,
          });
      })
      .catch(() => {
        if (active) setPreference({ account: accountId, mode: null });
      });
    return () => {
      active = false;
    };
  }, [accountId]);
  const setMode = useCallback(
    (mode: AuthoringMode) => {
      dispatch({ type: 'mode', mode });
      if (accountId) {
        setPreference({ account: accountId, mode });
        void Promise.resolve(
          AsyncStorage.setItem(
            `prompt-authoring-mode:${encodeURIComponent(accountId)}`,
            mode,
          ),
        ).catch(() => {});
      }
    },
    [accountId],
  );
  const restore = useCallback(
    (snapshot: ComposerDraftSnapshot) =>
      dispatch({ type: 'restore', snapshot }),
    [],
  );
  const edit = useCallback(
    (text: string) => dispatch({ type: 'edit', text }),
    [],
  );
  const change = useCallback(
    (value: BuilderChange) => dispatch({ type: 'change', change: value }),
    [],
  );
  const confirm = useCallback(() => {
    if (scopeRef.current === scope) dispatch({ type: 'confirm' });
  }, [scope]);
  const selectApproach = useCallback(
    (hint: ApproachHint) =>
      dispatch({
        type: 'change',
        change: { type: 'approach', id: hint.id, text: hint.text },
      }),
    [],
  );
  const setApproach = useCallback(
    (text: string) =>
      dispatch({
        type: 'change',
        change: { type: 'approach', id: null, text },
      }),
    [],
  );
  const confirmFragment = useCallback(
    (field: 'intent' | 'approach') =>
      dispatch({ type: 'confirm-fragment', field }),
    [],
  );
  const updateHints = useCallback(
    (
      target: 'intent' | 'approach',
      contextKey: string,
      hints: IntentHint[],
    ) => {
      if (scopeRef.current === scope)
        dispatch({ type: 'hints', target, contextKey, hints });
    },
    [scope],
  );
  return {
    selectApproach,
    setApproach,
    confirmFragment,
    updateHints,
    state,
    dispatch,
    setMode,
    restore,
    edit,
    change,
    confirm,
    preferredMode:
      preference && preference.account === accountId ? preference.mode : null,
    preferenceReady: !accountId || preference?.account === accountId,
  };
}
