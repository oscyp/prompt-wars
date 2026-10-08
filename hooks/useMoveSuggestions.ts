import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import type { ComposerEvent } from '@/utils/composerTelemetry';
import {
  generateMoveSuggestions,
  getMoveSuggestions,
  type MoveSuggestion,
  type MoveType,
} from '@/utils/battles';

interface Options {
  accountId: string | undefined;
  battleId: string | undefined;
  round: number;
  moveType: MoveType | null;
  situationId: string | undefined;
  enabled: boolean;
  fallback: MoveSuggestion[];
  structured?: boolean;
  autoRead?: boolean;
  compositionVersion?: 3;
  acceptImmediately?: () => boolean;
  onEvent?: (event: ComposerEvent, choice?: 'free' | 'paid') => void;
}
type Purchase = { idempotencyKey: string; expectedCredits: number };
interface State {
  scope: string;
  suggestions: MoveSuggestion[];
  incoming: MoveSuggestion[] | null;
  incomingIsPaid: boolean;
  incomingFromReroll: boolean;
  suggestionsIsPaid: boolean;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  purchase: Purchase | null;
  journalReady: boolean;
  compositionStatus?: 'pending' | 'ready' | 'failed';
  compositionError?: string | null;
}
const NO_RESERVATION_CODES = new Set([
  'price_changed',
  'insufficient_credits',
  'purchase_confirmation_required',
  'idempotency_conflict',
  'round_not_open',
  'prompt_locked',
  'generation_disabled',
  'rerolls_disabled',
  'price_unavailable',
  'rate_limited',
  'bad_request',
]);
function isStructured(suggestion: MoveSuggestion): boolean {
  return (
    suggestion.structureVersion === 2 &&
    Boolean(suggestion.id && suggestion.action) &&
    suggestion.intentHints?.length === 3 &&
    suggestion.intentHints.every((hint) => Boolean(hint.id && hint.text))
  );
}

/** An enrichment may append methods, but never rewrite a delivered purchase. */
function isSameBankEnrichment(
  previous: MoveSuggestion[] | null,
  next: MoveSuggestion[],
): boolean {
  return (
    previous?.length === 3 &&
    next.length === 3 &&
    previous.every((old, index) => {
      const incoming = next[index];
      return (
        Boolean(old.id) &&
        old.id === incoming.id &&
        old.action === incoming.action &&
        old.title === incoming.title &&
        old.body === incoming.body &&
        incoming.compositionVersion === 3 &&
        old.intentHints?.length === 3 &&
        incoming.intentHints?.length === 3 &&
        old.intentHints.every(
          (hint, i) =>
            hint.id === incoming.intentHints![i].id &&
            hint.text === incoming.intentHints![i].text &&
            incoming.intentHints![i].approachHints?.length === 3,
        )
      );
    })
  );
}

/** Free fallback is immediate. A remote set is staged until the player applies it. */
export function useMoveSuggestions(options: Options) {
  const {
    accountId,
    battleId,
    round,
    moveType,
    situationId,
    enabled,
    fallback,
    structured = true,
    autoRead = true,
  } = options;
  const scope = JSON.stringify([
    accountId,
    battleId,
    round,
    moveType,
    situationId,
  ]);
  const journalKey = `prompt-suggestion-purchase:${scope}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const immediateRef = useRef(options.acceptImmediately);
  immediateRef.current = options.acceptImmediately;
  const compositionRef = useRef(options.compositionVersion);
  compositionRef.current = options.compositionVersion;
  const eventRef = useRef(options.onEvent);
  eventRef.current = options.onEvent;
  const generation = useRef(0);
  const journalGeneration = useRef(0);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<State>(() => ({
    scope,
    suggestions: fallback,
    incoming: null,
    incomingIsPaid: false,
    incomingFromReroll: false,
    suggestionsIsPaid: false,
    loading: false,
    error: null,
    purchase: null,
    journalReady: false,
    errorCode: null,
  }));
  const current =
    state.scope === scope
      ? state
      : {
          scope,
          suggestions: fallback,
          incoming: null,
          incomingIsPaid: false,
          incomingFromReroll: false,
          suggestionsIsPaid: false,
          loading: false,
          error: null,
          purchase: null,
          journalReady: false,
          errorCode: null,
        };
  const stateRef = useRef(current);
  stateRef.current = current;
  const update = useCallback(
    (patch: Partial<State>) => {
      if (scopeRef.current === scope)
        setState((old) => (old.scope === scope ? { ...old, ...patch } : old));
    },
    [scope],
  );
  const readJournal = useCallback(async () => {
    if (!enabledRef.current || scopeRef.current !== scope) return;
    const run = ++journalGeneration.current;
    const valid = () =>
      journalGeneration.current === run &&
      scopeRef.current === scope &&
      enabledRef.current;
    try {
      const raw = await AsyncStorage.getItem(journalKey);
      if (!valid()) return;
      const value = raw ? JSON.parse(raw) : null;
      if (
        value &&
        (typeof value.idempotencyKey !== 'string' ||
          !Number.isFinite(value.expectedCredits) ||
          value.expectedCredits < 0)
      ) {
        throw new Error('Unreadable purchase journal');
      }
      update({
        purchase: value as Purchase | null,
        journalReady: true,
        error: null,
      });
    } catch {
      if (valid())
        update({
          error:
            'Couldn’t check your previous request. Retry request storage; free choices remain available.',
          journalReady: false,
        });
    }
  }, [scope, journalKey, update]);

  const loadFree = useCallback(async () => {
    if (
      !enabledRef.current ||
      !accountId ||
      !battleId ||
      !moveType ||
      scopeRef.current !== scope ||
      busy.current
    )
      return;
    const run = ++generation.current;
    const valid = () =>
      enabledRef.current &&
      generation.current === run &&
      scopeRef.current === scope;
    update({ loading: true, error: null, errorCode: null });
    const started = Date.now();
    const read = async (): Promise<void> => {
      try {
        const existing = await getMoveSuggestions(battleId, moveType, round);
        if (!valid()) return;
        if (existing.status === 'ready') {
          const usable = structured
            ? existing.suggestions.filter(isStructured)
            : existing.suggestions;
          update({
            incoming:
              usable.length === 3 || (!structured && usable.length)
                ? usable
                : null,
            loading: false,
            incomingIsPaid: existing.isPaid ?? false,
            incomingFromReroll: false,
          });
          if (usable.length)
            eventRef.current?.('composer_suggestions_generated');
          return;
        }
        if (existing.status === 'pending') {
          eventRef.current?.('composer_suggestions_pending');
          if (Date.now() - started >= 25_000) {
            update({
              loading: false,
              error:
                'More starters are taking longer. Your free choices are ready to use.',
            });
          } else
            timer.current = setTimeout(() => {
              void read();
            }, 1500);
          return;
        }
        const result = await generateMoveSuggestions(
          battleId,
          moveType,
          round,
          {
            operation: 'ensure_free',
            ...(compositionRef.current
              ? { compositionVersion: compositionRef.current }
              : {}),
          },
        );
        if (!valid()) return;
        if (result.status === 'pending') {
          eventRef.current?.('composer_suggestions_pending');
          if (Date.now() - started < 25_000)
            timer.current = setTimeout(() => {
              void read();
            }, 1500);
          else
            update({
              loading: false,
              error:
                'More starters are taking longer. Your free choices are ready to use.',
            });
          return;
        }
        const usable = structured
          ? result.set?.suggestions.filter(isStructured)
          : result.set?.suggestions;
        if (usable?.length)
          eventRef.current?.('composer_suggestions_generated', 'free');
        update({
          loading: false,
          incomingIsPaid: result.set?.isPaid ?? false,
          incomingFromReroll: false,
          incoming:
            usable?.length === 3 || (!structured && usable?.length)
              ? usable!
              : null,
          error: result.failure
            ? 'More starters are unavailable. You can keep building with these free choices.'
            : null,
        });
      } catch {
        if (valid())
          update({
            loading: false,
            error:
              'Couldn’t load more starters. Your free choices are still available.',
          });
      }
    };
    await read();
  }, [accountId, battleId, moveType, round, scope, update, structured]);

  useEffect(() => {
    busy.current = false;
    setState({
      scope,
      suggestions: fallbackRef.current,
      incoming: null,
      incomingIsPaid: false,
      incomingFromReroll: false,
      suggestionsIsPaid: false,
      loading: false,
      error: null,
      errorCode: null,
      purchase: null,
      journalReady: false,
    });
    if (enabled && accountId && battleId && moveType) {
      if (structured && fallbackRef.current.length)
        eventRef.current?.('composer_suggestions_fallback', 'free');
      void readJournal();
      if (autoRead) void loadFree();
    }
    return () => {
      journalGeneration.current += 1;
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [
    scope,
    enabled,
    accountId,
    battleId,
    moveType,
    loadFree,
    autoRead,
    structured,
    readJournal,
  ]);

  const purchase = useCallback(
    async (operation: Purchase) => {
      if (
        !enabledRef.current ||
        !battleId ||
        !moveType ||
        scopeRef.current !== scope ||
        busy.current
      )
        return;
      busy.current = true;
      const run = ++generation.current;
      const valid = () =>
        generation.current === run &&
        scopeRef.current === scope &&
        enabledRef.current;
      if (timer.current) clearTimeout(timer.current);
      update({
        loading: true,
        error: null,
        errorCode: null,
        compositionStatus: undefined,
        compositionError: null,
      });
      // Delivery settles the purchase. Its optional extension has a separate,
      // free recovery lifecycle, scoped to this exact delivered bank.
      const recoverComposition = (
        setId: string,
        original: MoveSuggestion[],
        isPaid: boolean,
      ) => {
        const started = Date.now();
        const fail = () => {
          if (valid())
            update({
              compositionStatus: 'failed',
              compositionError:
                'Approaches are unavailable. Your purchased ideas are kept. Choose another action or return to Face-off to write your own.',
            });
        };
        const recover = async (): Promise<void> => {
          if (!valid()) return;
          try {
            const extension = await generateMoveSuggestions(
              battleId,
              moveType,
              round,
              {
                operation: 'ensure_free',
                compositionVersion: 3,
                suggestionSetId: setId,
              },
            );
            if (!valid()) return;
            const rows = extension.set?.suggestions;
            if (
              extension.set?.id === setId &&
              rows &&
              isSameBankEnrichment(original, rows)
            ) {
              // Preserve the requested reroll's display behavior when its exact
              // bank receives approaches later; never rewrite selected prose.
              setState((old) => {
                const visible = old.incoming ?? old.suggestions;
                if (old.scope !== scope || !isSameBankEnrichment(visible, rows))
                  return old;
                return {
                  ...old,
                  incoming: rows,
                  incomingIsPaid: isPaid,
                  incomingFromReroll: true,
                  compositionStatus: 'ready',
                  compositionError: null,
                };
              });
              return;
            }
            if (
              (extension.compositionStatus === 'pending' ||
                extension.status === 'pending') &&
              Date.now() - started < 120_000
            ) {
              timer.current = setTimeout(() => {
                void recover();
              }, 1500);
            } else fail();
          } catch {
            fail();
          }
        };
        update({ compositionStatus: 'pending', compositionError: null });
        void recover();
      };
      try {
        // Write before the request: retry/restart must recover exactly this purchase.
        await AsyncStorage.setItem(journalKey, JSON.stringify(operation));
        if (!valid()) return;
        update({ purchase: operation });
        eventRef.current?.(
          'composer_suggestions_reroll',
          operation.expectedCredits > 0 ? 'paid' : 'free',
        );
        const result = await generateMoveSuggestions(
          battleId,
          moveType,
          round,
          {
            operation: 'reroll',
            ...operation,
            ...(compositionRef.current
              ? { compositionVersion: compositionRef.current }
              : {}),
          },
        );
        if (!valid()) return;
        const usable = structured
          ? result.set?.suggestions.filter(isStructured)
          : result.set?.suggestions;
        const accepted =
          usable && (usable.length === 3 || (!structured && usable.length > 0));
        if (result.set) {
          eventRef.current?.(
            'composer_suggestions_generated',
            result.set.isPaid ? 'paid' : 'free',
          );
          await AsyncStorage.removeItem(journalKey);
          if (!valid()) return;
          update({
            incoming: accepted ? usable : null,
            incomingIsPaid: result.set.isPaid,
            incomingFromReroll: Boolean(accepted),
            purchase: null,
            error: accepted
              ? null
              : 'These starters could not be used. Your previous choices are kept.',
          });
          if (accepted && compositionRef.current === 3) {
            if (isSameBankEnrichment(usable, usable))
              update({ compositionStatus: 'ready' });
            else recoverComposition(result.set.id, usable, result.set.isPaid);
          }
        } else if (result.status === 'pending') {
          // A blocked recovery can still own an earlier debit. Its durable
          // operation status takes precedence over the temporary error code.
          update({
            errorCode: result.code ?? null,
            error:
              'This request is still pending. Check its status to recover the same purchase.',
          });
        } else if (
          result.failure === 'insufficient_credits' ||
          result.failure === 'rate_limited' ||
          result.status === 'failed' ||
          (result.code && NO_RESERVATION_CODES.has(result.code))
        ) {
          await AsyncStorage.removeItem(journalKey);
          update({
            purchase: null,
            errorCode: result.code ?? null,
            error:
              result.status === 'failed'
                ? 'These starters could not be delivered. Any charge was refunded.'
                : result.code === 'price_changed'
                  ? 'The price changed. Review the current price before requesting another set.'
                  : result.failure === 'insufficient_credits'
                    ? 'Not enough credits for another AI set. Your free choices are still ready.'
                    : 'This request is unavailable. Your free choices are still ready.',
          });
        } else {
          update({
            error:
              'This request is not confirmed yet. Check its status before requesting another set.',
          });
        }
      } catch {
        if (valid())
          update({
            error:
              'Couldn’t confirm your request. Check its status before requesting another set.',
          });
      } finally {
        if (valid()) {
          busy.current = false;
          update({ loading: false });
        }
      }
    },
    [battleId, moveType, round, scope, journalKey, update, structured],
  );
  const stageIncoming = useCallback(
    (suggestions: MoveSuggestion[], isPaid = false) => {
      const sameIncomingUpgrade =
        isPaid &&
        stateRef.current.incomingIsPaid &&
        isSameBankEnrichment(stateRef.current.incoming, suggestions);
      if (
        busy.current ||
        stateRef.current.purchase ||
        (stateRef.current.incomingIsPaid && !sameIncomingUpgrade) ||
        (stateRef.current.suggestionsIsPaid && !isPaid)
      )
        return;
      const usable = structured
        ? suggestions.filter(isStructured)
        : suggestions;
      if (usable.length === 3 || (!structured && usable.length))
        update({
          ...(immediateRef.current?.()
            ? {
                suggestions: usable,
                suggestionsIsPaid: isPaid,
                incoming: null,
                incomingIsPaid: false,
                incomingFromReroll: false,
              }
            : {
                incoming: usable,
                incomingIsPaid: isPaid,
                incomingFromReroll:
                  sameIncomingUpgrade && stateRef.current.incomingFromReroll,
              }),
          ...(compositionRef.current === 3 &&
          isSameBankEnrichment(usable, usable)
            ? { compositionStatus: 'ready' as const, compositionError: null }
            : {}),
        });
    },
    [update, structured],
  );
  const applyIncoming = useCallback(() => {
    if (stateRef.current.incoming) {
      eventRef.current?.(
        'composer_suggestions_applied',
        stateRef.current.incomingIsPaid ? 'paid' : 'free',
      );
      update({
        suggestions: stateRef.current.incoming,
        suggestionsIsPaid: stateRef.current.incomingIsPaid,
        incoming: null,
        incomingIsPaid: false,
        incomingFromReroll: false,
      });
    }
  }, [update]);
  return {
    ...current,
    applyIncoming,
    stageIncoming,
    retryFree: loadFree,
    retryStorage: readJournal,
    retryPurchase: () =>
      stateRef.current.purchase
        ? purchase(stateRef.current.purchase)
        : Promise.resolve(),
    reroll: (expectedCredits: number | null) => {
      if (
        expectedCredits === null ||
        !Number.isFinite(expectedCredits) ||
        expectedCredits < 0 ||
        !stateRef.current.journalReady ||
        stateRef.current.purchase ||
        busy.current
      )
        return Promise.resolve();
      return purchase({ idempotencyKey: randomUUID(), expectedCredits });
    },
  };
}
