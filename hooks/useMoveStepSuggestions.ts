import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  moveStepContextKey,
  MoveStepRequestError,
  rerollMoveStepSuggestions,
  type MoveStepContext,
  type MoveStepRequest,
  type MoveStepResult,
} from '@/utils/moveStepSuggestions';

interface Options {
  accountId: string | undefined;
  battleId: string | undefined;
  round: number;
  enabled: boolean;
  canPurchase: boolean;
  context: MoveStepContext | null;
}
type Purchase = Pick<MoveStepRequest, 'idempotencyKey' | 'expectedCredits'>;
interface Entry {
  context: MoveStepContext;
  purchase: Purchase | null;
  hints: MoveStepResult | null;
  incoming: MoveStepResult | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
}
interface Runtime {
  scope: string;
  journalKey: string;
  entries: Record<string, Entry>;
  ready: boolean;
  storageError: string | null;
  disposed: boolean;
  readVersion: number;
  busy: Set<string>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  started: Map<string, number>;
  writes: Promise<void>;
}
const NO_RESERVATION = new Set([
  'price_changed',
  'insufficient_credits',
  'purchase_confirmation_required',
  'round_not_open',
  'prompt_locked',
  'generation_disabled',
  'rerolls_disabled',
  'price_unavailable',
  'rate_limited',
  'bad_request',
]);
const STORAGE_ERROR =
  'Couldn’t save or check your previous request storage. Retry storage before requesting more choices.';
const RECOVERY_ERROR =
  'Couldn’t confirm this request. Check its status before requesting another set.';
const WAIT_ERROR =
  'This request is taking longer. Check its status to recover the same purchase.';
function newRuntime(scope: string): Runtime {
  return {
    scope,
    journalKey: `prompt-step-purchases:v1:${scope}`,
    entries: {},
    ready: false,
    storageError: null,
    disposed: false,
    readVersion: 0,
    busy: new Set(),
    timers: new Map(),
    started: new Map(),
    writes: Promise.resolve(),
  };
}
function newEntry(context: MoveStepContext): Entry {
  return {
    context,
    purchase: null,
    hints: null,
    incoming: null,
    loading: false,
    error: null,
    errorCode: null,
  };
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function readResult(
  value: unknown,
  target: MoveStepContext['target'],
): MoveStepResult | null {
  if (value === null) return null;
  const row = object(value);
  if (
    !row ||
    row.status !== 'ready' ||
    row.target !== target ||
    typeof row.operationId !== 'string' ||
    typeof row.contextKey !== 'string' ||
    typeof row.creditsSpent !== 'number' ||
    ![0, 1].includes(row.creditsSpent) ||
    typeof row.refunded !== 'boolean'
  )
    throw new Error('Invalid stored delivery');
  const validHints = (hints: unknown, children: boolean): boolean =>
    Array.isArray(hints) &&
    hints.length === 3 &&
    hints.every((hint) => {
      const item = object(hint);
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.text === 'string' &&
        (!children || validHints(item.approachHints, false))
      );
    });
  if (
    !validHints(
      target === 'intent' ? row.intentHints : row.approachHints,
      target === 'intent',
    )
  )
    throw new Error('Incomplete stored delivery');
  return value as MoveStepResult;
}
function readEntries(
  raw: string | null,
  battleId: string,
  round: number,
): Record<string, Entry> {
  if (!raw) return {};
  const journal = object(JSON.parse(raw));
  const rows = object(journal?.entries);
  if (journal?.version !== 1 || !rows)
    throw new Error('Unreadable purchase journal');
  const entries: Record<string, Entry> = {};
  for (const [key, value] of Object.entries(rows)) {
    const row = object(value);
    const context = object(row?.context);
    const purchase = row?.purchase === null ? null : object(row?.purchase);
    if (
      !row ||
      !context ||
      context.battleId !== battleId ||
      context.roundNumber !== round ||
      !['attack', 'defense', 'finisher'].includes(String(context.moveType)) ||
      !['intent', 'approach'].includes(String(context.target)) ||
      typeof context.actionText !== 'string' ||
      (context.target === 'approach' &&
        typeof context.intentText !== 'string') ||
      (row.purchase !== null &&
        (!purchase ||
          typeof purchase.idempotencyKey !== 'string' ||
          !purchase.idempotencyKey ||
          typeof purchase.expectedCredits !== 'number' ||
          ![0, 1].includes(purchase.expectedCredits)))
    )
      throw new Error('Invalid purchase context');
    const parent = context as unknown as MoveStepContext;
    if (key !== moveStepContextKey(parent))
      throw new Error('Mismatched purchase context');
    entries[key] = {
      ...newEntry(parent),
      purchase: purchase as Purchase | null,
      hints: readResult(row.hints, parent.target),
      incoming: readResult(row.incoming, parent.target),
    };
  }
  return entries;
}

/** One round journal keeps every parent purchase recoverable as the visible step changes. */
export function useMoveStepSuggestions(options: Options) {
  const { accountId, battleId, round, enabled, context } = options;
  const scope = JSON.stringify([accountId, battleId, round]);
  const runtimeRef = useRef<Runtime>(newRuntime(scope));
  if (runtimeRef.current.scope !== scope)
    runtimeRef.current = newRuntime(scope);
  const runtime = runtimeRef.current;
  const [, render] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const contextKey = context ? moveStepContextKey(context) : null;
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;
  const live = useCallback(
    (target: Runtime) =>
      runtimeRef.current === target &&
      !target.disposed &&
      optionsRef.current.enabled,
    [],
  );
  const notify = useCallback(
    (target: Runtime) => {
      if (live(target)) render((value) => value + 1);
    },
    [live],
  );
  const persist = useCallback(
    async (
      target: Runtime,
      applying?: { key: string; result: MoveStepResult },
    ): Promise<boolean> => {
      // Take each snapshot when its serialized write starts. Applying a delivered
      // set commits inside that write, before another parent's write can start.
      const write = target.writes
        .catch(() => {})
        .then(async () => {
          const entries = Object.fromEntries(
            Object.entries(target.entries).map(([key, entry]) => [
              key,
              {
                context: entry.context,
                purchase: entry.purchase,
                hints: applying?.key === key ? applying.result : entry.hints,
                incoming: applying?.key === key ? null : entry.incoming,
              },
            ]),
          );
          await AsyncStorage.setItem(
            target.journalKey,
            JSON.stringify({ version: 1, entries }),
          );
          if (applying) {
            const entry = target.entries[applying.key];
            if (entry?.incoming === applying.result) {
              entry.hints = applying.result;
              entry.incoming = null;
            }
          }
        });
      target.writes = write;
      try {
        await write;
        return true;
      } catch {
        target.ready = false;
        target.storageError = STORAGE_ERROR;
        notify(target);
        return false;
      }
    },
    [notify],
  );
  const executeRef = useRef<
    (target: Runtime, key: string, saveFirst?: boolean) => Promise<void>
  >(async () => {});
  const execute = useCallback(
    async (target: Runtime, key: string, saveFirst = false): Promise<void> => {
      const entry = target.entries[key];
      if (!live(target) || !entry?.purchase || target.busy.has(key)) return;
      const purchase = entry.purchase;
      target.busy.add(key);
      entry.loading = true;
      entry.error = null;
      entry.errorCode = null;
      const timer = target.timers.get(key);
      if (timer) clearTimeout(timer);
      target.timers.delete(key);
      if (!target.started.has(key)) target.started.set(key, Date.now());
      notify(target);
      try {
        if (saveFirst && !(await persist(target))) return;
        if (!live(target)) return;
        const result = await rerollMoveStepSuggestions({
          ...entry.context,
          ...purchase,
        });
        if (!live(target) || entry.purchase !== purchase) return;
        if (result.status === 'pending') {
          if (Date.now() - target.started.get(key)! < 120_000) {
            target.timers.set(
              key,
              setTimeout(() => {
                void executeRef.current(target, key);
              }, 1500),
            );
          } else {
            entry.loading = false;
            entry.error = WAIT_ERROR;
          }
        } else {
          entry.purchase = null;
          entry.loading = false;
          target.started.delete(key);
          if (result.status === 'ready') entry.incoming = result;
          else {
            entry.errorCode = result.error ?? 'generation_failed';
            entry.error = result.refunded
              ? 'These choices could not be delivered. Your credit was refunded.'
              : 'These choices could not be delivered. Your previous choices are kept.';
          }
          await persist(target);
        }
      } catch (error) {
        if (!live(target)) return;
        const code = error instanceof MoveStepRequestError ? error.code : null;
        entry.errorCode = code;
        entry.error =
          error instanceof MoveStepRequestError
            ? error.message
            : RECOVERY_ERROR;
        if (code && NO_RESERVATION.has(code)) {
          entry.purchase = null;
          target.started.delete(key);
          await persist(target);
        }
        entry.loading = false;
      } finally {
        target.busy.delete(key);
        if (!target.timers.has(key)) entry.loading = false;
        notify(target);
      }
    },
    [live, notify, persist],
  );
  executeRef.current = execute;
  const readJournal = useCallback(async (): Promise<void> => {
    if (!live(runtime) || !accountId || !battleId || runtime.busy.size) return;
    const version = ++runtime.readVersion;
    runtime.ready = false;
    runtime.storageError = null;
    notify(runtime);
    try {
      await runtime.writes.catch(() => {});
      const raw = await AsyncStorage.getItem(runtime.journalKey);
      if (!live(runtime) || version !== runtime.readVersion) return;
      runtime.entries = readEntries(raw, battleId, round);
      runtime.ready = true;
      notify(runtime);
      for (const [key, entry] of Object.entries(runtime.entries)) {
        if (entry.purchase) void executeRef.current(runtime, key);
      }
    } catch {
      if (live(runtime) && version === runtime.readVersion) {
        runtime.storageError = STORAGE_ERROR;
        runtime.ready = false;
        notify(runtime);
      }
    }
  }, [runtime, accountId, battleId, round, live, notify]);
  useEffect(() => {
    runtime.disposed = false;
    if (enabled) void readJournal();
    return () => {
      runtime.disposed = true;
      runtime.readVersion += 1;
      for (const timer of runtime.timers.values()) clearTimeout(timer);
      runtime.timers.clear();
    };
  }, [runtime, enabled, readJournal]);
  const reroll = useCallback(
    async (expectedCredits: number | null): Promise<void> => {
      if (
        !live(runtime) ||
        !optionsRef.current.canPurchase ||
        !accountId ||
        !battleId ||
        !runtime.ready ||
        !context ||
        contextKeyRef.current !== contextKey ||
        context.battleId !== battleId ||
        context.roundNumber !== round ||
        expectedCredits === null ||
        ![0, 1].includes(expectedCredits) ||
        !contextKey
      )
        return;
      const entry = runtime.entries[contextKey] ?? newEntry(context);
      if (entry.purchase || entry.incoming || runtime.busy.has(contextKey))
        return;
      runtime.entries[contextKey] = entry;
      entry.purchase = { idempotencyKey: randomUUID(), expectedCredits };
      runtime.started.delete(contextKey);
      await execute(runtime, contextKey, true);
    },
    [runtime, accountId, battleId, round, context, contextKey, live, execute],
  );
  const retryPurchase = useCallback(async (): Promise<void> => {
    if (
      !live(runtime) ||
      !runtime.ready ||
      !contextKey ||
      contextKeyRef.current !== contextKey ||
      runtime.busy.has(contextKey)
    )
      return;
    runtime.started.delete(contextKey);
    await execute(runtime, contextKey);
  }, [runtime, contextKey, live, execute]);
  const applyIncoming =
    useCallback(async (): Promise<MoveStepResult | null> => {
      if (
        !live(runtime) ||
        !runtime.ready ||
        !contextKey ||
        contextKeyRef.current !== contextKey
      )
        return null;
      const entry = runtime.entries[contextKey];
      if (!entry?.incoming || runtime.busy.has(contextKey)) return null;
      const next = entry.incoming;
      runtime.busy.add(contextKey);
      const saved = await persist(runtime, { key: contextKey, result: next });
      runtime.busy.delete(contextKey);
      notify(runtime);
      return saved && live(runtime) && contextKeyRef.current === contextKey
        ? next
        : null;
    }, [runtime, contextKey, live, notify, persist]);
  const current = contextKey ? runtime.entries[contextKey] : undefined;
  return {
    hints: current?.hints ?? null,
    incoming: current?.incoming ?? null,
    loading: current?.loading ?? false,
    error: runtime.storageError ?? current?.error ?? null,
    errorCode: current?.errorCode ?? null,
    purchase: current?.purchase ?? null,
    journalReady: runtime.ready,
    reroll,
    retryPurchase,
    retryStorage: readJournal,
    applyIncoming,
  };
}
