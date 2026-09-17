import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBattleAppeal } from '@/hooks/useBattleAppeal';
import { readBattleAppeal, reviewedRounds } from '@/utils/appeals';
import type { BattleRound } from '@/types/battle';
jest.mock('@/utils/appeals', () => ({
  ...jest.requireActual('@/utils/appeals'),
  readBattleAppeal: jest.fn(),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
const read = readBattleAppeal as jest.Mock;
beforeEach(() => read.mockReset());
it('restores final status and refreshes authoritative result after remount', async () => {
  read.mockResolvedValue({
    appeal: { id: 'appeal', review_status: 'overturned' },
    available: false,
    reason: null,
  });
  const changed = jest.fn();
  const first = renderHook(() => useBattleAppeal('battle', 'me', changed));
  await waitFor(() =>
    expect(first.result.current.data?.appeal?.review_status).toBe('overturned'),
  );
  first.unmount();
  const second = renderHook(() => useBattleAppeal('battle', 'me', changed));
  await waitFor(() =>
    expect(second.result.current.data?.appeal?.id).toBe('appeal'),
  );
  expect(changed).toHaveBeenCalledTimes(2);
});
it('failed submit remains retryable and authoritative retry returns same durable appeal', async () => {
  read.mockResolvedValueOnce({ appeal: null, available: true, reason: null });
  const { result } = renderHook(() => useBattleAppeal('battle', 'me'));
  await waitFor(() => expect(result.current.data?.available).toBe(true));
  read.mockRejectedValueOnce(new Error('offline'));
  await act(() => result.current.submit());
  expect(result.current.error).toBe('offline');
  read.mockResolvedValueOnce({
    appeal: { id: 'same', review_status: 'pending' },
    available: false,
    reason: null,
  });
  await act(() => result.current.submit());
  expect(result.current.data?.appeal?.id).toBe('same');
  expect(result.current.error).toBeNull();
});
it('late account response cannot replace current appeal', async () => {
  let finish!: (data: unknown) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const { result, rerender } = renderHook<
    ReturnType<typeof useBattleAppeal>,
    { user: string }
  >(({ user }) => useBattleAppeal('battle', user), {
    initialProps: { user: 'a' },
  });
  read.mockResolvedValueOnce({
    appeal: { id: 'b', review_status: 'processing' },
    available: false,
    reason: null,
  });
  rerender({ user: 'b' });
  await waitFor(() => expect(result.current.data?.appeal?.id).toBe('b'));
  await act(async () =>
    finish({
      appeal: { id: 'a', review_status: 'pending' },
      available: false,
      reason: null,
    }),
  );
  expect(result.current.data?.appeal?.id).toBe('b');
});
it('review projects scores and HP while excluding rounds after earlier terminal verdict', () => {
  const old = [
    { id: 'r1', player_one_score: 100 },
    { id: 'r2', player_one_score: 100 },
  ] as BattleRound[];
  const projected = reviewedRounds(
    old,
    {
      rounds: [
        {
          roundId: 'r1',
          winner: 2,
          isDraw: false,
          isKo: true,
          playerOneScore: 20,
          playerTwoScore: 40,
          playerOneHpAfter: 0,
          playerTwoHpAfter: 100,
          playerOneDamage: 40,
          playerTwoDamage: 0,
          scoreGap: 20,
        },
      ],
    },
    'p1',
    'p2',
  );
  expect(projected).toHaveLength(1);
  expect(projected[0]).toMatchObject({
    player_one_score: 20,
    player_two_score: 40,
    player_one_hp_after: 0,
    round_winner_id: 'p2',
  });
  expect(old[0].player_one_score).toBe(100);
});
