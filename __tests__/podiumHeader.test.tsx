/**
 * The podium: three accessible cards, the winner in the middle, each read as
 * "1st place: Name, rating N"; nothing for fewer than three rows.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import PodiumHeader, { PODIUM_ORDER } from '@/components/PodiumHeader';
import { NO_COSMETICS } from '@/utils/cosmetics';
import type { PublicPlayerMap } from '@/utils/publicPlayers';
import type { RankingRow } from '@/utils/rankingsView';

const row = (rank: number, name: string, rating: number): RankingRow => ({
  id: `r${rank}`,
  profile_id: `p${rank}`,
  rank,
  rating,
  wins: 10,
  losses: 2,
  draws: 0,
  profile: { username: name.toLowerCase(), display_name: name },
});

const TOP = [row(1, 'Ace', 1512.6), row(2, 'Bea', 1490), row(3, 'Cal', 1470)];

describe('PodiumHeader', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders one accessible card per place with rank, name and rating', () => {
    const { getByLabelText, getByText } = render(<PodiumHeader rows={TOP} />);
    const first = getByLabelText('1st place: Ace, rating 1513');
    expect(first.props.accessible).toBe(true);
    getByLabelText('2nd place: Bea, rating 1490');
    getByLabelText('3rd place: Cal, rating 1470');
    getByText('#1');
    getByText('1513');
  });

  it('lays the cards out 2nd, 1st, 3rd', () => {
    const { getAllByTestId } = render(<PodiumHeader rows={TOP} />);
    const order = getAllByTestId(/^podium-\d$/).map((n) => n.props.testID);
    expect(order).toEqual(['podium-2', 'podium-1', 'podium-3']);
    expect(PODIUM_ORDER).toEqual([1, 0, 2]);
  });

  it('marks the viewer', () => {
    const { getByLabelText, getByText } = render(
      <PodiumHeader rows={TOP} viewerId="p2" />,
    );
    getByLabelText('2nd place: Bea (you), rating 1490');
    getByText('You');
  });

  it('accepts the public-players map for archetype and colour', () => {
    const players: PublicPlayerMap = new Map([
      [
        'p1',
        {
          archetype: 'titan',
          signatureColor: '#EF4444',
          cosmetics: NO_COSMETICS,
        },
      ],
    ]);
    const { getByLabelText } = render(
      <PodiumHeader rows={TOP} players={players} />,
    );
    getByLabelText("Ace's archetype");
    getByLabelText("Bea's archetype");
  });

  it('renders nothing for fewer than three rows', () => {
    const { toJSON } = render(<PodiumHeader rows={TOP.slice(0, 2)} />);
    expect(toJSON()).toBeNull();
  });
});
