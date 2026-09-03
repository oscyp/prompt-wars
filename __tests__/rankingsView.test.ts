import {
  medalFor,
  rankDisplay,
  ordinalRank,
  rankingPlayerName,
  recordSentence,
  rankingRowLabel,
  shouldPinViewerRow,
  type RankingRow,
} from '@/utils/rankingsView';

function row(overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    id: 'r1',
    profile_id: 'p1',
    rank: 4,
    rating: 1512.6,
    wins: 10,
    losses: 2,
    draws: 1,
    profile: { username: 'ace', display_name: 'Ace' },
    ...overrides,
  };
}

describe('medalFor', () => {
  it('awards the podium and nothing else', () => {
    expect(medalFor(1)).toBe('gold');
    expect(medalFor(2)).toBe('silver');
    expect(medalFor(3)).toBe('bronze');
    expect(medalFor(4)).toBeNull();
    expect(medalFor(null)).toBeNull();
  });
});

describe('rankDisplay / ordinalRank', () => {
  it('renders an unplaced rank as a dash, not "#null"', () => {
    expect(rankDisplay(null)).toBe('—');
    expect(rankDisplay(undefined)).toBe('—');
    expect(rankDisplay(0)).toBe('—');
    expect(rankDisplay(12)).toBe('#12');
  });

  it('says the place in words for the podium', () => {
    expect(ordinalRank(1)).toBe('1st place');
    expect(ordinalRank(2)).toBe('2nd place');
    expect(ordinalRank(3)).toBe('3rd place');
    expect(ordinalRank(12)).toBe('Rank 12');
    expect(ordinalRank(null)).toBe('Unranked');
  });
});

describe('rankingRowLabel', () => {
  it('reads rank, name, rating and the full record', () => {
    expect(rankingRowLabel(row({ rank: 1 }), false)).toBe(
      '1st place: Ace, rating 1513, 10 wins, 2 losses, 1 draw',
    );
  });

  it('marks the viewer and pluralises correctly', () => {
    expect(rankingRowLabel(row({ wins: 1, losses: 1, draws: 0 }), true)).toBe(
      'Rank 4: Ace (you), rating 1513, 1 win, 1 loss, 0 draws',
    );
  });

  it('falls back from display name to username to a placeholder', () => {
    expect(
      rankingPlayerName(
        row({ profile: { username: 'ace', display_name: null } }),
      ),
    ).toBe('ace');
    expect(rankingPlayerName(row({ profile: null }))).toBe('Unknown player');
  });

  it('spells losses without a typo', () => {
    expect(recordSentence({ wins: 0, losses: 2, draws: 2 })).toBe(
      '0 wins, 2 losses, 2 draws',
    );
  });
});

describe('shouldPinViewerRow', () => {
  it('pins only a viewer who has a row and is not already listed', () => {
    const listed = [{ profile_id: 'p1' }, { profile_id: 'p2' }];
    expect(shouldPinViewerRow(listed, { profile_id: 'p9' })).toBe(true);
    expect(shouldPinViewerRow(listed, { profile_id: 'p2' })).toBe(false);
    expect(shouldPinViewerRow(listed, null)).toBe(false);
    expect(shouldPinViewerRow([], { profile_id: 'p9' })).toBe(true);
  });
});
