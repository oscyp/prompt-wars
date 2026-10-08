import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ResultScreen from '@/app/(battle)/result';
import { requestVideoUpgrade } from '@/utils/monetization';

const mockAuth = { user: { id: 'me' } };
const mockRefetch = jest.fn();
const mockPlayer = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  pause: jest.fn(),
  play: jest.fn(),
  muted: false,
  loop: true,
  volume: 0.35,
  audioMixingMode: 'doNotMix',
};
const mockAudio = { stopMusic: jest.fn() };
const mockState = {
  battle: {
    id: 'battle',
    status: 'completed',
    mode: 'practice',
    player_one_id: 'me',
    player_two_id: 'them',
    winner_id: 'me',
  },
  videoJob: null,
  refetch: mockRefetch,
  format: 'single',
  series_score: { p1: 0, p2: 0 },
  rounds: [],
};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ battleId: 'battle' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: (
    _source: unknown,
    setup: (player: typeof mockPlayer) => void,
  ) => {
    setup(mockPlayer);
    return mockPlayer;
  },
}));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/BattleAudioProvider', () => ({
  useBattleAudio: () => mockAudio,
}));
jest.mock('@/hooks/useRealtimeBattle', () => ({
  useRealtimeBattle: () => mockState,
}));
jest.mock('@/hooks/useBattleCharacters', () => ({
  useBattleCharacters: () => ({
    p1: { name: 'Mira', archetype: 'mystic' },
    p2: { name: 'Forge', archetype: 'titan' },
    portraitsResolved: true,
  }),
}));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ credits: 10, loading: false, error: false }),
}));
jest.mock('@/hooks/useBattleAppeal', () => ({ useBattleAppeal: () => ({}) }));
jest.mock('@/hooks/useResultMediaRecovery', () => ({
  useResultMediaRecovery: () => ({
    videoUrl: null,
    playbackError: null,
    reportPlaybackError: jest.fn(),
  }),
}));
jest.mock('@/hooks/useComposerResultTelemetry', () => ({
  useComposerResultTelemetry: () => jest.fn(),
}));
jest.mock('@/utils/monetization', () => ({ requestVideoUpgrade: jest.fn() }));
jest.mock('@/utils/battleAttention', () => ({
  markBattleResultRead: jest.fn(async () => {}),
}));
jest.mock('@/components', () => ({ ReportBlockSheet: () => null }));
jest.mock('@/components/reveal', () => ({ RevealSequence: () => null }));
jest.mock('@/components/TutorialCoach', () => () => null);
jest.mock('@/components/ResultShareExport', () => () => null);
jest.mock('@/components/BattleAppealPanel', () => ({
  BattleAppealPanel: () => null,
}));
jest.mock('@/components/battle/BattleBackdrop', () => () => null);
jest.mock('@/components/battle/ResultVerdict', () => ({
  __esModule: true,
  default: () => null,
  resultFinalHp: () => null,
}));
jest.mock('@/components/battle/ResultDetails', () => () => null);
jest.mock('@/components/battle/ResultMedia', () => () => null);
jest.mock('@/components/sheets/BottomSheet', () => ({
  __esModule: true,
  default: ({
    visible,
    children,
    footer,
  }: {
    visible: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
  }) =>
    visible ? (
      <>
        {children}
        {footer}
      </>
    ) : null,
}));

const originalQuote = {
  can_upgrade: true,
  method: 'credit' as const,
  cost_credits: 1,
  cinematic_profile: 'plus' as const,
  target_duration_seconds: 20,
  duration_policy_version: 'cinematics-v3',
};
const changedQuote = {
  ...originalQuote,
  cinematic_profile: 'standard' as const,
  target_duration_seconds: 12,
  cost_credits: 2,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user.id = 'me';
  jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue('1');
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('configures a silent preview without interrupting other audio or changing native volume', async () => {
  render(<ResultScreen />);
  await waitFor(() => expect(mockAudio.stopMusic).toHaveBeenCalled());
  expect(mockPlayer.muted).toBe(true);
  expect(mockPlayer.audioMixingMode).toBe('auto');
  expect(mockPlayer.volume).toBe(0.35);
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test('keeps a changed duration and cost open for another explicit confirmation', async () => {
  (requestVideoUpgrade as jest.Mock)
    .mockResolvedValueOnce({
      success: true,
      can_upgrade: true,
      entitlement_check: originalQuote,
    })
    .mockResolvedValueOnce({
      success: true,
      can_upgrade: false,
      quote_changed: true,
      entitlement_check: changedQuote,
    })
    .mockResolvedValueOnce({ success: true, video_job_id: 'new-job' });
  const view = render(<ResultScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Get the cinematic video' }),
  );
  await view.findByText('20-second cinematic');
  fireEvent.press(view.getByRole('button', { name: 'Get the video' }));
  await view.findByText('12-second cinematic');
  expect(mockRefetch).not.toHaveBeenCalled();
  expect(requestVideoUpgrade).toHaveBeenCalledTimes(2);
  expect(Alert.alert).toHaveBeenCalledWith(
    'Cinematic quote changed',
    expect.stringContaining('Nothing was spent.'),
  );
  await act(async () =>
    fireEvent.press(view.getByRole('button', { name: 'Get the video' })),
  );
  expect(requestVideoUpgrade).toHaveBeenLastCalledWith(
    'battle',
    true,
    undefined,
    changedQuote,
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(view.queryByText('12-second cinematic')).toBeNull();
});

test('ignores a quote response after the viewing account changes', async () => {
  let resolvePreview: (response: unknown) => void = () => {};
  (requestVideoUpgrade as jest.Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePreview = resolve;
    }),
  );
  const view = render(<ResultScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Get the cinematic video' }),
  );
  mockAuth.user.id = 'other';
  view.rerender(<ResultScreen />);
  await act(async () =>
    resolvePreview({
      success: true,
      can_upgrade: true,
      entitlement_check: originalQuote,
    }),
  );
  await waitFor(() =>
    expect(view.queryByText('20-second cinematic')).toBeNull(),
  );
});

test('prevents confirmation when the refreshed funding quote is unavailable', async () => {
  (requestVideoUpgrade as jest.Mock)
    .mockResolvedValueOnce({
      success: true,
      can_upgrade: true,
      entitlement_check: originalQuote,
    })
    .mockResolvedValueOnce({
      success: true,
      can_upgrade: false,
      quote_changed: true,
      entitlement_check: {
        ...changedQuote,
        can_upgrade: false,
        method: 'none',
      },
    });
  const view = render(<ResultScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Get the cinematic video' }),
  );
  await view.findByText('20-second cinematic');
  fireEvent.press(view.getByRole('button', { name: 'Get the video' }));
  await view.findByText('12-second cinematic');
  expect(view.getByRole('button', { name: 'Get the video' })).toBeDisabled();
});

test('clears an open confirmation when the viewing account changes', async () => {
  (requestVideoUpgrade as jest.Mock).mockResolvedValueOnce({
    success: true,
    can_upgrade: true,
    entitlement_check: originalQuote,
  });
  const view = render(<ResultScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Get the cinematic video' }),
  );
  await view.findByText('20-second cinematic');
  mockAuth.user.id = 'other';
  view.rerender(<ResultScreen />);
  expect(view.queryByText('20-second cinematic')).toBeNull();
});
