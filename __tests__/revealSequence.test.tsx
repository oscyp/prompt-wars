/**
 * The series reveal as a whole: which beat opens, how Skip and Next move it,
 * and that the choreography drops beats the data cannot support. Animated
 * values are not asserted (Reanimated is mocked); words and controls are.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RevealSequence } from '@/components/reveal';
import type { RevealSequenceProps } from '@/components/reveal';
import {
  REVEAL_DONE_LABEL,
  REVEAL_NEXT_LABEL,
  REVEAL_SKIP_LABEL,
  REVEAL_TAP_HINT,
  type RevealModel,
  type RevealSide,
} from '@/utils/revealBeats';
import { useReducedMotion } from '@/hooks/useReducedMotion';

jest.mock('@/utils/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticVictory: jest.fn(),
  hapticDefeat: jest.fn(),
  hapticDraw: jest.fn(),
  hapticImpact: jest.fn(),
  hapticSuccess: jest.fn(),
}));
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const side = (over: Partial<RevealSide> = {}): RevealSide => ({
  profileId: 'me',
  name: 'Rook',
  archetype: 'titan',
  signatureColor: '#EF4444',
  battleCry: 'Steel meets bone.',
  moveType: 'attack',
  promptExcerpt: 'A hammer falls from a clear sky.',
  rubric: { clarity: 8, originality: 7 },
  portraitUrl: null,
  ...over,
});

const model: RevealModel = {
  me: side(),
  them: side({
    profileId: 'them',
    name: 'Vex',
    archetype: 'trickster',
    moveType: 'defense',
    rubric: { clarity: 6, originality: 5 },
  }),
  winnerProfileId: 'me',
  isDraw: false,
  isKo: true,
  judgeWhy: 'Rook’s prompt landed harder.',
  animationPreset: 'attack_fast',
  winnerColor: '#EF4444',
};

const baseProps: RevealSequenceProps = {
  model,
  format: 'bo3',
  outcome: 'won',
  mine: 2,
  theirs: 1,
  isBot: false,
  mode: 'ranked',
  myProfileId: 'me',
  portraits: {
    meFighterUrl: null,
    meAvatarUrl: null,
    themFighterUrl: null,
    themAvatarUrl: null,
  },
  rating: { delta: 12, line: 'Rating +12', gated: false },
  reward: {
    credits_granted: 5,
    credit_reasons: ['win_streak'],
    credits_eligible: true,
    win_streak_after: 3,
    best_win_streak: 3,
    streak_milestone: true,
    quests_advanced: [],
    quests_completed: [],
    mode: 'ranked',
  },
  battleCompleted: true,
  onDone: jest.fn(),
};

describe('RevealSequence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    (baseProps.onDone as jest.Mock).mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens on the verdict beat with the headline and the knockout stamp', () => {
    const { getByText, queryByText } = render(
      <RevealSequence {...baseProps} />,
    );
    getByText('You won the series 2–1');
    getByText('KNOCKOUT');
    getByText(REVEAL_TAP_HINT);
    expect(queryByText('Winner · Knockout')).toBeNull();
  });

  it('shows one progress dot per beat', () => {
    const { getAllByTestId, getByLabelText } = render(
      <RevealSequence {...baseProps} />,
    );
    expect(getAllByTestId('reveal-progress-dot')).toHaveLength(4);
    getByLabelText('Part 1 of 4');
  });

  it('Skip to summary ends the reveal once', () => {
    const { getByLabelText } = render(<RevealSequence {...baseProps} />);
    fireEvent.press(getByLabelText(REVEAL_SKIP_LABEL));
    expect(baseProps.onDone).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion, Next pages verdict → winner → judge → payoff → done', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { getByText, getByLabelText, queryByText, queryByLabelText } = render(
      <RevealSequence {...baseProps} />,
    );

    getByText('You won the series 2–1');
    expect(queryByText(REVEAL_TAP_HINT)).toBeNull();
    act(() => jest.advanceTimersByTime(60_000));
    // Nothing advanced on its own.
    getByText('You won the series 2–1');

    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    getByText('Winner · Knockout');
    getByText('Rook');
    getByText('“Steel meets bone.”');

    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    getByText('What the judge saw');
    getByText('“Rook’s prompt landed harder.”');

    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    getByText('Your rewards');
    expect(queryByLabelText(REVEAL_NEXT_LABEL)).toBeNull();

    fireEvent.press(getByLabelText(REVEAL_DONE_LABEL));
    expect(baseProps.onDone).toHaveBeenCalledTimes(1);
  });

  it('a tap on the stage advances', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { getByTestId, getByText } = render(
      <RevealSequence {...baseProps} />,
    );
    fireEvent.press(getByTestId('reveal-stage'));
    getByText('Winner · Knockout');
  });

  it('a draw has no winner beat', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const drawModel: RevealModel = {
      ...model,
      winnerProfileId: null,
      isDraw: true,
      isKo: false,
    };
    const { getAllByTestId, getByText, getByLabelText, queryByText } = render(
      <RevealSequence
        {...baseProps}
        model={drawModel}
        outcome="draw"
        mine={1}
        theirs={1}
      />,
    );
    expect(getAllByTestId('reveal-progress-dot')).toHaveLength(3);
    getByText('Series drawn 1–1');
    expect(queryByText('KNOCKOUT')).toBeNull();
    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    getByText('What the judge saw');
  });

  it('skips the judge beat when there is nothing for it to show', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const bare: RevealModel = {
      ...model,
      me: side({ rubric: null, promptExcerpt: null }),
      them: side({ profileId: 'them', rubric: null, promptExcerpt: null }),
      judgeWhy: null,
    };
    const { getAllByTestId, getByLabelText, getByText } = render(
      <RevealSequence {...baseProps} model={bare} />,
    );
    expect(getAllByTestId('reveal-progress-dot')).toHaveLength(3);
    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    getByText('Your rewards');
  });

  it('never renders an AI-generated disclosure badge', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { getByLabelText, queryByText } = render(
      <RevealSequence {...baseProps} />,
    );
    expect(queryByText(/AI[- ]GENERATED/i)).toBeNull();
    fireEvent.press(getByLabelText(REVEAL_NEXT_LABEL));
    expect(queryByText(/AI[- ]GENERATED/i)).toBeNull();
  });
});
