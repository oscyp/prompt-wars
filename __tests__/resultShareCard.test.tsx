/**
 * The card that gets exported as an image: it must carry the whole result on
 * its own, and it must not carry an AI disclosure (product decision).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import ResultShareCard, {
  KNOCKOUT_TAG,
  type ResultShareCardProps,
} from '@/components/ResultShareCard';

const props: ResultShareCardProps = {
  headline: 'You won the series 2–1',
  outcome: 'won',
  isKo: true,
  scoreLine: '2–1',
  me: { name: 'Rook', archetype: 'titan', avatarUrl: null },
  them: { name: 'Vex', archetype: 'trickster', avatarUrl: null },
  winnerSide: 'me',
  theme: 'Neon graveyard',
  ratingLine: 'Rating +12',
  accentColor: '#EF4444',
};

describe('ResultShareCard', () => {
  it('shows the headline, both names, the score, the theme and the rating', () => {
    const { getByText } = render(<ResultShareCard {...props} />);
    getByText('You won the series 2–1');
    getByText('Rook');
    getByText('Vex');
    getByText('2–1');
    getByText('Theme: Neon graveyard');
    getByText('Rating +12');
  });

  it('stamps a knockout only when there was one', () => {
    const ko = render(<ResultShareCard {...props} />);
    ko.getByText(KNOCKOUT_TAG);
    const points = render(<ResultShareCard {...props} isKo={false} />);
    expect(points.queryByText(KNOCKOUT_TAG)).toBeNull();
  });

  it('marks the winner with a trophy badge and says VS without a series score', () => {
    const { getAllByTestId, getByText } = render(
      <ResultShareCard {...props} scoreLine={null} />,
    );
    expect(getAllByTestId('share-card-winner-badge')).toHaveLength(1);
    getByText('VS');
  });

  it('has no winner badge on a draw', () => {
    const { queryAllByTestId } = render(
      <ResultShareCard
        {...props}
        outcome="draw"
        isKo={false}
        winnerSide={null}
        headline="Series drawn 1–1"
      />,
    );
    expect(queryAllByTestId('share-card-winner-badge')).toHaveLength(0);
  });

  it('is one accessible element that reads the whole result', () => {
    const { getByLabelText } = render(<ResultShareCard {...props} />);
    const card = getByLabelText(
      'You won the series 2–1. Knockout. Rook versus Vex, 2–1. Theme: Neon graveyard. Rating +12',
    );
    expect(card.props.accessible).toBe(true);
  });

  it('never renders an AI-generated disclosure', () => {
    const { queryByText } = render(<ResultShareCard {...props} />);
    expect(queryByText(/AI[- ]GENERATED/i)).toBeNull();
  });
});
