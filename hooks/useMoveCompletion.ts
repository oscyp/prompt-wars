import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeMoveSuggestion,
  type MoveCompletionResult,
  type IntentHint,
  type ApproachHint,
} from '@/utils/battles';
import {
  composerHintsContext,
  type ComposerState,
} from '@/utils/promptComposer';

import type { ComposerEvent } from '@/utils/composerTelemetry';

type Target = 'intent' | 'approach';
interface Options {
  accountId?: string;
  battleId?: string;
  round: number;
  enabled: boolean;
  state: ComposerState;
  onEvent?: (event: ComposerEvent, choice?: 'free') => void;
  onHints: (
    target: Target,
    contextKey: string,
    hints: IntentHint[] | ApproachHint[],
  ) => void;
}

const operationScope = (o: Options) =>
  JSON.stringify([o.accountId, o.battleId, o.round, o.state.contextKey]);

/** Only explicit Next/retry starts adaptation; neither typing nor navigation back does. */
export function useMoveCompletion(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const scope = operationScope(options);
  const [display, setDisplay] = useState<{
    scope: string | null;
    key: string;
    target: Target;
    loading: boolean;
    error?: string;
  }>({ scope, key: '', target: 'intent', loading: false });
  const [quota, setQuota] = useState<{
    scope: string | null;
    remaining: number;
  } | null>(null);
  const cache = useRef(new Map<string, MoveCompletionResult>());
  const active = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const pendingTimers = timers.current;
    return () => {
      mounted.current = false;
      pendingTimers.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    cache.current.clear();
    active.current.clear();
    const pendingTimers = timers.current;
    return () => {
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, [scope]);

  const request = useCallback(async (target: Target) => {
    const start = latest.current;
    if (!start.enabled || !start.battleId || !start.state.moveType) return;
    const key = composerHintsContext(start.state, target);
    const operationKey = JSON.stringify([operationScope(start), key]);
    const current = () =>
      mounted.current &&
      latest.current.enabled &&
      operationScope(latest.current) === operationScope(start);
    const deliver = (result: MoveCompletionResult) => {
      if (!current()) return;
      if (result.remainingAdaptations !== undefined)
        setQuota({
          scope: operationScope(start),
          remaining: result.remainingAdaptations,
        });
      if (result.status === 'ready') {
        if (!cache.current.has(operationKey))
          latest.current.onEvent?.('composer_adaptation_ready', 'free');
        cache.current.set(operationKey, result);
        const hints =
          target === 'intent' ? result.intentHints : result.approachHints;
        if (
          hints?.length === 3 &&
          composerHintsContext(latest.current.state, target) === key
        )
          latest.current.onHints(target, key, hints);
      }
      if (result.status === 'failed')
        latest.current.onEvent?.('composer_adaptation_failed', 'free');
      if (composerHintsContext(latest.current.state, target) !== key) return;
      setDisplay({
        scope: operationScope(start),
        key,
        target,
        loading: result.status === 'pending',
        ...(result.status === 'failed'
          ? { error: result.error ?? 'unavailable' }
          : {}),
      });
    };
    const saved = cache.current.get(operationKey);
    if (saved) {
      deliver(saved);
      return;
    }
    if (active.current.has(operationKey)) return;
    active.current.add(operationKey);
    setDisplay({ scope: operationScope(start), key, target, loading: true });
    const started = Date.now();
    const run = async (): Promise<void> => {
      if (!current()) {
        active.current.delete(operationKey);
        return;
      }
      try {
        const result = await completeMoveSuggestion(
          start.battleId!,
          start.round,
          start.state.moveType!,
          target,
          start.state.actionText,
          start.state.intentText,
        );
        if (!current()) {
          active.current.delete(operationKey);
          return;
        }
        deliver(result);
        if (result.status === 'pending' && Date.now() - started < 120_000) {
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            void run();
          }, 1500);
          timers.current.add(timer);
          return;
        }
        if (result.status === 'pending')
          setDisplay({
            scope: operationScope(start),
            key,
            target,
            loading: false,
            error: 'taking_longer',
          });
      } catch (error) {
        if (current()) {
          const code = (error as { body?: { error?: { code?: string } } }).body
            ?.error?.code;
          if (code === 'adaptation_limit_reached')
            setQuota({ scope: operationScope(start), remaining: 0 });
          setDisplay({
            scope: operationScope(start),
            key,
            target,
            loading: false,
            error: code ?? 'unavailable',
          });
        }
      }
      active.current.delete(operationKey);
    };
    await run();
  }, []);
  const relevant =
    display.scope === scope &&
    display.key === composerHintsContext(options.state, display.target);
  return {
    request,
    target: display.target,
    loading: relevant && display.loading,
    error: relevant ? display.error : undefined,
    remaining: quota?.scope === scope ? quota.remaining : null,
  };
}
