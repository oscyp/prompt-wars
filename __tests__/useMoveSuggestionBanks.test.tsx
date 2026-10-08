import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMoveSuggestionBanks } from '@/hooks/useMoveSuggestionBanks';
import {
  ensureFreeMoveSuggestionBanks,
  generateMoveSuggestions,
  getMoveSuggestions,
} from '@/utils/battles';
import type { ComposerActionSuggestion, MoveType } from '@/utils/battles';
jest.mock('@/utils/battles', () => ({
  ensureFreeMoveSuggestionBanks: jest.fn(),
  generateMoveSuggestions: jest.fn(),
  getMoveSuggestions: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'purchase-key' }));
const types: MoveType[] = ['attack', 'defense', 'finisher'];
const actions: ComposerActionSuggestion[] = types.flatMap((moveType) =>
  [1, 2, 3].map((n) => ({
    id: `${moveType}-${n}`,
    moveType,
    source: 'authored',
    title: 'A starter',
    body: 'I brace the bridge. This lets everyone cross.',
    action: 'I brace the bridge.',
    structureVersion: 2,
    intentHints: [1, 2, 3].map((i) => ({
      id: `i${i}`,
      text: 'This lets everyone cross.',
    })),
  })),
);
const remote = actions.slice(0, 3).map((x) => ({ ...x, id: `ai-${x.id}` }));
const args = {
  accountId: 'a',
  battleId: 'b',
  round: 1,
  situationId: 's',
  enabled: true,
  build: false,
  fallback: actions,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  jest.mocked(AsyncStorage.removeItem).mockResolvedValue();
  jest.mocked(getMoveSuggestions).mockResolvedValue({ status: 'none' });
  jest.mocked(ensureFreeMoveSuggestionBanks).mockResolvedValue({});
  jest.mocked(generateMoveSuggestions).mockResolvedValue({
    set: null,
    failure: 'unavailable',
    message: 'Offline',
  });
});
it('Write does not generate; Face-off Build prepares missing types with separate free requests', async () => {
  const h = renderHook((p: typeof args) => useMoveSuggestionBanks(p), {
    initialProps: args,
  });
  await waitFor(() =>
    expect(h.result.current.banks.attack.journalReady).toBe(true),
  );
  expect(ensureFreeMoveSuggestionBanks).not.toHaveBeenCalled();
  expect(getMoveSuggestions).not.toHaveBeenCalled();
  h.rerender({ ...args, build: true });
  await waitFor(() => expect(generateMoveSuggestions).toHaveBeenCalledTimes(3));
  for (const type of types)
    expect(generateMoveSuggestions).toHaveBeenCalledWith('b', type, 1, {
      operation: 'ensure_free',
      compositionVersion: 3,
    });
  expect(ensureFreeMoveSuggestionBanks).not.toHaveBeenCalled();
  h.rerender(args);
  h.rerender({ ...args, build: true });
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(3);
});
it('cached AI replaces starters immediately without mixing duplicate banks', async () => {
  jest
    .mocked(getMoveSuggestions)
    .mockImplementation(async (_b, type) =>
      type === 'attack'
        ? { status: 'ready', suggestions: remote }
        : { status: 'none' },
    );
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.banks.attack.suggestions).toEqual(remote),
  );
  expect(h.result.current.suggestions).toHaveLength(3);
  expect(h.result.current.suggestions.every((x) => x.source === 'ai')).toBe(
    true,
  );
  for (const type of ['defense', 'finisher'])
    expect(generateMoveSuggestions).toHaveBeenCalledWith('b', type, 1, {
      operation: 'ensure_free',
      compositionVersion: 3,
    });
  act(() => h.result.current.banks.attack.applyIncoming());
  expect(h.result.current.suggestions).toHaveLength(3);
});
it('delivers each free type without waiting for the slowest generation', async () => {
  let finishSlow!: (
    value: Awaited<ReturnType<typeof generateMoveSuggestions>>,
  ) => void;
  jest
    .mocked(generateMoveSuggestions)
    .mockImplementation(async (_battle, type) => {
      if (type === 'defense')
        return new Promise((resolve) => {
          finishSlow = resolve;
        });
      return type === 'attack'
        ? {
            set: {
              id: 'fast-bank',
              suggestions: remote,
              isPaid: false,
              creditsSpent: 0,
            },
            status: 'ready',
            failure: null,
            message: null,
          }
        : { set: null, failure: 'unavailable', message: 'Offline' };
    });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.banks.attack.suggestions).toEqual(remote),
  );
  expect(h.result.current.loading).toBe(true);
  await act(async () =>
    finishSlow({ set: null, failure: 'unavailable', message: 'Offline' }),
  );
  expect(h.result.current.banks.attack.suggestions).toEqual(remote);
  h.unmount();
});
it('every type keeps its ambiguous purchase journal while another bank is used', async () => {
  const h = renderHook(() => useMoveSuggestionBanks(args));
  await waitFor(() =>
    expect(h.result.current.banks.finisher.journalReady).toBe(true),
  );
  await act(async () => h.result.current.banks.attack.reroll(2));
  await act(async () => h.result.current.banks.defense.reroll(2));
  expect(h.result.current.banks.attack.purchase?.idempotencyKey).toBe(
    'purchase-key',
  );
  expect(h.result.current.banks.defense.purchase?.idempotencyKey).toBe(
    'purchase-key',
  );
  await act(async () => h.result.current.banks.attack.retryPurchase());
  expect(generateMoveSuggestions).toHaveBeenLastCalledWith('b', 'attack', 1, {
    operation: 'reroll',
    idempotencyKey: 'purchase-key',
    expectedCredits: 2,
    compositionVersion: 3,
  });
});

it('retains paid cache metadata so purchased ideas remain visible after restart', async () => {
  jest
    .mocked(getMoveSuggestions)
    .mockImplementation(async (_b, type) =>
      type === 'attack'
        ? { status: 'ready', suggestions: remote, isPaid: true }
        : { status: 'none' },
    );
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.banks.attack.suggestions).toEqual(remote),
  );
  act(() => h.result.current.banks.attack.applyIncoming());
  expect(h.result.current.paidIds).toEqual(remote.map((x) => x.id));
});

it('stops the loading state while submission suspends suggestions and recovers the cache on resume', async () => {
  jest.useFakeTimers();
  jest.mocked(getMoveSuggestions).mockResolvedValue({ status: 'pending' });
  const h = renderHook((p: typeof args) => useMoveSuggestionBanks(p), {
    initialProps: { ...args, build: true },
  });
  await act(async () => {});
  expect(h.result.current.loading).toBe(true);
  h.rerender({ ...args, build: true, enabled: false });
  expect(h.result.current.loading).toBe(false);
  jest
    .mocked(getMoveSuggestions)
    .mockResolvedValue({ status: 'ready', suggestions: remote });
  h.rerender({ ...args, build: true });
  await act(async () => {});
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.banks.attack.suggestions).toEqual(remote);
  h.unmount();
  jest.useRealTimers();
});

it.each(['initial read', 'poll'] as const)(
  'keeps a type failure from %s visible while other banks finish, until that type recovers',
  async (failurePhase) => {
    jest.useFakeTimers();
    const reads = { attack: 0, defense: 0, finisher: 0 };
    let recovering = false;
    let finishRecovery!: (value: {
      status: 'ready';
      suggestions: typeof remote;
    }) => void;
    const recovery = new Promise<{
      status: 'ready';
      suggestions: typeof remote;
    }>((resolve) => {
      finishRecovery = resolve;
    });
    jest
      .mocked(getMoveSuggestions)
      .mockImplementation(async (_battle, type) => {
        reads[type] += 1;
        if (recovering)
          return type === 'attack'
            ? recovery
            : { status: 'ready', suggestions: remote };
        if (type === 'attack') {
          if (failurePhase === 'poll' && reads.attack === 1)
            return { status: 'pending' };
          throw new Error('Attack cache unavailable');
        }
        if (
          type === 'defense' &&
          reads.defense <= (failurePhase === 'poll' ? 2 : 1)
        )
          return { status: 'pending' };
        return { status: 'ready', suggestions: remote };
      });
    const h = renderHook(() =>
      useMoveSuggestionBanks({ ...args, build: true }),
    );
    try {
      await act(async () => {});
      await act(async () => jest.advanceTimersByTime(1500));
      if (failurePhase === 'poll')
        await act(async () => jest.advanceTimersByTime(1500));
      expect(h.result.current.banks.defense.suggestions).toEqual(remote);
      expect(h.result.current.banks.attack.incoming).toBeNull();
      expect(h.result.current.loading).toBe(false);
      expect(h.result.current.error).toContain('unavailable');
      recovering = true;
      let retry!: Promise<void>;
      act(() => {
        retry = h.result.current.retry();
      });
      await act(async () => {});
      expect(h.result.current.error).toContain('unavailable');
      await act(async () => {
        finishRecovery({ status: 'ready', suggestions: remote });
        await retry;
      });
      expect(h.result.current.banks.attack.suggestions).toEqual(remote);
      expect(h.result.current.error).toBeNull();
    } finally {
      h.unmount();
      jest.useRealTimers();
    }
  },
);

const upgraded = remote.map((option) => ({
  ...option,
  compositionVersion: 3 as const,
  intentHints: option.intentHints!.map((hint) => ({
    ...hint,
    approachHints: [1, 2, 3].map((i) => ({
      id: `${hint.id}-p${i}`,
      text: `I hold the cable from behind cover ${i}.`,
    })),
  })),
}));

it('recovers an exact paid cache enrichment without rerolling or hiding the delivered bank', async () => {
  jest.useFakeTimers();
  jest
    .mocked(getMoveSuggestions)
    .mockImplementation(async (_battle, type) =>
      type === 'attack'
        ? { status: 'ready', id: 'paid-set', suggestions: remote, isPaid: true }
        : { status: 'ready', suggestions: upgraded },
    );
  jest
    .mocked(generateMoveSuggestions)
    .mockResolvedValueOnce({
      status: 'ready',
      compositionStatus: 'pending',
      set: {
        id: 'paid-set',
        suggestions: remote,
        isPaid: true,
        creditsSpent: 2,
      },
      failure: null,
      message: null,
    })
    .mockResolvedValueOnce({
      status: 'ready',
      compositionStatus: 'ready',
      set: {
        id: 'paid-set',
        suggestions: upgraded,
        isPaid: true,
        creditsSpent: 2,
      },
      failure: null,
      message: null,
    });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  act(() => h.result.current.markInteracted());
  await act(async () => {});
  expect(h.result.current.banks.attack.incoming).toEqual(remote);
  expect(h.result.current.compositionStatus.attack).toBe('pending');
  await act(async () => jest.advanceTimersByTime(1500));
  expect(h.result.current.banks.attack.incoming).toEqual(upgraded);
  expect(h.result.current.banks.attack.incomingIsPaid).toBe(true);
  expect(h.result.current.compositionStatus.attack).toBe('ready');
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(2);
  expect(generateMoveSuggestions).toHaveBeenLastCalledWith('b', 'attack', 1, {
    operation: 'ensure_free',
    compositionVersion: 3,
    suggestionSetId: 'paid-set',
  });
  act(() => h.result.current.banks.attack.applyIncoming());
  expect(h.result.current.paidIds).toEqual(remote.map((x) => x.id));
  h.unmount();
  jest.useRealTimers();
});

it('keeps the successfully purchased cache if its free enrichment request fails', async () => {
  jest
    .mocked(getMoveSuggestions)
    .mockImplementation(async (_battle, type) =>
      type === 'attack'
        ? { status: 'ready', id: 'paid-set', suggestions: remote, isPaid: true }
        : { status: 'ready', suggestions: upgraded },
    );
  jest.mocked(generateMoveSuggestions).mockResolvedValue({
    set: null,
    failure: 'unavailable',
    message: 'Offline',
  });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.compositionStatus.attack).toBe('failed'),
  );
  expect(h.result.current.banks.attack.suggestions).toEqual(remote);
  expect(h.result.current.paidIds).toEqual(remote.map((x) => x.id));
  expect(h.result.current.compositionErrors.attack).toContain('write your own');
  expect(h.result.current.banks.attack.purchase).toBeNull();
});

it('does not offer starter ideas when all three AI banks are already available', async () => {
  jest.useFakeTimers();
  jest
    .mocked(getMoveSuggestions)
    .mockResolvedValue({ status: 'ready', suggestions: upgraded });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await act(async () => {});
  await act(async () => jest.advanceTimersByTime(8000));
  expect(h.result.current.suggestions).toHaveLength(9);
  expect(h.result.current.canUseStarters).toBe(false);
  h.unmount();
  jest.useRealTimers();
});

it('a late free enrichment cannot replace a newer paid bank after its purchase is applied', async () => {
  let finishUpgrade!: (value: any) => void;
  jest.mocked(getMoveSuggestions).mockImplementation(async (_battle, type) =>
    type === 'attack'
      ? {
          status: 'ready',
          id: 'old-paid-set',
          suggestions: remote,
          isPaid: true,
        }
      : { status: 'ready', suggestions: upgraded },
  );
  const newest = upgraded.map((row) => ({ ...row, id: `new-${row.id}` }));
  jest
    .mocked(generateMoveSuggestions)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishUpgrade = resolve;
      }),
    )
    .mockResolvedValueOnce({
      status: 'ready',
      set: {
        id: 'new-paid-set',
        suggestions: newest,
        isPaid: true,
        creditsSpent: 2,
      },
      failure: null,
      message: null,
    });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.banks.attack.suggestions).toEqual(remote),
  );
  act(() => h.result.current.markInteracted());
  await act(async () => h.result.current.banks.attack.reroll(2));
  act(() => h.result.current.banks.attack.applyIncoming());
  expect(h.result.current.banks.attack.suggestions).toEqual(newest);
  await act(async () =>
    finishUpgrade({
      status: 'ready',
      compositionStatus: 'ready',
      set: {
        id: 'old-paid-set',
        suggestions: upgraded,
        isPaid: true,
        creditsSpent: 2,
      },
      failure: null,
      message: null,
    }),
  );
  expect(h.result.current.banks.attack.incoming).toBeNull();
  expect(h.result.current.banks.attack.suggestions).toEqual(newest);
  h.unmount();
});

it('accepts an immediately completed free enrichment during initial cache hydration', async () => {
  jest
    .mocked(getMoveSuggestions)
    .mockImplementation(async (_battle, type) =>
      type === 'attack'
        ? { status: 'ready', id: 'old-set', suggestions: remote, isPaid: false }
        : { status: 'ready', suggestions: upgraded },
    );
  jest.mocked(generateMoveSuggestions).mockResolvedValue({
    status: 'ready',
    compositionStatus: 'ready',
    set: {
      id: 'old-set',
      suggestions: upgraded,
      isPaid: false,
      creditsSpent: 0,
    },
    failure: null,
    message: null,
  });
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.compositionStatus.attack).toBe('ready'),
  );
  expect(h.result.current.banks.attack.suggestions).toEqual(upgraded);
  h.unmount();
});

it('allows explicit complete starters when cached old banks cannot be enriched', async () => {
  jest.mocked(getMoveSuggestions).mockImplementation(async (_battle, type) => ({
    status: 'ready',
    id: `old-${type}`,
    suggestions: remote,
  }));
  const h = renderHook(() => useMoveSuggestionBanks({ ...args, build: true }));
  await waitFor(() =>
    expect(h.result.current.compositionStatus.attack).toBe('failed'),
  );
  expect(h.result.current.canUseStarters).toBe(true);
  act(() => h.result.current.useStarters());
  expect(h.result.current.suggestions).toHaveLength(9);
  expect(
    h.result.current.suggestions.every(
      (choice) => choice.source === 'authored',
    ),
  ).toBe(true);
  expect(h.result.current.banks.attack.suggestions).toEqual(remote);
  h.unmount();
});
