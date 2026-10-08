import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMoveStepSuggestions } from '@/hooks/useMoveStepSuggestions';
import {
  rerollMoveStepSuggestions,
  MoveStepRequestError,
  type MoveStepContext,
  type MoveStepResult,
} from '@/utils/moveStepSuggestions';
jest.mock('@/utils/moveStepSuggestions', () => ({
  ...jest.requireActual('@/utils/moveStepSuggestions'),
  rerollMoveStepSuggestions: jest.fn(),
}));
let mockKey = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `step-key-${++mockKey}` }));
const context: MoveStepContext = {
  battleId: 'battle',
  roundNumber: 1,
  moveType: 'attack',
  target: 'intent',
  actionText: 'I pull the cable across their path',
};
const other: MoveStepContext = {
  ...context,
  moveType: 'defense',
  actionText: 'I brace against the support',
};
const hints = [1, 2, 3].map((n) => ({
  id: `i${n}`,
  text: `to direct them toward the support ${n}`,
  approachHints: [1, 2, 3].map((p) => ({
    id: `p${n}-${p}`,
    text: `by pulling the cable sideways ${p}`,
  })),
}));
const result: MoveStepResult = {
  status: 'ready',
  operationId: 'operation-one',
  contextKey: 'server-context',
  target: 'intent',
  creditsSpent: 1,
  refunded: false,
  intentHints: hints,
};
const args = {
  accountId: 'account',
  battleId: 'battle',
  round: 1,
  enabled: true,
  canPurchase: true,
  context: context as MoveStepContext | null,
};
let rows: Map<string, string>;
beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
  rows = new Map();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => rows.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  jest.mocked(rerollMoveStepSuggestions).mockResolvedValue(result);
});
it('does not buy on mount, blocks invalid prices, and stages the paid result until explicit application', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  for (const price of [null, -1, 2, Number.NaN])
    await act(async () => hook.result.current.reroll(price));
  expect(rerollMoveStepSuggestions).not.toHaveBeenCalled();
  await act(async () => hook.result.current.reroll(1));
  expect(rerollMoveStepSuggestions).toHaveBeenCalledWith({
    ...context,
    expectedCredits: 1,
    idempotencyKey: 'step-key-1',
  });
  expect(hook.result.current.hints).toBeNull();
  expect(hook.result.current.incoming).toEqual(result);
  await act(async () => hook.result.current.applyIncoming());
  expect(hook.result.current.hints).toEqual(result);
  expect(hook.result.current.incoming).toBeNull();
});
it('writes the key before requesting and prevents duplicate concurrent purchases', async () => {
  let release!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve();
      }),
  );
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  let purchase!: Promise<void>;
  act(() => {
    purchase = hook.result.current.reroll(1);
  });
  await act(async () => hook.result.current.reroll(1));
  expect(rerollMoveStepSuggestions).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await purchase;
  });
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
});
it('storage failures block a charge and can be recovered without discarding an older delivered set', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => hook.result.current.reroll(1));
  await act(async () => hook.result.current.applyIncoming());
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('Disk full'));
  await act(async () => hook.result.current.reroll(1));
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
  expect(hook.result.current.journalReady).toBe(false);
  expect(hook.result.current.hints).toEqual(result);
  await act(async () => hook.result.current.retryStorage());
  expect(hook.result.current.journalReady).toBe(true);
  expect(hook.result.current.hints).toEqual(result);
});
it('recovers the exact uncertain purchase and original price after restart even after the round closes', async () => {
  jest
    .mocked(rerollMoveStepSuggestions)
    .mockRejectedValueOnce(new Error('Lost response'));
  const first = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(first.result.current.journalReady).toBe(true));
  await act(async () => first.result.current.reroll(1));
  expect(first.result.current.purchase?.idempotencyKey).toBe('step-key-1');
  first.unmount();
  const restarted = renderHook(() =>
    useMoveStepSuggestions({ ...args, canPurchase: false }),
  );
  await waitFor(() =>
    expect(restarted.result.current.incoming).toEqual(result),
  );
  expect(rerollMoveStepSuggestions).toHaveBeenLastCalledWith({
    ...context,
    expectedCredits: 1,
    idempotencyKey: 'step-key-1',
  });
  await act(async () => restarted.result.current.reroll(1));
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(2);
});
it('finishes an earlier parent purchase without replacing the visible branch and restores it on return and restart', async () => {
  let deliver!: (value: MoveStepResult) => void;
  jest.mocked(rerollMoveStepSuggestions).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  const hook = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  let request!: Promise<void>;
  act(() => {
    request = hook.result.current.reroll(1);
  });
  await waitFor(() =>
    expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1),
  );
  hook.rerender({ ...args, context: other });
  await act(async () => {
    deliver(result);
    await request;
  });
  expect(hook.result.current.incoming).toBeNull();
  hook.rerender(args);
  expect(hook.result.current.incoming).toEqual(result);
  await act(async () => hook.result.current.applyIncoming());
  hook.unmount();
  const restarted = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(restarted.result.current.hints).toEqual(result));
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
});
it('isolates a delayed result from a different account and preserves the original journal for recovery', async () => {
  let deliver!: (value: MoveStepResult) => void;
  jest.mocked(rerollMoveStepSuggestions).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  const hook = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  let request!: Promise<void>;
  act(() => {
    request = hook.result.current.reroll(1);
  });
  await waitFor(() =>
    expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1),
  );
  hook.rerender({ ...args, accountId: 'second' });
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => {
    deliver(result);
    await request;
  });
  expect(hook.result.current.incoming).toBeNull();
  expect([...rows.values()].some((value) => value.includes('step-key-1'))).toBe(
    true,
  );
  hook.rerender(args);
  await waitFor(() => expect(hook.result.current.incoming).toEqual(result));
  expect(rerollMoveStepSuggestions).toHaveBeenLastCalledWith({
    ...context,
    expectedCredits: 1,
    idempotencyKey: 'step-key-1',
  });
});
it('keeps active choices after a rejected or refunded purchase and exposes the reason', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => hook.result.current.reroll(1));
  await act(async () => hook.result.current.applyIncoming());
  jest
    .mocked(rerollMoveStepSuggestions)
    .mockRejectedValueOnce(
      new MoveStepRequestError('insufficient_credits', 'Not enough credits'),
    );
  await act(async () => hook.result.current.reroll(1));
  expect(hook.result.current.purchase).toBeNull();
  expect(hook.result.current.errorCode).toBe('insufficient_credits');
  expect(hook.result.current.hints).toEqual(result);
  jest.mocked(rerollMoveStepSuggestions).mockResolvedValueOnce({
    ...result,
    status: 'failed',
    refunded: true,
    error: 'moderation_rejected',
    intentHints: undefined,
  });
  await act(async () => hook.result.current.reroll(1));
  expect(hook.result.current.purchase).toBeNull();
  expect(hook.result.current.error).toMatch(/refund/i);
  expect(hook.result.current.hints).toEqual(result);
});
it('does not replace applied hints while a second successful set waits for explicit application', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => hook.result.current.reroll(0));
  await act(async () => hook.result.current.applyIncoming());
  const second = {
    ...result,
    operationId: 'second',
    creditsSpent: 0,
    intentHints: hints.map((hint) => ({ ...hint, id: `next-${hint.id}` })),
  };
  jest.mocked(rerollMoveStepSuggestions).mockResolvedValueOnce(second);
  await act(async () => hook.result.current.reroll(0));
  expect(hook.result.current.hints).toEqual(result);
  expect(hook.result.current.incoming).toEqual(second);
});
it('fails closed on unreadable storage and never sends an unjournaled request', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{broken');
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() =>
    expect(hook.result.current.error).toMatch(/storage|previous/i),
  );
  expect(hook.result.current.journalReady).toBe(false);
  await act(async () => hook.result.current.reroll(1));
  expect(rerollMoveStepSuggestions).not.toHaveBeenCalled();
});

it('polls the same purchase across parent changes and stops after its bounded wait', async () => {
  jest.useFakeTimers();
  const pending = {
    ...result,
    status: 'pending' as const,
    intentHints: undefined,
  };
  jest.mocked(rerollMoveStepSuggestions).mockResolvedValue(pending);
  const hook = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  try {
    await act(async () => {});
    expect(hook.result.current.journalReady).toBe(true);
    await act(async () => hook.result.current.reroll(1));
    hook.rerender({ ...args, context: other });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(2);
    expect(rerollMoveStepSuggestions).toHaveBeenLastCalledWith({
      ...context,
      idempotencyKey: 'step-key-1',
      expectedCredits: 1,
    });
    expect(hook.result.current.loading).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(121000);
    });
    hook.rerender(args);
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.error).toMatch(/taking longer/i);
    const attempts = jest.mocked(rerollMoveStepSuggestions).mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(attempts);
    jest.mocked(rerollMoveStepSuggestions).mockResolvedValue(result);
    await act(async () => hook.result.current.retryPurchase());
    expect(hook.result.current.incoming).toEqual(result);
    expect(rerollMoveStepSuggestions).toHaveBeenLastCalledWith({
      ...context,
      idempotencyKey: 'step-key-1',
      expectedCredits: 1,
    });
  } finally {
    hook.unmount();
    jest.useRealTimers();
  }
});
it('recovers two independently paid parents without journal writes losing either result', async () => {
  const completions: ((value: MoveStepResult) => void)[] = [];
  jest
    .mocked(rerollMoveStepSuggestions)
    .mockImplementation(
      () => new Promise((resolve) => completions.push(resolve)),
    );
  const hook = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  let first!: Promise<void>;
  act(() => {
    first = hook.result.current.reroll(1);
  });
  await waitFor(() => expect(completions).toHaveLength(1));
  hook.rerender({ ...args, context: other });
  let second!: Promise<void>;
  act(() => {
    second = hook.result.current.reroll(1);
  });
  await waitFor(() => expect(completions).toHaveLength(2));
  const otherResult = {
    ...result,
    operationId: 'other-operation',
    contextKey: 'other-parent',
  };
  await act(async () => {
    completions[1](otherResult);
    completions[0](result);
    await Promise.all([first, second]);
  });
  expect(hook.result.current.incoming).toEqual(otherResult);
  hook.unmount();
  const restored = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  await waitFor(() => expect(restored.result.current.incoming).toEqual(result));
  restored.rerender({ ...args, context: other });
  expect(restored.result.current.incoming).toEqual(otherResult);
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(2);
});
it('stale purchase and apply callbacks cannot act on a different visible parent', async () => {
  const hook = renderHook(
    (props: typeof args) => useMoveStepSuggestions(props),
    { initialProps: args },
  );
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => hook.result.current.reroll(1));
  const buyOldParent = hook.result.current.reroll;
  const applyOldParent = hook.result.current.applyIncoming;
  hook.rerender({ ...args, context: other });
  await act(async () => {
    await buyOldParent(1);
    expect(await applyOldParent()).toBeNull();
  });
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
  expect(hook.result.current.hints).toBeNull();
  hook.rerender(args);
  expect(hook.result.current.incoming).toEqual(result);
});

it('does not charge again while a delivered set is still waiting to be applied', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  const staleConfirm = hook.result.current.reroll;
  await act(async () => staleConfirm(1));
  await act(async () => staleConfirm(1));
  expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
  expect(hook.result.current.incoming).toEqual(result);
});
it('keeps existing choices and staged delivery when persisting explicit application fails', async () => {
  const hook = renderHook(() => useMoveStepSuggestions(args));
  await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
  await act(async () => hook.result.current.reroll(1));
  await act(async () => hook.result.current.applyIncoming());
  const second = {
    ...result,
    operationId: 'second',
    intentHints: hints.map((hint) => ({ ...hint, id: `next-${hint.id}` })),
  };
  jest.mocked(rerollMoveStepSuggestions).mockResolvedValueOnce(second);
  await act(async () => hook.result.current.reroll(1));
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('Disk full'));
  await act(async () => {
    expect(await hook.result.current.applyIncoming()).toBeNull();
  });
  expect(hook.result.current.hints).toEqual(result);
  expect(hook.result.current.incoming).toEqual(second);
  expect(hook.result.current.journalReady).toBe(false);
});
it.each(['idempotency_conflict', 'context_conflict'])(
  'preserves the original purchase on %s instead of allowing a new charge',
  async (code) => {
    jest
      .mocked(rerollMoveStepSuggestions)
      .mockRejectedValueOnce(
        new MoveStepRequestError(code, 'Check the original purchase'),
      );
    const hook = renderHook(() => useMoveStepSuggestions(args));
    await waitFor(() => expect(hook.result.current.journalReady).toBe(true));
    await act(async () => hook.result.current.reroll(1));
    expect(hook.result.current.purchase?.idempotencyKey).toBe('step-key-1');
    await act(async () => hook.result.current.reroll(1));
    expect(rerollMoveStepSuggestions).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.retryPurchase());
    expect(rerollMoveStepSuggestions).toHaveBeenLastCalledWith({
      ...context,
      expectedCredits: 1,
      idempotencyKey: 'step-key-1',
    });
    expect(hook.result.current.incoming).toEqual(result);
  },
);
