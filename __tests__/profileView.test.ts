import {
  fighterCardCopy,
  isRatedBattle,
  nextUnlock,
  progressionRows,
  ratingView,
  rivalIdentityFromBattles,
  rivalRecord,
  rivalRecordLabel,
  rivalRecordSentence,
  seasonEndsLabel,
} from '@/utils/profileView';
import type { CosmeticItem } from '@/utils/cosmetics';

const item = (over: Partial<CosmeticItem>): CosmeticItem => ({
  id: over.slug ?? 'x',
  slug: 'x',
  name: 'Item',
  description: '',
  cosmetic_type: 'frame',
  rarity: 'common',
  acquisition: 'play_unlock',
  price_credits: null,
  min_subscription_tier: null,
  unlock_rule: null,
  value: null,
  preview_asset_path: null,
  sort_order: 0,
  owned: false,
  ...over,
});

describe('ratingView', () => {
  it('is Unrated until a ranked battle has been played, whatever the column says', () => {
    expect(ratingView({ rating: 1500, hasRatedBattle: false })).toMatchObject({
      value: 'Unrated',
      rated: false,
    });
    expect(ratingView({ rating: 1537.4, hasRatedBattle: true })).toEqual({
      value: '1537',
      caption: 'Rating',
      rated: true,
    });
  });
  it('only completed ranked human battles count as rated', () => {
    expect(
      isRatedBattle({
        mode: 'ranked',
        status: 'completed',
        is_player_two_bot: false,
      }),
    ).toBe(true);
    expect(
      isRatedBattle({
        mode: 'ranked',
        status: 'completed',
        is_player_two_bot: true,
      }),
    ).toBe(false);
    expect(isRatedBattle({ mode: 'bot', status: 'completed' })).toBe(false);
    expect(isRatedBattle({ mode: 'ranked', status: 'canceled' })).toBe(false);
  });
});

describe('nextUnlock', () => {
  const progress = { wins: 8, totalBattles: 20, bestStreak: 2, loginStreak: 3 };
  it('picks the nearest unowned earned item and words the gap', () => {
    const items = [
      item({
        slug: 'iron',
        name: 'Iron Frame',
        unlock_rule: { wins: 10 },
        sort_order: 2,
      }),
      item({
        slug: 'veteran',
        name: 'Veteran',
        unlock_rule: { total_battles: 25 },
        sort_order: 1,
      }),
      item({ slug: 'fire', name: 'On Fire', unlock_rule: { best_streak: 7 } }),
      item({
        slug: 'owned',
        name: 'Owned',
        unlock_rule: { wins: 9 },
        owned: true,
      }),
    ];
    const next = nextUnlock(items, progress);
    expect(next?.item.slug).toBe('iron');
    expect(next?.remaining).toBe(2);
    expect(next?.hint).toBe('2 more wins to unlock Iron Frame');
  });
  it('breaks ties by sort order and words streaks and logins naturally', () => {
    const items = [
      item({ slug: 'b', name: 'B', unlock_rule: { wins: 9 }, sort_order: 5 }),
      item({
        slug: 'a',
        name: 'A',
        unlock_rule: { total_battles: 21 },
        sort_order: 1,
      }),
    ];
    expect(nextUnlock(items, progress)?.item.slug).toBe('a');
    expect(
      nextUnlock(
        [item({ name: 'On Fire', unlock_rule: { best_streak: 3 } })],
        progress,
      )?.hint,
    ).toBe('1 more win in a row to unlock On Fire');
    expect(
      nextUnlock(
        [item({ name: 'Regular', unlock_rule: { daily_login_streak: 7 } })],
        progress,
      )?.hint,
    ).toBe('4 more days to unlock Regular');
  });
  it('ignores level rules (no XP is ever granted), reached rules and unknown login streaks', () => {
    expect(
      nextUnlock([item({ unlock_rule: { level: 5 } })], progress),
    ).toBeNull();
    expect(
      nextUnlock([item({ unlock_rule: { wins: 8 } })], progress),
    ).toBeNull();
    expect(
      nextUnlock([item({ unlock_rule: { daily_login_streak: 7 } })], {
        ...progress,
        loginStreak: null,
      }),
    ).toBeNull();
  });
});

describe('rivals', () => {
  const me = 'me';
  const rival = 'them';
  const battles = [
    {
      status: 'completed',
      winner_id: me,
      is_draw: false,
      player_one_id: me,
      player_two_id: rival,
      created_at: '2026-09-01T10:00:00Z',
    },
    {
      status: 'completed',
      winner_id: rival,
      is_draw: false,
      player_one_id: rival,
      player_two_id: me,
      created_at: '2026-09-02T10:00:00Z',
      tier0_reveal_payload: {
        players: {
          player_one: {
            character_name: 'Forge',
            archetype: 'titan',
            signature_color: '#ef4444',
          },
          player_two: { character_name: 'Me' },
        },
      },
    },
    {
      status: 'completed',
      winner_id: null,
      is_draw: true,
      player_one_id: me,
      player_two_id: rival,
      created_at: '2026-09-03T10:00:00Z',
    },
    {
      status: 'canceled',
      winner_id: null,
      is_draw: false,
      player_one_id: me,
      player_two_id: rival,
      created_at: '2026-09-03T11:00:00Z',
    },
  ];
  it('counts only completed battles from the viewer side', () => {
    const rec = rivalRecord(battles, me);
    expect(rec).toEqual({ wins: 1, losses: 1, draws: 1, total: 3 });
    expect(rivalRecordLabel(rec)).toBe('1–1–1');
    expect(rivalRecordLabel({ wins: 3, losses: 1, draws: 0, total: 4 })).toBe(
      '3–1',
    );
    expect(rivalRecordSentence(rec)).toBe('1 win, 1 loss, 1 draw');
  });
  it('reads the rival identity from the newest battle that has a payload, whichever side they were on', () => {
    expect(rivalIdentityFromBattles(battles, rival)).toEqual({
      name: 'Forge',
      archetype: 'titan',
      signatureColor: '#ef4444',
    });
    expect(rivalIdentityFromBattles([], rival)).toEqual({
      name: null,
      archetype: null,
      signatureColor: null,
    });
  });
});

describe('progressionRows', () => {
  const now = Date.parse('2026-09-03T12:00:00Z');
  it('shows streaks, a ranked position with the season clock, and the next unlock', () => {
    const rows = progressionRows({
      currentStreak: 3,
      bestStreak: 5,
      loginStreak: 4,
      rank: {
        rank: 12,
        seasonName: 'Season 1',
        endsAt: '2026-09-15T12:00:00Z',
      },
      hasRatedBattle: true,
      unlock: {
        item: item({ name: 'Iron Frame' }),
        metric: 'wins',
        remaining: 2,
        target: 10,
        hint: '2 more wins to unlock Iron Frame',
      },
      now,
    });
    expect(rows.map((r) => r.key)).toEqual([
      'winStreak',
      'loginStreak',
      'rank',
      'unlock',
    ]);
    expect(rows[0]).toMatchObject({ value: '3', detail: 'Best 5', tone: 'up' });
    expect(rows[1]).toMatchObject({
      value: '4 days',
      detail: 'Come back tomorrow to keep it',
    });
    expect(rows[2]).toMatchObject({
      value: '#12',
      detail: 'Season 1 · ends in 12 days',
      route: '/(tabs)/rankings',
    });
    expect(rows[3]).toMatchObject({
      value: 'Iron Frame',
      route: '/(profile)/shop',
    });
  });
  it('is honest when unranked, hides the login row when unknown, and celebrates a new best', () => {
    const rows = progressionRows({
      currentStreak: 5,
      bestStreak: 5,
      loginStreak: null,
      rank: null,
      hasRatedBattle: false,
      unlock: null,
      now,
    });
    expect(rows.map((r) => r.key)).toEqual(['winStreak', 'rank']);
    expect(rows[0].detail).toBe('New best');
    expect(rows[1]).toMatchObject({
      value: 'Unranked',
      detail: 'Play a ranked battle to enter the season',
    });
  });
  it('words the season clock', () => {
    expect(seasonEndsLabel('2026-09-04T00:00:00Z', now)).toBe('ends today');
    expect(seasonEndsLabel('2026-09-01T00:00:00Z', now)).toBe('ended');
    expect(seasonEndsLabel(null, now)).toBeNull();
  });
});

describe('fighterCardCopy', () => {
  it('names the archetype and item and quotes the cry', () => {
    const copy = fighterCardCopy({
      name: 'AndrewTwo',
      archetype: 'engineer',
      battleCry: 'Built to win',
      itemName: 'Brass compass',
    });
    expect(copy).toMatchObject({
      name: 'AndrewTwo',
      subtitle: 'The Engineer · Brass compass',
      battleCry: '“Built to win”',
    });
    expect(copy.accessibilityLabel).toBe(
      'AndrewTwo, The Engineer · Brass compass, battle cry Built to win. Opens Edit character',
    );
    expect(
      fighterCardCopy({
        name: '',
        archetype: 'nope',
        battleCry: null,
        itemName: null,
      }),
    ).toMatchObject({ name: 'Your fighter', subtitle: '', battleCry: null });
  });
});
