import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import MatchmakingScreen from '@/app/(battle)/matchmaking';
import { startMatchmaking, leaveBattle } from '@/utils/battles';
const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ mode: 'ranked' }),
}));
jest.mock('@/utils/battles', () => ({
  startMatchmaking: jest.fn(),
  hasOpponent: () => true,
  leaveBattle: jest.fn(),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: { id: 'fighter' }, error: null }),
        single: async () => ({ data: { player_two_id: 'other' }, error: null }),
      };
      return q;
    },
  },
}));
jest.mock('@/providers/AuthProvider', () => {
  const auth = { user: { id: 'owner' } };
  return { useAuth: () => auth };
});
jest.mock('@/providers/BattleAudioProvider', () => {
  const audio = { playSound: jest.fn() };
  return { useBattleAudio: () => audio };
});
jest.mock('@/components/FighterEntrance', () => () => null);
jest.mock('@/components/ArenaTips', () => () => null);
jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());
test('parking while the server request is pending never navigates late or cancels the battle', async () => {
  let resolve!: (result: unknown) => void;
  (startMatchmaking as jest.Mock).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const screen = render(<MatchmakingScreen />);
  await waitFor(() => expect(startMatchmaking).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByLabelText('Return to Arena; keep search active'));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/home');
  await act(async () => {
    resolve({ battle_id: 'created', matched: true });
  });
  await act(async () => jest.runOnlyPendingTimers());
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(leaveBattle).not.toHaveBeenCalled();
});
test('unmount during pending request cannot schedule a later navigation', async () => {
  let resolve!: (result: unknown) => void;
  (startMatchmaking as jest.Mock).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const screen = render(<MatchmakingScreen />);
  await waitFor(() => expect(startMatchmaking).toHaveBeenCalledTimes(1));
  screen.unmount();
  await act(async () => {
    resolve({ battle_id: 'created', matched: true });
  });
  await act(async () => jest.runOnlyPendingTimers());
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
