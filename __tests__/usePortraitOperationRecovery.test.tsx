import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePortraitOperationRecovery } from '@/hooks/usePortraitOperationRecovery';
import {
  checkPortraitOperation,
  dismissPortraitOperation,
  readPortraitOperation,
  startPortraitOperation,
} from '@/utils/portraitOperations';

jest.mock('@/utils/portraitOperations', () => ({
  checkPortraitOperation: jest.fn(),
  dismissPortraitOperation: jest.fn(),
  readPortraitOperation: jest.fn(),
  startPortraitOperation: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));

const read = readPortraitOperation as jest.Mock;
const check = checkPortraitOperation as jest.Mock;
const start = startPortraitOperation as jest.Mock;
const dismiss = dismissPortraitOperation as jest.Mock;
const pending = {
  accountId: 'alice',
  characterId: 'fighter',
  mode: 'render',
  requestKey: 'stable',
  startedAt: 'now',
  status: 'pending',
};

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(null);
  check.mockImplementation(async (operation) => ({
    operation,
    result: null,
    error: null,
  }));
});

it('hydrates and checks a saved request without starting paid work', async () => {
  read.mockResolvedValue(pending);
  const { result } = renderHook(() =>
    usePortraitOperationRecovery('alice', 'fighter'),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.operation).toEqual(pending);
  expect(result.current.blocked).toBe(true);
  await act(async () => {
    await result.current.checkStatus();
  });
  expect(check).toHaveBeenCalledWith(pending);
  expect(start).not.toHaveBeenCalled();
});

it('keeps a recovered success blocked until explicit acknowledgement', async () => {
  const success = { ...pending, status: 'succeeded', portraitId: 'image' };
  read.mockResolvedValue(success);
  dismiss.mockResolvedValue(true);
  const { result } = renderHook(() =>
    usePortraitOperationRecovery('alice', 'fighter'),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.blocked).toBe(true);
  await act(async () => {
    await result.current.dismiss();
  });
  expect(result.current.operation).toBeNull();
  expect(result.current.blocked).toBe(false);
});

it('ignores hydration from a previous account even when it resolves late', async () => {
  let resolve!: (value: unknown) => void;
  read.mockImplementation((account) =>
    account === 'alice'
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(null),
  );
  const { result, rerender } = renderHook<
    ReturnType<typeof usePortraitOperationRecovery>,
    { account: string }
  >(({ account }) => usePortraitOperationRecovery(account, 'fighter'), {
    initialProps: { account: 'alice' },
  });
  rerender({ account: 'bob' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    resolve(pending);
  });
  expect(result.current.operation).toBeNull();
  expect(check).not.toHaveBeenCalledWith(pending);
  expect(start).not.toHaveBeenCalled();
});

it('failed hydration blocks paid work until a successful local retry', async () => {
  read.mockRejectedValueOnce(new Error('disk unavailable'));
  const { result } = renderHook(() =>
    usePortraitOperationRecovery('alice', 'fighter'),
  );
  await waitFor(() => expect(result.current.error).toBe('disk unavailable'));
  await act(async () => {
    await result.current.start('render');
  });
  expect(start).not.toHaveBeenCalled();
  expect(result.current.blocked).toBe(true);
  await act(async () => {
    await result.current.checkStatus();
  });
  expect(result.current.blocked).toBe(false);
});

it('preserves an ambiguous start and passes the previous portrait context durably', async () => {
  start.mockResolvedValue({
    operation: pending,
    result: null,
    error: 'offline',
  });
  const { result } = renderHook(() =>
    usePortraitOperationRecovery('alice', 'fighter'),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.start('random', { previousFighterId: 'old' });
  });
  expect(start).toHaveBeenCalledWith('alice', 'fighter', 'random', {
    previousFighterId: 'old',
  });
  expect(result.current.operation).toEqual(pending);
  expect(result.current.blocked).toBe(true);
  await act(async () => {
    await result.current.start('random');
  });
  expect(start).toHaveBeenCalledTimes(1);
});

it('does not expose an old account result after switching away and back', async () => {
  let complete!: (value: unknown) => void;
  start.mockImplementation(
    () =>
      new Promise((done) => {
        complete = done;
      }),
  );
  const { result, rerender } = renderHook<
    ReturnType<typeof usePortraitOperationRecovery>,
    { account: string }
  >(({ account }) => usePortraitOperationRecovery(account, 'fighter'), {
    initialProps: { account: 'alice' },
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let request!: Promise<unknown>;
  act(() => {
    request = result.current.start('render');
  });
  rerender({ account: 'bob' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  rerender({ account: 'alice' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    complete({
      operation: { ...pending, status: 'succeeded' },
      result: null,
      error: null,
    });
    await request;
  });
  expect(result.current.operation).toBeNull();
  expect(result.current.dispatching).toBe(false);
});
