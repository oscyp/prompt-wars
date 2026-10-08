import { act, renderHook } from '@testing-library/react-native';
import { useMoveCompletion } from '@/hooks/useMoveCompletion';
import { completeMoveSuggestion } from '@/utils/battles';
import { composerReducer, createComposerState } from '@/utils/promptComposer';
jest.mock('@/utils/battles', () => ({ completeMoveSuggestion: jest.fn() }));
const makeState = (text = 'I pull the cable') =>
  composerReducer(createComposerState(), {
    type: 'change',
    change: { type: 'action', text, id: null, moveType: 'attack' },
  });
const hints = [1, 2, 3].map((i) => ({
  id: `i${i}`,
  text: `to interrupt their step ${i}`,
}));
beforeEach(() => jest.clearAllMocks());
it('does not generate while typing, reuses a completed context after Back/Next', async () => {
  jest
    .mocked(completeMoveSuggestion)
    .mockResolvedValue({
      status: 'ready',
      remainingAdaptations: 5,
      intentHints: hints,
    });
  const onHints = jest.fn();
  const h = renderHook(() =>
    useMoveCompletion({
      battleId: 'b',
      round: 1,
      enabled: true,
      state: makeState(),
      onHints,
    }),
  );
  expect(completeMoveSuggestion).not.toHaveBeenCalled();
  await act(async () => h.result.current.request('intent'));
  await act(async () => h.result.current.request('intent'));
  expect(completeMoveSuggestion).toHaveBeenCalledTimes(1);
  expect(h.result.current.remaining).toBe(5);
});
it('a late result cannot deliver hints to a different parent', async () => {
  let finish!: (v: any) => void;
  jest.mocked(completeMoveSuggestion).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onHints = jest.fn();
  const h = renderHook(
    ({ state }: { state: ReturnType<typeof makeState> }) =>
      useMoveCompletion({
        battleId: 'b',
        round: 1,
        enabled: true,
        state,
        onHints,
      }),
    { initialProps: { state: makeState() } },
  );
  let pending!: Promise<void>;
  act(() => {
    pending = h.result.current.request('intent');
  });
  h.rerender({ state: makeState('I step behind the support') });
  await act(async () => {
    finish({ status: 'ready', intentHints: hints });
    await pending;
  });
  expect(onHints).not.toHaveBeenCalled();
});

it('rejects a late completion after changing battle with the same situation context', async () => {
  let finish!: (value: any) => void;
  jest.mocked(completeMoveSuggestion).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onHints = jest.fn();
  const h = renderHook(
    ({ battleId }: { battleId: string }) =>
      useMoveCompletion({
        accountId: 'account',
        battleId,
        round: 1,
        enabled: true,
        state: makeState(),
        onHints,
      }),
    { initialProps: { battleId: 'first' } },
  );
  let pending!: Promise<void>;
  act(() => {
    pending = h.result.current.request('intent');
  });
  h.rerender({ battleId: 'second' });
  await act(async () => {
    finish({ status: 'ready', intentHints: hints, remainingAdaptations: 5 });
    await pending;
  });
  expect(onHints).not.toHaveBeenCalled();
  expect(h.result.current.remaining).toBeNull();
});

it('stops pending polling when the account or battle scope changes', async () => {
  jest.useFakeTimers();
  jest.mocked(completeMoveSuggestion).mockResolvedValue({ status: 'pending' });
  const h = renderHook(
    ({ battleId }: { battleId: string }) =>
      useMoveCompletion({
        accountId: 'a',
        battleId,
        round: 1,
        enabled: true,
        state: makeState(),
        onHints: jest.fn(),
      }),
    { initialProps: { battleId: 'first' } },
  );
  await act(async () => h.result.current.request('intent'));
  h.rerender({ battleId: 'second' });
  await act(async () => jest.advanceTimersByTime(1500));
  expect(completeMoveSuggestion).toHaveBeenCalledTimes(1);
  h.unmount();
  jest.useRealTimers();
});

it('an old response cannot unlock a same-parent operation in the next battle', async () => {
  let first!: (value: any) => void;
  let second!: (value: any) => void;
  jest
    .mocked(completeMoveSuggestion)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        second = resolve;
      }),
    );
  const h = renderHook(
    ({ battleId }: { battleId: string }) =>
      useMoveCompletion({
        accountId: 'a',
        battleId,
        round: 1,
        enabled: true,
        state: makeState(),
        onHints: jest.fn(),
      }),
    { initialProps: { battleId: 'first' } },
  );
  let oldRequest!: Promise<void>;
  act(() => {
    oldRequest = h.result.current.request('intent');
  });
  h.rerender({ battleId: 'second' });
  let newRequest!: Promise<void>;
  act(() => {
    newRequest = h.result.current.request('intent');
  });
  await act(async () => {
    first({ status: 'ready', intentHints: hints });
    await oldRequest;
  });
  await act(async () => h.result.current.request('intent'));
  expect(completeMoveSuggestion).toHaveBeenCalledTimes(2);
  await act(async () => {
    second({ status: 'ready', intentHints: hints });
    await newRequest;
  });
  h.unmount();
});
