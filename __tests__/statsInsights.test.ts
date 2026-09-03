/**
 * The Stats screen's insight cards are derived on the client from the
 * player's own rows, so every number and every sentence is pinned here.
 */
import {
  BEST_PROMPTS_EMPTY,
  EXCERPT_MAX,
  MOVES_EMPTY,
  TREND_EMPTY,
  TREND_LIMIT,
  bestPromptAccessibilityLabel,
  bestPromptMeta,
  bestPrompts,
  excerptOf,
  moveUsage,
  myRatingDelta,
  ratingTrend,
  recentBattleAccessibilityLabel,
  recentBattlesView,
  trendAccessibilityLabel,
  type PromptLike,
  type RoundLike,
  type StatsBattleRow,
} from '@/utils/statsInsights';

const ME = 'me-1';
const THEM = 'them-2';

function battle(overrides: Partial<StatsBattleRow> = {}): StatsBattleRow {
  return {
    id: 'b1',
    status: 'completed',
    mode: 'ranked',
    format: 'bo3',
    theme: 'Space pirates',
    created_at: '2026-09-01T10:00:00Z',
    current_round: 3,
    player_one_id: ME,
    player_two_id: THEM,
    is_player_two_bot: false,
    winner_id: ME,
    is_draw: false,
    player_one: { username: 'me', display_name: 'Me' },
    player_two: { username: 'them', display_name: 'Vex' },
    rounds: null,
    ...overrides,
  };
}

function rated(id: string, at: string, delta: unknown): StatsBattleRow {
  return battle({
    id,
    created_at: at,
    rating_delta_payload: { [ME]: { delta }, [THEM]: { delta: -1 } },
  });
}

function prompt(overrides: Partial<PromptLike> = {}): PromptLike {
  return {
    battle_id: 'b1',
    round_number: 1,
    move_type: 'attack',
    custom_prompt_text: 'A daring boarding action under a red sun.',
    ...overrides,
  };
}

function round(overrides: Partial<RoundLike> = {}): RoundLike {
  return {
    battle_id: 'b1',
    round_number: 1,
    round_winner_id: ME,
    is_draw: false,
    player_one_score: 53.9,
    player_two_score: 41.2,
    is_ko: false,
    ...overrides,
  };
}

describe('copy', () => {
  it('pins the empty states', () => {
    expect(MOVES_EMPTY).toBe(
      'Lock in a few prompts and your move mix appears here.',
    );
    expect(BEST_PROMPTS_EMPTY).toBe(
      'Your highest-scoring prompts collect here after your first resolved rounds.',
    );
    expect(TREND_EMPTY).toBe(
      'Your rating trend appears after your first ranked battle.',
    );
  });
});

describe('ratingTrend', () => {
  it('walks backwards from the current rating, one point per delta', () => {
    const battles = [
      rated('b3', '2026-09-03T10:00:00Z', 12),
      rated('b2', '2026-09-02T10:00:00Z', -8),
      rated('b1', '2026-09-01T10:00:00Z', 20),
    ];
    const trend = ratingTrend(battles, ME, 1530);
    expect(trend.points).toEqual([1506, 1526, 1518, 1530]);
    expect(trend.deltas).toEqual([20, -8, 12]);
    expect(trend.points).toHaveLength(trend.deltas.length + 1);
  });

  it('sorts by date itself, so the order the rows arrive in does not matter', () => {
    const battles = [
      rated('b1', '2026-09-01T10:00:00Z', 20),
      rated('b3', '2026-09-03T10:00:00Z', 12),
      rated('b2', '2026-09-02T10:00:00Z', -8),
    ];
    expect(ratingTrend(battles, ME, 1530).points).toEqual([
      1506, 1526, 1518, 1530,
    ]);
  });

  it('ignores battles without my delta, unfinished ones, and accepts numeric strings', () => {
    const battles = [
      rated('b4', '2026-09-04T10:00:00Z', '7'),
      rated('b3', '2026-09-03T10:00:00Z', 5).status === 'completed'
        ? { ...rated('b3', '2026-09-03T10:00:00Z', 5), status: 'resolving' }
        : rated('b3', '2026-09-03T10:00:00Z', 5),
      battle({ id: 'b2', created_at: '2026-09-02T10:00:00Z' }),
      battle({
        id: 'b1',
        created_at: '2026-09-01T10:00:00Z',
        rating_delta_payload: { [THEM]: { delta: 9 } },
      }),
      battle({
        id: 'b0',
        created_at: '2026-08-31T10:00:00Z',
        rating_delta_payload: { [ME]: { delta: 'nope' } },
      }),
    ];
    expect(ratingTrend(battles, ME, 1507)).toEqual({
      points: [1500, 1507],
      deltas: [7],
    });
  });

  it('caps at the newest ten by default', () => {
    const battles = Array.from({ length: 14 }, (_, i) =>
      rated(`b${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`, 1),
    );
    const trend = ratingTrend(battles, ME, 1514);
    expect(TREND_LIMIT).toBe(10);
    expect(trend.deltas).toHaveLength(10);
    expect(trend.points).toHaveLength(11);
    expect(trend.points[0]).toBe(1504);
    expect(trend.points[10]).toBe(1514);
  });

  it('is empty without deltas or without a current rating', () => {
    expect(ratingTrend([battle()], ME, 1500)).toEqual({
      points: [],
      deltas: [],
    });
    expect(
      ratingTrend([rated('b1', '2026-09-01T10:00:00Z', 4)], ME, null),
    ).toEqual({
      points: [],
      deltas: [],
    });
    expect(myRatingDelta({ rating_delta_payload: null }, ME)).toBeNull();
    expect(myRatingDelta({ rating_delta_payload: 'junk' }, ME)).toBeNull();
  });

  it('reads the sparkline aloud with count and endpoints', () => {
    expect(trendAccessibilityLabel([1506.4, 1526, 1518, 1529.6])).toBe(
      'Rating over your last 3 ranked battles, from 1506 to 1530',
    );
    expect(trendAccessibilityLabel([1500, 1512])).toBe(
      'Rating over your last 1 ranked battle, from 1500 to 1512',
    );
    expect(trendAccessibilityLabel([1500])).toBe(TREND_EMPTY);
  });
});

describe('moveUsage', () => {
  const prompts: PromptLike[] = [
    prompt({ battle_id: 'b1', round_number: 1, move_type: 'attack' }),
    prompt({ battle_id: 'b1', round_number: 2, move_type: 'attack' }),
    prompt({ battle_id: 'b2', round_number: 1, move_type: 'attack' }),
    prompt({ battle_id: 'b1', round_number: 3, move_type: 'defense' }),
  ];
  const rounds: RoundLike[] = [
    round({ battle_id: 'b1', round_number: 1, round_winner_id: ME }),
    round({ battle_id: 'b1', round_number: 2, round_winner_id: THEM }),
    // Unresolved: no verdict yet.
    round({
      battle_id: 'b2',
      round_number: 1,
      round_winner_id: null,
      is_draw: false,
      player_one_score: null,
      player_two_score: null,
    }),
    round({
      battle_id: 'b1',
      round_number: 3,
      round_winner_id: null,
      is_draw: true,
    }),
  ];

  it('counts, shares and per-move win rates, sorted by count', () => {
    const usage = moveUsage(prompts, rounds, ME);
    expect(usage.map((u) => u.move)).toEqual(['attack', 'defense', 'finisher']);
    expect(usage[0]).toEqual({
      move: 'attack',
      count: 3,
      share: 0.75,
      wins: 1,
      roundsPlayed: 2,
      winRate: 0.5,
    });
    expect(usage[1]).toEqual({
      move: 'defense',
      count: 1,
      share: 0.25,
      wins: 0,
      roundsPlayed: 1,
      winRate: 0,
    });
    expect(usage[2]).toEqual({
      move: 'finisher',
      count: 0,
      share: 0,
      wins: 0,
      roundsPlayed: 0,
      winRate: null,
    });
  });

  it('keeps all three moves at zero with no prompts, and skips unknown moves', () => {
    const empty = moveUsage([], [], ME);
    expect(empty).toHaveLength(3);
    expect(empty.every((u) => u.count === 0 && u.winRate === null)).toBe(true);
    const odd = moveUsage([prompt({ move_type: 'taunt' })], [], ME);
    expect(odd.every((u) => u.count === 0)).toBe(true);
  });

  it('breaks count ties in attack, defense, finisher order', () => {
    const usage = moveUsage(
      [prompt({ move_type: 'finisher' }), prompt({ move_type: 'defense' })],
      [],
      ME,
    );
    expect(usage.map((u) => u.move)).toEqual(['defense', 'finisher', 'attack']);
  });
});

describe('bestPrompts', () => {
  const battles = [
    battle({ id: 'b1', created_at: '2026-09-01T10:00:00Z' }),
    battle({
      id: 'b2',
      created_at: '2026-09-02T10:00:00Z',
      theme: 'Haunted library',
      player_one_id: THEM,
      player_two_id: ME,
      winner_id: THEM,
    }),
  ];
  const rounds: RoundLike[] = [
    round({ battle_id: 'b1', round_number: 1, player_one_score: 53.9 }),
    round({
      battle_id: 'b1',
      round_number: 2,
      round_winner_id: ME,
      is_ko: true,
      player_one_score: 61.25,
    }),
    round({
      battle_id: 'b1',
      round_number: 3,
      round_winner_id: null,
      is_draw: false,
      player_one_score: null,
      player_two_score: null,
    }),
    // I am player two here: my score is the second column, as a string.
    round({
      battle_id: 'b2',
      round_number: 1,
      round_winner_id: THEM,
      player_one_score: '70.0000',
      player_two_score: '58.5000',
    }),
  ];
  const prompts: PromptLike[] = [
    prompt({ battle_id: 'b1', round_number: 1 }),
    prompt({
      battle_id: 'b1',
      round_number: 2,
      custom_prompt_text: 'Finish it with the anchor chain.',
    }),
    prompt({ battle_id: 'b1', round_number: 3 }),
    prompt({
      battle_id: 'b2',
      round_number: 1,
      custom_prompt_text: '  Whisper   the index\ncards awake. ',
    }),
    prompt({ battle_id: 'unknown', round_number: 1 }),
    prompt({ battle_id: 'b1', round_number: 1, custom_prompt_text: null }),
  ];

  it('ranks my own round scores highest first and drops what cannot be scored', () => {
    const rows = bestPrompts(prompts, battles, rounds, ME);
    expect(rows.map((r) => r.score)).toEqual([61.25, 58.5, 53.9]);
    expect(rows[0]).toEqual({
      battleId: 'b1',
      roundNumber: 2,
      excerpt: 'Finish it with the anchor chain.',
      score: 61.25,
      theme: 'Space pirates',
      won: true,
      ko: true,
      route: '/(battle)/result?battleId=b1',
    });
    expect(rows[1]).toMatchObject({
      battleId: 'b2',
      excerpt: 'Whisper the index cards awake.',
      theme: 'Haunted library',
      won: false,
      ko: false,
    });
  });

  it('honours the limit', () => {
    expect(bestPrompts(prompts, battles, rounds, ME, 1)).toHaveLength(1);
    expect(bestPrompts([], battles, rounds, ME)).toEqual([]);
  });

  it('truncates long prompts to the excerpt limit with one ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const excerpt = excerptOf(long);
    expect(excerpt).not.toBeNull();
    expect(excerpt!.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(excerpt!.endsWith('…')).toBe(true);
    expect(excerpt!.slice(0, -1).endsWith(' ')).toBe(false);
    expect(excerptOf('short')).toBe('short');
    expect(excerptOf('   ')).toBeNull();
    expect(excerptOf(null)).toBeNull();
  });

  it('writes the meta line and the spoken label', () => {
    const rows = bestPrompts(prompts, battles, rounds, ME);
    expect(bestPromptMeta(rows[0])).toBe(
      'Round 2 · Space pirates · score 61.3',
    );
    expect(bestPromptMeta({ roundNumber: 1, theme: null, score: 53.9 })).toBe(
      'Round 1 · score 53.9',
    );
    expect(bestPromptAccessibilityLabel(rows[0])).toBe(
      '“Finish it with the anchor chain.”. Round 2, Space pirates, score 61.3, won by knockout. Opens the battle result',
    );
    expect(bestPromptAccessibilityLabel(rows[2])).toBe(
      '“A daring boarding action under a red sun.”. Round 1, Space pirates, score 53.9, won. Opens the battle result',
    );
  });
});

describe('recentBattlesView', () => {
  const battles = [
    battle({ id: 'b5', created_at: '2026-09-05T10:00:00Z' }),
    battle({
      id: 'b4',
      created_at: '2026-09-04T10:00:00Z',
      winner_id: THEM,
      mode: 'unranked',
    }),
    battle({
      id: 'b3',
      created_at: '2026-09-03T10:00:00Z',
      winner_id: null,
      is_draw: true,
      mode: 'bot',
      is_player_two_bot: true,
      player_two: null,
    }),
    battle({
      id: 'b2',
      created_at: '2026-09-02T10:00:00Z',
      status: 'waiting_for_prompts',
      winner_id: null,
      current_round: 1,
    }),
    battle({
      id: 'b1',
      created_at: '2026-09-01T10:00:00Z',
      status: 'expired',
      winner_id: null,
    }),
    battle({ id: 'b0', created_at: '2026-08-31T10:00:00Z' }),
  ];

  it('keeps the first five with outcome word, mode, date and route', () => {
    const rows = recentBattlesView(battles, ME);
    expect(rows.map((r) => r.id)).toEqual(['b5', 'b4', 'b3', 'b2', 'b1']);
    expect(rows[0]).toMatchObject({
      opponentLabel: 'Vex',
      outcome: 'win',
      label: 'Win',
      tone: 'success',
      modeLabel: 'Ranked Battle',
      route: '/(battle)/result?battleId=b5',
    });
    expect(rows[0].date).toMatch(/2026/);
    expect(rows[1]).toMatchObject({
      label: 'Loss',
      tone: 'error',
      modeLabel: 'Casual Battle',
    });
    expect(rows[2]).toMatchObject({
      opponentLabel: 'Practice bot',
      label: 'Draw',
      tone: 'warning',
      modeLabel: 'Practice vs Bot',
    });
    expect(rows[3]).toMatchObject({
      outcome: 'pending',
      label: 'Your turn',
      tone: 'primary',
      route: '/(battle)/move-select?battleId=b2&round=1',
    });
    expect(rows[4]).toMatchObject({
      label: 'Timed out',
      tone: 'warning',
      route: null,
    });
  });

  it('honours the limit and reads a row aloud', () => {
    const rows = recentBattlesView(battles, ME, 2);
    expect(rows).toHaveLength(2);
    expect(recentBattleAccessibilityLabel(rows[0])).toBe(
      `Win against Vex, Ranked Battle, ${rows[0].date}. Opens the battle`,
    );
    const expired = recentBattlesView(battles, ME)[4];
    expect(recentBattleAccessibilityLabel(expired)).toBe(
      `Timed out against Vex, Ranked Battle, ${expired.date}`,
    );
    expect(
      recentBattleAccessibilityLabel({ ...expired, date: '', route: null }),
    ).toBe('Timed out against Vex, Ranked Battle');
  });
});
