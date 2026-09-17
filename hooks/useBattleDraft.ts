import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { battleDrafts, type BattleDraft } from '@/utils/battleDrafts';

export function useBattleDraft(
  accountId: string | undefined,
  battleId: string | undefined,
  round: number,
) {
  const scope = useMemo(
    () => (accountId && battleId ? { accountId, battleId, round } : null),
    [accountId, battleId, round],
  );
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<BattleDraft | null>(null);
  const [loadedScope, setLoadedScope] = useState<typeof scope>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<BattleDraft | null>(null);
  const cleared = useRef(false);
  const pendingDelete = useRef(false);
  useEffect(() => {
    let active = true;
    latest.current = null;
    cleared.current = false;
    pendingDelete.current = false;
    setDraft(null);
    setError(null);
    if (!scope) return;
    battleDrafts
      .read(scope)
      .then((value) => {
        if (!active) return;
        latest.current = value;
        setDraft(value);
        setLoadedScope(scope);
      })
      .catch(() => {
        if (active) {
          setError('Couldn’t restore your saved draft. Retry before writing.');
          setLoadedScope(null);
        }
      });
    return () => {
      active = false;
    };
  }, [scope, reload]);
  const save = useCallback(
    async (value: BattleDraft) => {
      if (!scope || loadedScope !== scope || cleared.current) return;
      latest.current = value;
      try {
        if (pendingDelete.current) {
          await battleDrafts.clear(scope);
          pendingDelete.current = false;
        }
        await battleDrafts.save(scope, value);
        setError(null);
      } catch {
        setError(
          'Draft is not saved on this device. Keep this screen open and retry.',
        );
      }
    },
    [scope, loadedScope],
  );
  const flush = useCallback(async () => {
    if (!scope) return;
    if (pendingDelete.current) {
      try {
        await battleDrafts.clear(scope);
        pendingDelete.current = false;
        setDraft(null);
        setError(null);
      } catch {
        setError(
          'Couldn’t remove the saved draft. Retry to finish deleting it.',
        );
        throw new Error('Draft could not be removed');
      }
    }
    if (cleared.current) return;
    if (loadedScope !== scope) throw new Error('Draft is still loading');
    try {
      if (latest.current) await battleDrafts.save(scope, latest.current);
      await battleDrafts.flush(scope);
      setError(null);
    } catch {
      setError(
        'Draft is not saved on this device. Keep this screen open and retry.',
      );
      throw new Error('Draft could not be saved');
    }
  }, [scope, loadedScope]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush().catch(() => {});
    });
    return () => subscription.remove();
  }, [flush]);
  const clear = useCallback(
    async (terminal = true) => {
      if (!scope) return true;
      cleared.current = terminal;
      pendingDelete.current = true;
      latest.current = null;
      try {
        await battleDrafts.clear(scope);
        pendingDelete.current = false;
        setDraft(null);
        setError(null);
        return true;
      } catch {
        setError(
          'Couldn’t remove the saved draft. Retry to finish deleting it.',
        );
        return false;
      }
    },
    [scope],
  );
  return {
    draft,
    ready: Boolean(scope && loadedScope === scope),
    error,
    save,
    flush,
    clear,
    retry: async () => {
      if (loadedScope === scope) {
        try {
          await flush();
          return true;
        } catch {
          return false;
        }
      }
      setReload((v) => v + 1);
      return false;
    },
  };
}
