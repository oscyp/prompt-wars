import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMoveSuggestions } from '@/hooks/useMoveSuggestions';
import { generateMoveSuggestions, getMoveSuggestions } from '@/utils/battles';
jest.mock('@/utils/battles', () => ({
  generateMoveSuggestions: jest.fn(),
  getMoveSuggestions: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'purchase-key' }));
const fallback = [
  {
    id: 'f',
    structureVersion: 2 as const,
    title: 'Fallback',
    body: 'Fallback text',
    action: 'I brace the bridge.',
    intentHints: [
      { id: 'i1', text: 'Help people cross.' },
      { id: 'i2', text: 'Slow the pursuer.' },
      { id: 'i3', text: 'Test the weak supports.' },
    ],
  },
];
const remote = [1, 2, 3].map((n) => ({
  ...fallback[0],
  id: `remote-${n}`,
  title: `Remote ${n}`,
}));
const args = {
  accountId: 'a',
  battleId: 'b',
  round: 1,
  moveType: 'attack' as const,
  situationId: 's',
  enabled: true,
  fallback,
};
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  jest.mocked(getMoveSuggestions).mockResolvedValue({ status: 'none' });
  jest.mocked(generateMoveSuggestions).mockResolvedValue({
    set: null,
    failure: 'unavailable',
    message: 'Offline',
  });
});
it('has immediate fallback, only requests ensure_free, and late AI needs explicit application', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(getMoveSuggestions).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  const hook = renderHook(() => useMoveSuggestions(args));
  expect(hook.result.current.suggestions).toEqual(fallback);
  await act(async () => resolve({ status: 'ready', suggestions: remote }));
  expect(hook.result.current.suggestions).toEqual(fallback);
  expect(hook.result.current.incoming).toEqual(remote);
  act(() => hook.result.current.applyIncoming());
  expect(hook.result.current.suggestions).toEqual(remote);
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
});
it('missing free slot uses explicit free operation and offline does not remove choices', async () => {
  const hook = renderHook(() => useMoveSuggestions(args));
  await waitFor(() =>
    expect(generateMoveSuggestions).toHaveBeenCalledWith('b', 'attack', 1, {
      operation: 'ensure_free',
    }),
  );
  expect(hook.result.current.suggestions).toEqual(fallback);
});
it('drops a previous round response and immediately scopes displayed choices', async () => {
  const reads: ((value: unknown) => void)[] = [];
  jest.mocked(getMoveSuggestions).mockImplementation(
    () =>
      new Promise((done) => {
        reads.push(done);
      }) as never,
  );
  const hook = renderHook((props: typeof args) => useMoveSuggestions(props), {
    initialProps: args,
  });
  hook.rerender({ ...args, round: 2 });
  await act(async () => reads[0]({ status: 'ready', suggestions: remote }));
  expect(hook.result.current.incoming).toBeNull();
  expect(hook.result.current.suggestions).toEqual(fallback);
  hook.unmount();
});
it('unknown price blocks purchase and ambiguous retry reuses the persisted operation and price', async () => {
  const hook = renderHook(() => useMoveSuggestions(args));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  jest.mocked(generateMoveSuggestions).mockClear();
  await act(async () => hook.result.current.reroll(null));
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
  await act(async () => hook.result.current.reroll(2));
  await act(async () => hook.result.current.retryPurchase());
  expect(generateMoveSuggestions).toHaveBeenNthCalledWith(1, 'b', 'attack', 1, {
    operation: 'reroll',
    idempotencyKey: 'purchase-key',
    expectedCredits: 2,
  });
  expect(generateMoveSuggestions).toHaveBeenNthCalledWith(2, 'b', 'attack', 1, {
    operation: 'reroll',
    idempotencyKey: 'purchase-key',
    expectedCredits: 2,
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining('purchase-key'),
  );
});

it('restored pending purchase requires an explicit status check with its original price', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify({ idempotencyKey: 'old-key', expectedCredits: 5 }),
  );
  jest
    .mocked(getMoveSuggestions)
    .mockResolvedValue({ status: 'ready', suggestions: remote });
  const hook = renderHook(() => useMoveSuggestions(args));
  await waitFor(() =>
    expect(hook.result.current.purchase?.idempotencyKey).toBe('old-key'),
  );
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
  await act(async () => hook.result.current.reroll(1));
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
  jest.mocked(generateMoveSuggestions).mockResolvedValueOnce({
    status: 'failed',
    set: null,
    failure: 'failed',
    message: 'refunded',
  });
  await act(async () => hook.result.current.retryPurchase());
  expect(generateMoveSuggestions).toHaveBeenCalledWith('b', 'attack', 1, {
    operation: 'reroll',
    idempotencyKey: 'old-key',
    expectedCredits: 5,
  });
  expect(hook.result.current.purchase).toBeNull();
  expect(hook.result.current.error).toContain('refunded');
});
it.each(['generation_disabled', 'rate_limited'])(
  'keeps a blocked pending action purchase for same-key recovery: %s',
  async (code) => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockResolvedValue(
        JSON.stringify({
          idempotencyKey: 'reserved-action',
          expectedCredits: 1,
        }),
      );
    jest
      .mocked(getMoveSuggestions)
      .mockResolvedValue({ status: 'ready', suggestions: remote });
    const hook = renderHook(() => useMoveSuggestions(args));
    await waitFor(() =>
      expect(hook.result.current.purchase?.idempotencyKey).toBe(
        'reserved-action',
      ),
    );
    jest
      .mocked(generateMoveSuggestions)
      .mockResolvedValue({
        status: 'pending',
        operationId: 'operation-1',
        set: null,
        code,
        failure: code === 'rate_limited' ? 'rate_limited' : 'unavailable',
        message: 'Recovery is paused',
      });
    await act(async () => hook.result.current.retryPurchase());
    expect(hook.result.current.purchase?.idempotencyKey).toBe(
      'reserved-action',
    );
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    await act(async () => hook.result.current.reroll(1));
    expect(generateMoveSuggestions).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.retryPurchase());
    expect(generateMoveSuggestions).toHaveBeenLastCalledWith('b', 'attack', 1, {
      operation: 'reroll',
      idempotencyKey: 'reserved-action',
      expectedCredits: 1,
    });
    hook.unmount();
  },
);
it('cannot spend if the operation journal cannot be saved', async () => {
  const hook = renderHook(() => useMoveSuggestions(args));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  jest.mocked(generateMoveSuggestions).mockClear();
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('Disk unavailable'),
  );
  await act(async () => hook.result.current.reroll(2));
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
  expect(hook.result.current.suggestions).toEqual(fallback);
});
it('does not generate on top of a pending free read', async () => {
  jest.useFakeTimers();
  jest.mocked(getMoveSuggestions).mockResolvedValue({ status: 'pending' });
  const hook = renderHook(() => useMoveSuggestions(args));
  await act(async () => {});
  await act(async () => jest.advanceTimersByTime(1500));
  expect(getMoveSuggestions).toHaveBeenCalledTimes(2);
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
  hook.unmount();
  jest.useRealTimers();
});

it('a failed journal read blocks only purchases and can be retried without spending', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
    new Error('Storage locked'),
  );
  const hook = renderHook(() => useMoveSuggestions(args));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.journalReady).toBe(false);
  expect(hook.result.current.suggestions).toEqual(fallback);
  jest.mocked(generateMoveSuggestions).mockClear();
  await act(async () => hook.result.current.retryStorage());
  expect(hook.result.current.journalReady).toBe(true);
  expect(generateMoveSuggestions).not.toHaveBeenCalled();
});

it('stages batch delivery explicitly and records whether the applied set was purchased', async () => {
  const hook = renderHook(() =>
    useMoveSuggestions({ ...args, autoRead: false }),
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  act(() => hook.result.current.stageIncoming(remote, true));
  expect(hook.result.current.suggestions).toEqual(fallback);
  expect(hook.result.current.incomingIsPaid).toBe(true);
  act(() => hook.result.current.applyIncoming());
  expect(hook.result.current.suggestions).toEqual(remote);
  expect(hook.result.current.suggestionsIsPaid).toBe(true);
});

it('late included-bank delivery cannot replace a purchased set already applied', async () => {
  const hook = renderHook(() =>
    useMoveSuggestions({ ...args, autoRead: false }),
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  act(() => hook.result.current.stageIncoming(remote, true));
  act(() => hook.result.current.applyIncoming());
  act(() =>
    hook.result.current.stageIncoming(
      remote.map((x) => ({ ...x, id: `free-${x.id}` })),
      false,
    ),
  );
  expect(hook.result.current.incoming).toBeNull();
  expect(hook.result.current.suggestionsIsPaid).toBe(true);
});

const composedRemote = remote.map((row) => ({
  ...row,
  compositionVersion: 3 as const,
  intentHints: row.intentHints.map((intent) => ({
    ...intent,
    approachHints: [1, 2, 3].map((n) => ({
      id: `${row.id}:${intent.id}:approach:${n}`,
      text: `I brace the support from position ${n}.`,
    })),
  })),
}));
const legacyPaidDelivery = {
  status: 'ready' as const,
  compositionStatus: 'pending' as const,
  set: {
    id: 'old-purchase',
    suggestions: remote,
    isPaid: true,
    creditsSpent: 5,
  },
  failure: null,
  message: null,
};

it('recovers a delivered legacy purchase extension without another purchase or custom adaptation', async () => {
  jest.useFakeTimers();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify({ idempotencyKey: 'old-key', expectedCredits: 5 }),
  );
  jest
    .mocked(generateMoveSuggestions)
    .mockResolvedValueOnce(legacyPaidDelivery)
    .mockResolvedValueOnce(legacyPaidDelivery)
    .mockResolvedValueOnce({
      ...legacyPaidDelivery,
      compositionStatus: 'ready',
      set: { ...legacyPaidDelivery.set, suggestions: composedRemote },
    });
  const hook = renderHook(() =>
    useMoveSuggestions({ ...args, autoRead: false, compositionVersion: 3 }),
  );
  await act(async () => {});
  await act(async () => hook.result.current.retryPurchase());
  expect(hook.result.current.purchase).toBeNull();
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.incoming).toEqual(remote);
  // Applying the original purchase does not stop its free extension.
  act(() => hook.result.current.applyIncoming());
  await act(async () => jest.advanceTimersByTime(1500));
  expect(hook.result.current.suggestions).toEqual(remote);
  expect(hook.result.current.incoming).toEqual(composedRemote);
  expect(hook.result.current.incomingIsPaid).toBe(true);
  expect(generateMoveSuggestions).toHaveBeenNthCalledWith(1, 'b', 'attack', 1, {
    operation: 'reroll',
    idempotencyKey: 'old-key',
    expectedCredits: 5,
    compositionVersion: 3,
  });
  for (const call of jest.mocked(generateMoveSuggestions).mock.calls.slice(1)) {
    expect(call[3]).toEqual({
      operation: 'ensure_free',
      compositionVersion: 3,
      suggestionSetId: 'old-purchase',
    });
  }
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(3);
  expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
  hook.unmount();
  jest.useRealTimers();
});

it('an extension failure does not reopen a paid operation or claim its charge was refunded', async () => {
  jest
    .mocked(generateMoveSuggestions)
    .mockResolvedValueOnce(legacyPaidDelivery)
    .mockRejectedValueOnce(new Error('Extension offline'));
  const hook = renderHook(() =>
    useMoveSuggestions({ ...args, autoRead: false, compositionVersion: 3 }),
  );
  await act(async () => {});
  await act(async () => hook.result.current.reroll(5));
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(2);
  expect(hook.result.current.purchase).toBeNull();
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.incoming).toEqual(remote);
  expect(hook.result.current.incomingIsPaid).toBe(true);
  expect(hook.result.current.compositionStatus).toBe('failed');
  act(() => hook.result.current.stageIncoming(composedRemote, true));
  expect(hook.result.current.compositionStatus).toBe('ready');
  expect(hook.result.current.compositionError).toBeNull();
});

it('a pending paid extension stops at a round change', async () => {
  jest.useFakeTimers();
  jest.mocked(generateMoveSuggestions).mockResolvedValue(legacyPaidDelivery);
  const hook = renderHook(
    (props: typeof args) =>
      useMoveSuggestions({ ...props, autoRead: false, compositionVersion: 3 }),
    { initialProps: args },
  );
  await act(async () => {});
  await act(async () => hook.result.current.reroll(5));
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(2);
  hook.rerender({ ...args, round: 2 });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(generateMoveSuggestions).toHaveBeenCalledTimes(2);
  expect(hook.result.current.incoming).toBeNull();
  hook.unmount();
  jest.useRealTimers();
});

it('an old paid extension cannot replace a newer delivered purchase', async () => {
  let resolveExtension!: (value: unknown) => void;
  const newer = composedRemote.map((row) => ({ ...row, id: `new-${row.id}` }));
  jest
    .mocked(generateMoveSuggestions)
    .mockResolvedValueOnce(legacyPaidDelivery)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveExtension = done;
        }) as never,
    )
    .mockResolvedValueOnce({
      ...legacyPaidDelivery,
      compositionStatus: 'ready',
      set: {
        ...legacyPaidDelivery.set,
        id: 'new-purchase',
        suggestions: newer,
      },
    });
  const hook = renderHook(() =>
    useMoveSuggestions({ ...args, autoRead: false, compositionVersion: 3 }),
  );
  await act(async () => {});
  await act(async () => hook.result.current.reroll(5));
  await act(async () => hook.result.current.reroll(5));
  await act(async () =>
    resolveExtension({
      ...legacyPaidDelivery,
      compositionStatus: 'ready',
      set: { ...legacyPaidDelivery.set, suggestions: composedRemote },
    }),
  );
  expect(hook.result.current.incoming).toEqual(newer);
  expect(hook.result.current.incomingIsPaid).toBe(true);
  expect(hook.result.current.compositionStatus).toBe('ready');
});
