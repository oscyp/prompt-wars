import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RoundMoveReview from '@/components/battle/RoundMoveReview';
import type { BattleRound } from '@/types/battle';
import { reviewedRounds } from '@/utils/appeals';
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
}));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const round = {
  id: 'recorded-round',
  round_number: 2,
  status: 'result_ready',
  situation_snapshot: {
    id: 'neon-1',
    catalogVersion: 1,
    environmentId: 'neon-nexus',
    text: 'A shared platform scene.',
  },
  judge_payload: {
    frozen_inputs: {
      player_one: {
        text: 'First recorded move.',
        moveType: 'attack',
        wordCount: 3,
      },
      player_two: {
        text: 'Second recorded move.',
        moveType: 'defense',
        wordCount: 3,
      },
    },
  },
} as BattleRound;
it('keeps unresolved prompts hidden even when a stale payload exists', () => {
  const screen = render(
    <RoundMoveReview
      round={{ ...round, status: 'waiting_for_prompts' }}
      isPlayerOne={false}
    />,
  );
  expect(screen.queryByText('Second recorded move.')).toBeNull();
  expect(screen.queryByText('Review moves')).toBeNull();
});
it('preserves recorded moves after an appeal while showing only the reviewed verdict and scores', () => {
  const original = {
    ...round,
    judge_payload: {
      ...round.judge_payload,
      explanation: 'Original verdict.',
      aggregation: 'third_run' as const,
    },
  };
  const reviewedJudge = {
    explanation: 'Reviewed verdict.',
    combat: {
      playerOneScore: 32,
      playerTwoScore: 38,
      playerOneDamage: 5,
      playerTwoDamage: 11,
      scoreGap: 6,
    },
  };
  const [reviewed] = reviewedRounds(
    [original],
    {
      rounds: [
        {
          roundId: round.id,
          judge: reviewedJudge,
          playerOneScore: 32,
          playerTwoScore: 38,
        },
      ],
    },
    'player-one',
    'player-two',
  );
  expect(reviewed.judge_payload?.frozen_inputs).toBe(
    round.judge_payload?.frozen_inputs,
  );
  expect(reviewed.judge_payload?.combat).toEqual(reviewedJudge.combat);
  expect(reviewed.judge_payload?.aggregation).toBeUndefined();
  expect(reviewed.player_two_score).toBe(38);
  const screen = render(
    <RoundMoveReview round={reviewed} isPlayerOne={false} />,
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Review moves · Round 2' }),
  );
  expect(screen.getByText('A shared platform scene.')).toBeTruthy();
  expect(
    screen.getByLabelText('Your move. Second recorded move.'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('Opponent’s move. First recorded move.'),
  ).toBeTruthy();
  expect(screen.getByText('Reviewed verdict.')).toBeTruthy();
  expect(screen.queryByText('Original verdict.')).toBeNull();
});
it('reveals recorded moves on request and orients the viewer first', () => {
  const screen = render(<RoundMoveReview round={round} isPlayerOne={false} />);
  expect(screen.queryByText('Second recorded move.')).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Review moves · Round 2' }),
  );
  expect(screen.getByText('A shared platform scene.')).toBeTruthy();
  expect(
    screen.getByLabelText('Your move. Second recorded move.'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('Opponent’s move. First recorded move.'),
  ).toBeTruthy();
});
