import {
  BEAT_AUTO_ADVANCE_MS,
  REWARDS_PENDING_LINE,
  REWARDS_UNAVAILABLE_LINE,
  hasJudgeContent,
  nextStreakMilestone,
  payoffFallbackLine,
  payoffRows,
  revealBeatsFor,
  revealModelFrom,
  stingPresetFor,
  verdictCopy,
  winnerBeatCopy,
} from '@/utils/revealBeats';
import type { RewardSummary } from '@/types/battle';

const reward = (over: Partial<RewardSummary> = {}): RewardSummary => ({
  credits_granted: 0,
  credit_reasons: [],
  credits_eligible: true,
  win_streak_after: 1,
  best_win_streak: 4,
  streak_milestone: false,
  quests_advanced: ['complete_battles'],
  quests_completed: [],
  mode: 'ranked',
  ...over,
});

const rating = { delta: 12.4, line: 'Rating +12', gated: false };

describe('revealBeatsFor', () => {
  it('plays all four beats for a decided battle with judge data', () => {
    expect(revealBeatsFor({ outcome: 'won', hasJudge: true })).toEqual([
      'verdict',
      'winner',
      'judge',
      'payoff',
    ]);
  });
  it('drops the winner beat on a draw and the judge beat without data', () => {
    expect(revealBeatsFor({ outcome: 'draw', hasJudge: false })).toEqual([
      'verdict',
      'payoff',
    ]);
  });
  it('the payoff waits for the player', () => {
    expect(BEAT_AUTO_ADVANCE_MS.payoff).toBe(0);
    expect(BEAT_AUTO_ADVANCE_MS.verdict).toBeGreaterThan(0);
  });
});

describe('verdictCopy', () => {
  it('stamps a knockout and explains it from the viewer side', () => {
    expect(
      verdictCopy({
        format: 'bo3',
        outcome: 'won',
        mine: 2,
        theirs: 0,
        isKo: true,
      }),
    ).toEqual({
      stamp: 'KNOCKOUT',
      headline: 'You won the series 2–0',
      subline: 'Your opponent’s HP hit zero.',
    });
    expect(
      verdictCopy({
        format: 'bo3',
        outcome: 'lost',
        mine: 1,
        theirs: 2,
        isKo: true,
      }).subline,
    ).toBe('Your HP hit zero.');
  });
  it('has no stamp on points, and never on a draw', () => {
    expect(
      verdictCopy({
        format: 'bo3',
        outcome: 'won',
        mine: 2,
        theirs: 1,
        isKo: false,
      }),
    ).toEqual({
      stamp: null,
      headline: 'You won the series 2–1',
      subline: null,
    });
    expect(
      verdictCopy({
        format: 'bo3',
        outcome: 'draw',
        mine: 1,
        theirs: 1,
        isKo: true,
      }).stamp,
    ).toBeNull();
    expect(
      verdictCopy({
        format: 'single',
        outcome: 'lost',
        mine: 0,
        theirs: 1,
        isKo: false,
      }).headline,
    ).toBe('Defeat');
  });
});

describe('stingPresetFor', () => {
  it('reads the server preset first, then the move type', () => {
    expect(
      stingPresetFor({
        animationPreset: 'finisher_dramatic_3s',
        winnerMoveType: 'attack',
      }),
    ).toBe('finisher');
    expect(
      stingPresetFor({
        animationPreset: 'motion_poster_v1',
        winnerMoveType: 'defense',
      }),
    ).toBe('defense');
    expect(
      stingPresetFor({ animationPreset: null, winnerMoveType: 'ATTACK' }),
    ).toBe('attack');
    expect(stingPresetFor({})).toBeNull();
  });
});

describe('winnerBeatCopy', () => {
  it('quotes the battle cry and marks a knockout', () => {
    expect(
      winnerBeatCopy({
        name: 'AndrewTwo',
        isMe: true,
        isKo: true,
        battleCry: 'Built to win',
      }),
    ).toEqual({
      name: 'AndrewTwo',
      kicker: 'Winner · Knockout',
      battleCry: '“Built to win”',
    });
    expect(
      winnerBeatCopy({ name: '  ', isMe: false, isKo: false, battleCry: null })
        .name,
    ).toBe('Your opponent');
  });
});

describe('revealModelFrom', () => {
  const payload = {
    summary: 'Summary line',
    outcome: { winner_profile_id: 'p1', is_draw: false, is_ko: true },
    players: {
      player_one: {
        profile_id: 'p1',
        character_name: 'AndrewTwo',
        archetype: 'engineer',
        signature_color: '#10B981',
        battle_cry: 'Built to win',
        move_type: 'attack',
        prompt_excerpt: 'Cornered against ancient stone…',
        rubric_scores: { clarity: 8, originality: 7 },
        portrait: { signed_url: 'https://x/p1.png' },
      },
      player_two: {
        profile_id: null,
        character_name: 'Forge',
        archetype: 'titan',
        move_type: 'defense',
      },
    },
    judge: { why: 'Player one nails the theme.' },
    reveal_spec: {
      animation_preset: 'finisher_dramatic_3s',
      winner_color: '#10B981',
    },
  };

  it('orients the sides to the viewer and reads the spec', () => {
    const m = revealModelFrom(payload, {
      myProfileId: 'p1',
      isPlayerOne: true,
      isBot: true,
    });
    expect(m.me.name).toBe('AndrewTwo');
    expect(m.me.rubric).toEqual({ clarity: 8, originality: 7 });
    expect(m.me.portraitUrl).toBe('https://x/p1.png');
    expect(m.them.name).toBe('Forge');
    expect(m.them.rubric).toBeNull();
    expect(m.isKo).toBe(true);
    expect(m.judgeWhy).toBe('Player one nails the theme.');
    expect(m.animationPreset).toBe('finisher_dramatic_3s');
    expect(hasJudgeContent(m)).toBe(true);
  });

  it('survives an empty payload with viewer-relative fallbacks', () => {
    const m = revealModelFrom(null, {
      myProfileId: 'p2',
      isPlayerOne: false,
      isBot: false,
    });
    expect(m.me.name).toBe('You');
    expect(m.them.name).toBe('Opponent');
    expect(m.judgeWhy).toBeNull();
    expect(hasJudgeContent(m)).toBe(false);
  });

  it('falls back to the summary when the judge block is missing', () => {
    const m = revealModelFrom(
      { summary: 'S' },
      { myProfileId: 'p1', isPlayerOne: true, isBot: false },
    );
    expect(m.judgeWhy).toBe('S');
  });
});

describe('payoffRows', () => {
  it('counts rating, credits and streak on a paid ranked win', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: false,
      mode: 'ranked',
      rating,
      reward: reward({
        credits_granted: 3,
        credit_reasons: ['win_streak'],
        win_streak_after: 3,
        best_win_streak: 4,
        streak_milestone: true,
      }),
      battleCompleted: true,
    });
    expect(rows.map((r) => r.key)).toEqual([
      'rating',
      'credits',
      'streak',
      'quest',
    ]);
    expect(rows[0]).toMatchObject({
      value: '+12',
      counter: { to: 12, prefix: '+' },
      tone: 'up',
    });
    expect(rows[1]).toMatchObject({
      value: '+3 cr',
      counter: { to: 3 },
      detail: 'Win streak 3 milestone',
    });
    expect(rows[2]).toMatchObject({ value: '3', detail: 'Best 4' });
    expect(rows[3]).toMatchObject({
      label: 'Daily quests',
      value: '1 quest advanced',
    });
  });

  it('says why a practice battle pays nothing, and still shows the streak', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: true,
      mode: 'bot',
      rating: { delta: null, line: null, gated: false },
      reward: reward({
        credits_eligible: false,
        mode: 'bot',
        win_streak_after: 3,
        best_win_streak: 5,
      }),
      battleCompleted: true,
    });
    expect(rows[0]).toMatchObject({
      key: 'rating',
      value: 'Practice — no rating change',
    });
    expect(rows[1]).toMatchObject({
      key: 'credits',
      value: 'Ranked wins pay streak credits',
    });
    expect(rows[2]).toMatchObject({
      key: 'streak',
      value: '3',
      detail: 'Best 5',
    });
  });

  it('celebrates a new best and names finished quests with their claimable credits', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: false,
      mode: 'ranked',
      rating,
      reward: reward({
        win_streak_after: 5,
        best_win_streak: 5,
        quests_completed: [
          {
            quest_type: 'win_battle',
            title: 'Win a battle',
            reward_credits: 2,
          },
          {
            quest_type: 'use_finisher',
            title: 'Land a finisher',
            reward_credits: 1,
          },
        ],
      }),
      battleCompleted: true,
    });
    expect(rows.find((r) => r.key === 'streak')?.detail).toBe('New best!');
    expect(rows.find((r) => r.key === 'credits')).toMatchObject({
      value: 'Next milestone pays out',
      detail: '2 more wins to a 7-streak reward',
    });
    expect(rows.find((r) => r.key === 'quest')).toMatchObject({
      label: 'Quests complete',
      value: 'Win a battle · Land a finisher',
      detail: '3 credits to claim in the Arena',
    });
  });

  it('marks a lost streak as reset and a negative rating as down', () => {
    const rows = payoffRows({
      outcome: 'lost',
      isBot: false,
      mode: 'ranked',
      rating: { delta: -9, line: 'Rating −9', gated: false },
      reward: reward({
        win_streak_after: 0,
        best_win_streak: 4,
        quests_advanced: [],
      }),
      battleCompleted: true,
    });
    expect(rows[0]).toMatchObject({
      key: 'rating',
      value: '-9',
      tone: 'down',
      counter: { to: 9, prefix: '−' },
    });
    expect(rows.find((r) => r.key === 'streak')).toMatchObject({
      value: 'Reset',
      tone: 'down',
      detail: 'Best 4',
    });
    expect(rows.find((r) => r.key === 'quest')).toBeUndefined();
  });

  it('keeps the quality-floor gate line and shows only rating without a payload', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: false,
      mode: 'ranked',
      rating: {
        delta: null,
        line: 'Rating unchanged: below the quality floor',
        gated: true,
      },
      reward: null,
      battleCompleted: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toMatch(/quality floor/);
    expect(payoffFallbackLine({ reward: null, battleCompleted: false })).toBe(
      REWARDS_PENDING_LINE,
    );
    expect(payoffFallbackLine({ reward: null, battleCompleted: true })).toBe(
      REWARDS_UNAVAILABLE_LINE,
    );
    expect(
      payoffFallbackLine({ reward: reward(), battleCompleted: true }),
    ).toBeNull();
  });
});

describe('nextStreakMilestone', () => {
  it('follows the server ladder: 3, 5, 7, then every 5', () => {
    expect([0, 2, 3, 4, 6, 7, 9, 10, 12].map(nextStreakMilestone)).toEqual([
      3, 3, 5, 5, 7, 10, 10, 15, 15,
    ]);
  });
});
