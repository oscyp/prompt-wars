import { useCallback, useEffect, useRef, useState } from 'react';
import { useMoveSuggestions } from '@/hooks/useMoveSuggestions';
import {
  generateMoveSuggestions,
  getMoveSuggestions,
  type ComposerActionSuggestion,
  type MoveType,
  type MoveSuggestion,
} from '@/utils/battles';
import type { ComposerEvent } from '@/utils/composerTelemetry';
type CompositionStatus = 'pending' | 'ready' | 'failed';
const isComposedBank = (rows: MoveSuggestion[]) =>
  rows.length === 3 &&
  rows.every(
    (row) =>
      row.compositionVersion === 3 &&
      row.intentHints?.length === 3 &&
      row.intentHints.every((hint) => hint.approachHints?.length === 3),
  );
const TYPES: MoveType[] = ['attack', 'defense', 'finisher'];
interface Options {
  accountId: string | undefined;
  battleId: string | undefined;
  round: number;
  situationId: string | undefined;
  enabled: boolean;
  build: boolean;
  fallback: ComposerActionSuggestion[];
  onEvent?: (event: ComposerEvent, choice?: 'free' | 'paid') => void;
}
/** Three mounted banks retain every purchase journal independently of the selected action. */
export function useMoveSuggestionBanks(options: Options) {
  const { build, fallback, ...shared } = options;
  const scope = JSON.stringify([
    options.accountId,
    options.battleId,
    options.round,
    options.situationId,
  ]);
  const interaction = useRef({ scope, active: false });
  if (interaction.current.scope !== scope)
    interaction.current = { scope, active: false };
  const [starterScope, setStarterScope] = useState<string | null>(null);
  const [slowScope, setSlowScope] = useState<string | null>(null);
  const acceptImmediately = () => !interaction.current.active;
  const attack = useMoveSuggestions({
    ...shared,
    moveType: 'attack',
    fallback: [],
    compositionVersion: 3,
    acceptImmediately,
    autoRead: false,
  });
  const defense = useMoveSuggestions({
    ...shared,
    moveType: 'defense',
    fallback: [],
    compositionVersion: 3,
    acceptImmediately,
    autoRead: false,
  });
  const finisher = useMoveSuggestions({
    ...shared,
    moveType: 'finisher',
    fallback: [],
    compositionVersion: 3,
    acceptImmediately,
    autoRead: false,
  });
  const banks = { attack, defense, finisher };
  const { accountId, battleId, round, enabled } = options;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const banksRef = useRef(banks);
  banksRef.current = banks;
  const eventRef = useRef(options.onEvent);
  eventRef.current = options.onEvent;
  const automaticScope = useRef<string | null>(null);
  const failures = useRef<{ scope: string; types: MoveType[] }>({
    scope,
    types: [],
  });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enrichmentTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [composition, setComposition] = useState<{
    scope: string;
    statuses: Partial<Record<MoveType, CompositionStatus>>;
    errors: Partial<Record<MoveType, string>>;
  }>({ scope, statuses: {}, errors: {} });
  const [status, setStatus] = useState({
    scope,
    loading: false,
    error: null as string | null,
  });
  const load = useCallback(async () => {
    if (
      !enabledRef.current ||
      !accountId ||
      !battleId ||
      scopeRef.current !== scope
    )
      return;
    const run = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    enrichmentTimers.current.forEach(clearTimeout);
    enrichmentTimers.current.clear();
    const valid = () =>
      enabledRef.current &&
      scopeRef.current === scope &&
      generation.current === run;
    // Keep failures from every type through later polls and explicit retries.
    // A successful read/delivery for that same type is what clears its failure.
    const failedTypes = new Set<MoveType>(
      failures.current.scope === scope ? failures.current.types : [],
    );
    const unresolvedTypes = new Set(TYPES);
    const unavailable =
      'Some ideas are unavailable. Try again or return to Face-off to write your own.';
    const update = (
      loading: boolean,
      error: string | null = failedTypes.size ? unavailable : null,
    ) => {
      if (valid()) {
        failures.current = { scope, types: [...failedTypes] };
        setStatus({ scope, loading, error });
      }
    };
    const stage = (type: MoveType, rows: MoveSuggestion[], paid = false) => {
      if (valid()) {
        failedTypes.delete(type);
        unresolvedTypes.delete(type);
        banksRef.current[type].stageIncoming(rows, paid);
        eventRef.current?.(
          'composer_suggestions_generated',
          paid ? 'paid' : 'free',
        );
      }
    };
    const updateComposition = (
      type: MoveType,
      status: CompositionStatus,
      error?: string,
    ) => {
      if (!valid()) return;
      setComposition((old) => ({
        scope,
        statuses: {
          ...(old.scope === scope ? old.statuses : {}),
          [type]: status,
        },
        errors: { ...(old.scope === scope ? old.errors : {}), [type]: error },
      }));
    };
    const enriching = new Set<MoveType>();
    const enrich = (
      type: MoveType,
      setId: string,
      original: MoveSuggestion[],
    ) => {
      if (enriching.has(type) || !valid()) return;
      enriching.add(type);
      const started = Date.now();
      updateComposition(type, 'pending');
      const failed = () =>
        updateComposition(
          type,
          'failed',
          'Approach ideas are unavailable. Your delivered ideas are kept. Go Back to choose another action, or return to Face-off to write your own.',
        );
      const recover = async (): Promise<void> => {
        if (!valid()) return;
        try {
          const result = await generateMoveSuggestions(battleId, type, round, {
            operation: 'ensure_free',
            compositionVersion: 3,
            suggestionSetId: setId,
          });
          if (!valid()) return;
          if (
            result.set?.id === setId &&
            isComposedBank(result.set.suggestions)
          ) {
            const bank = banksRef.current[type];
            const matches = (rows: MoveSuggestion[] | null) =>
              rows?.length === original.length &&
              rows.every((row, i) => row.id === original[i].id);
            // A purchase can overtake this no-charge extension. Only append to
            // the original bank; never resurrect it over the newer purchase.
            if (
              matches(bank.suggestions) ||
              matches(bank.incoming) ||
              (!bank.suggestions.length && !bank.incoming?.length)
            ) {
              stage(type, result.set.suggestions, result.set.isPaid);
            }
            updateComposition(type, 'ready');
          } else if (
            result.compositionStatus === 'pending' ||
            result.status === 'pending'
          ) {
            if (Date.now() - started >= 120_000) {
              failed();
              return;
            }
            const pending = setTimeout(() => {
              enrichmentTimers.current.delete(pending);
              void recover();
            }, 1500);
            enrichmentTimers.current.add(pending);
          } else failed();
        } catch {
          failed();
        }
      };
      void recover();
    };
    const accept = (
      type: MoveType,
      rows: MoveSuggestion[],
      paid = false,
      id?: string,
    ) => {
      stage(type, rows, paid);
      if (isComposedBank(rows)) updateComposition(type, 'ready');
      else if (id) enrich(type, id, rows);
    };
    update(true);
    const started = Date.now();
    const poll = async (types: MoveType[]): Promise<void> => {
      const pending: MoveType[] = [];
      await Promise.allSettled(
        types.map(async (type) => {
          try {
            const read = await getMoveSuggestions(battleId, type, round);
            if (!valid()) return;
            if (read.status === 'ready')
              accept(type, read.suggestions, read.isPaid, read.id);
            else if (read.status === 'pending') pending.push(type);
            else failedTypes.add(type);
          } catch {
            if (valid()) failedTypes.add(type);
          }
        }),
      );
      if (!valid()) return;
      if (pending.length && Date.now() - started < 120_000) {
        update(true);
        timer.current = setTimeout(() => {
          void poll(pending);
        }, 1500);
      } else {
        pending.forEach((type) => failedTypes.add(type));
        update(false);
      }
    };
    try {
      const reads = await Promise.allSettled(
        TYPES.map((type) => getMoveSuggestions(battleId, type, round)),
      );
      if (!valid()) return;
      const missing: MoveType[] = [];
      const pending: MoveType[] = [];
      reads.forEach((read, i) => {
        if (read.status === 'rejected') {
          failedTypes.add(TYPES[i]);
          return;
        }
        if (read.value.status === 'ready') {
          accept(
            TYPES[i],
            read.value.suggestions,
            read.value.isPaid,
            read.value.id,
          );
        } else if (read.value.status === 'pending') pending.push(TYPES[i]);
        else missing.push(TYPES[i]);
      });
      if (missing.length) {
        // One bounded request per type keeps a full 27-path bank out of a
        // combined 81-path generation. The server still owns each free slot.
        await Promise.allSettled(
          missing.map(async (type) => {
            try {
              const result = await generateMoveSuggestions(
                battleId,
                type,
                round,
                {
                  operation: 'ensure_free',
                  compositionVersion: 3,
                },
              );
              if (!valid()) return;
              if (result.set)
                accept(
                  type,
                  result.set.suggestions,
                  result.set.isPaid,
                  result.set.id,
                );
              else if (result.status === 'pending') pending.push(type);
              else failedTypes.add(type);
            } catch {
              if (valid()) failedTypes.add(type);
            }
            update(true);
          }),
        );
        if (!valid()) return;
      }
      if (pending.length) {
        update(true);
        eventRef.current?.('composer_suggestions_pending');
        timer.current = setTimeout(() => {
          void poll(pending);
        }, 1500);
      } else update(false);
    } catch {
      unresolvedTypes.forEach((type) => failedTypes.add(type));
      update(
        false,
        'Couldn’t load ideas. Try again or return to Face-off to write your own.',
      );
    }
  }, [accountId, battleId, round, scope]);
  useEffect(() => {
    const pendingEnrichments = enrichmentTimers.current;
    if (!enabled) {
      automaticScope.current = null;
      setStatus({ scope, loading: false, error: null });
    }
    return () => {
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      pendingEnrichments.forEach(clearTimeout);
      pendingEnrichments.clear();
    };
  }, [scope, enabled]);
  useEffect(() => {
    if (enabled && build && automaticScope.current !== scope) {
      automaticScope.current = scope;
      void load();
    }
  }, [enabled, build, scope, load]);
  useEffect(() => {
    if (!enabled || !build) return;
    const slow = setTimeout(() => setSlowScope(scope), 8000);
    return () => clearTimeout(slow);
  }, [scope, enabled, build]);
  const useStarters = () => {
    interaction.current.active = true;
    setStarterScope(scope);
    eventRef.current?.('composer_suggestions_fallback', 'free');
  };
  const authoredIds = new Set(fallback.map((x) => x.id));
  const remote = TYPES.flatMap((moveType) =>
    banks[moveType].suggestions
      .filter((x) => !authoredIds.has(x.id))
      .map((x) => ({ ...x, moveType, source: 'ai' as const })),
  );
  const paidIds = TYPES.flatMap((type) =>
    banks[type].suggestionsIsPaid
      ? banks[type].suggestions.map((x) => x.id ?? '')
      : [],
  );
  const incompleteTypes = TYPES.filter(
    (type) => !isComposedBank(remote.filter((row) => row.moveType === type)),
  );
  const enrichmentFailed = incompleteTypes.some(
    (type) =>
      banks[type].compositionStatus === 'failed' ||
      (composition.scope === scope && composition.statuses[type] === 'failed'),
  );
  return {
    banks,
    compositionStatus: Object.fromEntries(
      TYPES.flatMap((type) => {
        const value =
          banks[type].compositionStatus ??
          (composition.scope === scope
            ? composition.statuses[type]
            : undefined);
        return value ? [[type, value]] : [];
      }),
    ) as Partial<Record<MoveType, CompositionStatus>>,
    compositionErrors: Object.fromEntries(
      TYPES.flatMap((type) => {
        const value = banks[type].compositionStatus
          ? banks[type].compositionError
          : composition.scope === scope
            ? composition.errors[type]
            : undefined;
        return value ? [[type, value]] : [];
      }),
    ) as Partial<Record<MoveType, string>>,
    suggestions: TYPES.flatMap((type) => {
      const ready = remote.filter((x) => x.moveType === type);
      // An older delivered bank remains in its cache, but cannot complete a
      // selection-only move until enrichment succeeds. Starters are opt-in.
      return starterScope === scope && incompleteTypes.includes(type)
        ? fallback.filter((x) => x.moveType === type)
        : ready;
    }),
    markInteracted: () => {
      interaction.current.active = true;
    },
    useStarters,
    usingStarters: starterScope === scope,
    canUseStarters:
      incompleteTypes.length > 0 &&
      (slowScope === scope ||
        enrichmentFailed ||
        (status.scope === scope && !!status.error)),
    paidIds,
    loading: status.scope === scope && status.loading,
    error: status.scope === scope ? status.error : null,
    retry: load,
  };
}
