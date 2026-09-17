import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RankingsScreen from '@/app/(tabs)/rankings';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { rankingRowLabel } from '@/utils/rankingsView';
import type { RankingRow } from '@/utils/rankingsView';
let mockRows: any[] = [];
let mockViewer: RankingRow | null = null;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 430, height: 900, scale: 3, fontScale: 1 })),
}));
beforeEach(() => {
  mockViewer = null;
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 430, height: 900, scale: 3, fontScale: 1 });
});
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTabClearance', () => ({ useTabClearance: () => 0 }));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
jest.mock('@/utils/publicPlayers', () => ({
  fetchPublicPlayers: async () => new Map(),
}));
jest.mock('@/components/PlayerSafetyActions', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let viewerQuery = false;
      const query: any = {
        select: () => query,
        eq: (column: string) => {
          if (column === 'profile_id') viewerQuery = true;
          return query;
        },
        order: () => query,
        maybeSingle: async () => ({
          data: {
            id: 'season',
            name: 'Season',
            starts_at: '2020-01-01',
            ends_at: '2099-01-01',
          },
          error: null,
        }),
        limit: async () => ({
          data:
            table === 'rankings'
              ? viewerQuery
                ? mockViewer
                  ? [mockViewer]
                  : []
                : mockRows
              : [],
          error: null,
        }),
      };
      return query;
    },
  },
}));
it.each([0, 1, 2, 3, 4])(
  'shows a truthful empty state for %i ranked players',
  async (count) => {
    mockRows = Array.from({ length: count }, (_, index) => ({
      id: `row-${index}`,
      profile_id: `player-${index}`,
      rank: index + 1,
      rating: 1500,
      wins: 1,
      losses: 0,
      draws: 0,
      profile: { username: `Player${index}` },
    }));
    const view = render(<RankingsScreen />);
    await waitFor(() =>
      expect(view.queryByLabelText('Loading the rankings')).toBeNull(),
    );
    expect(Boolean(view.queryByText('No rankings yet'))).toBe(count === 0);
    if (count) expect(view.getAllByText('Player0').length).toBeGreaterThan(0);
  },
);

const longPlayer = (id: string, name: string): RankingRow => ({
  id,
  profile_id: id,
  rank: 4,
  rating: 12345,
  wins: 123,
  losses: 45,
  draws: 6,
  profile: { username: name },
});

it.each([1, 2])(
  'reserves full identity width for %i players at 320 points and 2x text',
  async (count) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 });
    mockRows = Array.from({ length: count }, (_, index) =>
      longPlayer(`p${index}`, `Żaneta the patient strategist ${index}`),
    );
    const view = render(<RankingsScreen />);
    await waitFor(() =>
      expect(view.queryByLabelText('Loading the rankings')).toBeNull(),
    );
    for (const row of mockRows) {
      const card = view.getByLabelText(rankingRowLabel(row, false));
      expect(StyleSheet.flatten(card.props.style).flexDirection).toBe('column');
      expect(
        StyleSheet.flatten(
          view.getByTestId(`ranking-identity-${row.profile_id}`).props.style,
        ),
      ).toMatchObject({ width: '100%', flex: 0 });
      const name = view.getByText(row.profile.username);
      expect(StyleSheet.flatten(name.props.style).width).toBe('100%');
      expect(name.props.numberOfLines).toBeUndefined();
      expect(name.props.allowFontScaling).toBe(true);
    }
  },
);

it('keeps a long pinned viewer name, record, rating and You label on separate usable lines', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 });
  mockRows = [longPlayer('other', 'Other fighter')];
  const viewerName = 'Żaneta the extraordinarily patient strategist';
  mockViewer = longPlayer('me', viewerName);
  const view = render(<RankingsScreen />);
  await waitFor(() =>
    expect(view.queryByLabelText('Loading the rankings')).toBeNull(),
  );
  const card = view.getByLabelText(
    `Your standing. ${rankingRowLabel(mockViewer, true)}`,
  );
  expect(StyleSheet.flatten(card.props.style).flexDirection).toBe('column');
  expect(
    StyleSheet.flatten(view.getByTestId('ranking-identity-me').props.style),
  ).toMatchObject({ width: '100%', flex: 0 });
  expect(view.getByText(viewerName).props.numberOfLines).toBeUndefined();
  expect(view.getByText('You')).toBeTruthy();
  expect(view.getAllByText('12345')).toHaveLength(2);
});
