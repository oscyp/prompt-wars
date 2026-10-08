import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RoundResultScreen from '@/app/(battle)/round-result';

const mockRouter = { replace: jest.fn() };
const mockAuth = { user: { id: 'player-one' } };
const mockAudio = { stopMusic: jest.fn() };
const mockLeave = {
  park: jest.fn(),
  confirmLeave: jest.fn(),
  exitTo: jest.fn((navigate: () => void) => navigate()),
  isLeaving: false,
  canForfeit: true,
};
const scores = {
  clarity: 8,
  originality: 7,
  specificity: 9,
  theme_fit: 8,
  archetype_fit: 9,
  dramatic_potential: 7,
};
function battleState() {
  return {
    battle: {
      id: 'battle-one',
      status: 'waiting_prompts',
      mode: 'practice',
      theme: 'The calm before the storm',
      best_of: 3,
      player_one_id: 'player-one',
      player_two_id: 'player-two',
      is_player_two_bot: true,
    },
    prompts: [],
    videoJobsByRound: {},
    hp_max: { p1: 100, p2: 100 },
    current_round: 2,
    format: 'bo3',
    series_score: { p1: 1, p2: 0 },
    refetch: jest.fn(),
    rounds: [
      {
        id: 'round-one',
        round_number: 1,
        status: 'result_ready',
        round_winner_id: 'player-one',
        is_draw: false,
        is_ko: false,
        player_one_score: 51 as number | null,
        player_two_score: 19.125 as number | null,
        player_one_hp_after: 100,
        player_two_hp_after: 40,
        player_one_damage: 0,
        player_two_damage: 60,
        move_type_modifier_player_one: 0.1,
        move_type_modifier_player_two: -0.1,
        stat_modifier_player_one: 0.025,
        stat_modifier_player_two: -0.025,
        judge_payload: {
          player_one_normalized_scores: scores,
          player_two_normalized_scores: { ...scores, clarity: 4 },
          move_type_matchup: { player_one: 'attack', player_two: 'finisher' },
          explanation: 'A concrete shield turns the storm into protection.',
        },
      },
    ],
  };
}
let mockRealtime = battleState();
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ battleId: 'battle-one', round: '1' }),
}));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/BattleAudioProvider', () => ({
  useBattleAudio: () => mockAudio,
}));
jest.mock('@/hooks/useRealtimeBattle', () => ({
  useRealtimeBattle: () => mockRealtime,
}));
jest.mock('@/hooks/useBattleCharacters', () => ({
  useBattleCharacters: () => ({
    p1: { name: 'Mira', archetype: 'mystic', signatureColor: '#AA99FF' },
    p2: { name: 'Forge', archetype: 'titan', signatureColor: '#FF3344' },
  }),
}));
jest.mock('@/hooks/useBattleExitGuard', () => ({
  useBattleExitGuard: () => mockLeave,
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));
jest.mock('@/utils/haptics', () => ({
  hapticVictory: jest.fn(),
  hapticDefeat: jest.fn(),
  hapticDraw: jest.fn(),
  hapticHpLoss: jest.fn(),
}));
jest.mock('@/components/BattleOpponentSafety', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user.id = 'player-one';
  mockRealtime = battleState();
});

it('shows scores, modifiers, rubric and judge notes immediately without an expansion', () => {
  const ui = render(<RoundResultScreen />);
  for (const title of [
    'Round score',
    'Round modifiers',
    'Scores',
    'Judge’s verdict',
  ]) {
    expect(ui.getByRole('header', { name: title })).toBeTruthy();
  }
  expect(ui.queryByRole('button', { name: /battle details/i })).toBeNull();
  expect(
    ui.getByText('A concrete shield turns the storm into protection.'),
  ).toBeTruthy();
  expect(ui.getByLabelText('You, round score 51')).toBeTruthy();
  expect(
    ui.getByLabelText('AI opponent · Practice, round score 19.125'),
  ).toBeTruthy();
  expect(ui.getByLabelText('You received 0 damage')).toBeTruthy();
  expect(ui.getByLabelText('Opponent received 60 damage')).toBeTruthy();
  expect(ui.queryByText(/Damage dealt:|Damage taken:|You dealt/)).toBeNull();
});

it('keeps the viewer on the left for a human player-two result', () => {
  mockAuth.user.id = 'player-two';
  mockRealtime.battle.is_player_two_bot = false;
  const ui = render(<RoundResultScreen />);
  expect(ui.getByLabelText('You, round score 19.125')).toBeTruthy();
  expect(ui.getByLabelText('Opponent, round score 51')).toBeTruthy();
  expect(
    ui.getByLabelText('Clarity: you 4.0 out of 10, opponent 8.0'),
  ).toBeTruthy();
  expect(ui.getByLabelText('You received 60 damage')).toBeTruthy();
});

it('omits unavailable scores but keeps an authoritative zero', () => {
  mockRealtime.rounds[0].player_one_score = null;
  mockRealtime.rounds[0].player_two_score = 0;
  const ui = render(<RoundResultScreen />);
  expect(ui.queryByLabelText(/^You, round score/)).toBeNull();
  expect(
    ui.getByLabelText('AI opponent · Practice, round score 0'),
  ).toBeTruthy();
  mockRealtime = battleState();
  mockRealtime.rounds[0].player_one_score = null;
  mockRealtime.rounds[0].player_two_score = null;
  ui.rerender(<RoundResultScreen />);
  expect(ui.queryByRole('header', { name: 'Round score' })).toBeNull();
});

it('continues through the existing exit guard and keeps parking independent', () => {
  const ui = render(<RoundResultScreen />);
  fireEvent.press(ui.getByRole('button', { name: 'Continue to round 2' }));
  expect(mockLeave.exitTo).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    '/(battle)/prompt-entry?battleId=battle-one&round=2',
  );
  fireEvent.press(ui.getByRole('button', { name: 'Arena' }));
  expect(mockLeave.park).toHaveBeenCalledTimes(1);
  expect(mockLeave.confirmLeave).not.toHaveBeenCalled();
});

it('routes completed series to the existing final result', () => {
  mockRealtime.battle.status = 'completed';
  render(<RoundResultScreen />);
  expect(mockRouter.replace).toHaveBeenCalledWith(
    '/(battle)/result?battleId=battle-one',
  );
});

it('announces the completed bot-won round instead of waiting for the judge', () => {
  Object.assign(mockRealtime.battle, { player_two_id: null });
  Object.assign(mockRealtime.rounds[0], {
    round_winner_id: null,
    judge_payload: {
      ...mockRealtime.rounds[0].judge_payload,
      combat: { winner: 2 },
    },
  });
  const ui = render(<RoundResultScreen />);
  expect(ui.getByText(/Round 1 lost/i)).toBeTruthy();
  expect(ui.queryByText('Waiting for the judge…')).toBeNull();
});
