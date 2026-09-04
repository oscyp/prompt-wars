import {
  isActiveBattleStatus,
  iHaveLockedIn,
  describeBattleRow,
  sortBattlesForList,
  arenaBattlePriority,
  battleRouteFor,
  statusToneColor,
  groupBattlesForList,
  battleSectionLabel,
  seriesScoreFor,
  seriesLabel,
  roundProgressFor,
  roundProgressText,
  roundProgressSpoken,
  opponentProfileIds,
  type BattleListRow,
} from '@/utils/battleLists';

const ME = 'me-1';
const THEM = 'them-2';

function battle(overrides: Partial<BattleListRow> = {}): BattleListRow {
  return {
    id: 'b1',
    status: 'waiting_for_prompts',
    mode: 'ranked',
    format: 'bo3',
    theme: 'Space pirates',
    created_at: '2026-09-01T10:00:00Z',
    current_round: 1,
    player_one_id: ME,
    player_two_id: THEM,
    is_player_two_bot: false,
    bot_persona_id: null,
    winner_id: null,
    is_draw: false,
    player_one_locked_at: null,
    player_two_locked_at: null,
    player_one: { username: 'me', display_name: 'Me' },
    player_two: { username: 'them', display_name: 'Them' },
    rounds: null,
    ...overrides,
  };
}

describe('isActiveBattleStatus', () => {
  it('treats every non-terminal status as live, including a ready result', () => {
    for (const s of [
      'created',
      'matched',
      'waiting_for_prompts',
      'resolving',
      'result_ready',
      'generating_video',
    ]) {
      expect(isActiveBattleStatus(s)).toBe(true);
    }
  });

  it('excludes the two failure states along with the finished ones', () => {
    for (const s of [
      'completed',
      'expired',
      'canceled',
      'moderation_failed',
      'generation_failed',
    ]) {
      expect(isActiveBattleStatus(s)).toBe(false);
    }
  });
});

describe('iHaveLockedIn', () => {
  it('reads the battle-level first-lock stamp in round 1', () => {
    expect(
      iHaveLockedIn(
        battle({ player_one_locked_at: '2026-09-01T10:05:00Z' }),
        ME,
      ),
    ).toBe(true);
    expect(iHaveLockedIn(battle(), ME)).toBe(false);
  });

  it('uses my side, not player one, when I am player two', () => {
    const b = battle({
      player_one_id: THEM,
      player_two_id: ME,
      player_one_locked_at: '2026-09-01T10:05:00Z',
      player_two_locked_at: null,
    });
    expect(iHaveLockedIn(b, ME)).toBe(false);
  });

  it('ignores the round-1 stamp on battles and reads the round row after round 1', () => {
    const stale = battle({
      current_round: 2,
      player_one_locked_at: '2026-09-01T10:05:00Z',
      rounds: [
        {
          round_number: 1,
          player_one_locked_at: '2026-09-01T10:05:00Z',
          player_two_locked_at: '2026-09-01T10:06:00Z',
        },
        {
          round_number: 2,
          player_one_locked_at: null,
          player_two_locked_at: '2026-09-01T10:20:00Z',
        },
      ],
    });
    expect(iHaveLockedIn(stale, ME)).toBe(false);

    const locked = battle({
      current_round: 2,
      rounds: [
        {
          round_number: 2,
          player_one_locked_at: '2026-09-01T10:21:00Z',
          player_two_locked_at: null,
        },
      ],
    });
    expect(iHaveLockedIn(locked, ME)).toBe(true);
  });

  it('is false for a viewer who is not in the battle', () => {
    expect(
      iHaveLockedIn(battle({ player_one_locked_at: 'x' }), 'stranger'),
    ).toBe(false);
    expect(iHaveLockedIn(battle({ player_one_locked_at: 'x' }), null)).toBe(
      false,
    );
  });
});

describe('describeBattleRow', () => {
  it('says "Your turn" until I lock, then "Waiting for opponent"', () => {
    expect(describeBattleRow(battle(), ME).status).toEqual({
      label: 'Your turn',
      actionable: true,
      tone: 'primary',
    });
    expect(
      describeBattleRow(
        battle({ player_one_locked_at: '2026-09-01T10:05:00Z' }),
        ME,
      ).status.label,
    ).toBe('Waiting for opponent');
  });

  it('names the opponent from the other side of the table', () => {
    expect(describeBattleRow(battle(), ME).opponentName).toBe('Them');
    expect(
      describeBattleRow(battle({ player_one_id: THEM, player_two_id: ME }), ME)
        .opponentName,
    ).toBe('Me');
  });

  it('falls back to the username, then to the shared vocabulary', () => {
    expect(
      describeBattleRow(
        battle({ player_two: { username: 'them', display_name: null } }),
        ME,
      ).opponentName,
    ).toBe('them');
    expect(
      describeBattleRow(
        battle({ player_two_id: null, player_two: null, status: 'created' }),
        ME,
      ).opponentName,
    ).toBe('No opponent yet');
  });

  it('calls a bot a practice bot only when I am player one', () => {
    const vsBot = battle({
      player_two_id: null,
      player_two: null,
      is_player_two_bot: true,
      bot_persona_id: 'bot',
    });
    expect(describeBattleRow(vsBot, ME).opponentName).toBe('Practice bot');
  });

  it('renders a completed draw as a draw, not a defeat', () => {
    const drawn = battle({
      status: 'completed',
      is_draw: true,
      winner_id: null,
    });
    const view = describeBattleRow(drawn, ME);
    expect(view.outcome).toBe('draw');
    expect(view.status.label).toBe('Draw');
  });

  it('keeps unfinished battles pending rather than lost', () => {
    expect(describeBattleRow(battle({ status: 'expired' }), ME).outcome).toBe(
      'pending',
    );
    expect(describeBattleRow(battle({ status: 'resolving' }), ME).outcome).toBe(
      'pending',
    );
  });
});

describe('sortBattlesForList', () => {
  it('puts actionable rows first, then newest first, and is stable', () => {
    const rows = [
      battle({
        id: 'old-waiting',
        status: 'waiting_for_prompts',
        player_one_locked_at: 'x',
        created_at: '2026-09-01T09:00:00Z',
      }),
      battle({
        id: 'new-waiting',
        status: 'waiting_for_prompts',
        player_one_locked_at: 'x',
        created_at: '2026-09-01T11:00:00Z',
      }),
      battle({
        id: 'old-turn',
        status: 'waiting_for_prompts',
        created_at: '2026-08-30T09:00:00Z',
      }),
      battle({
        id: 'result',
        status: 'result_ready',
        created_at: '2026-08-31T09:00:00Z',
      }),
      battle({
        id: 'done',
        status: 'completed',
        winner_id: ME,
        created_at: '2026-09-01T12:00:00Z',
      }),
    ];
    expect(sortBattlesForList(rows, ME).map((b) => b.id)).toEqual([
      'result',
      'old-turn',
      'done',
      'new-waiting',
      'old-waiting',
    ]);
  });

  it('preserves server order for rows that tie', () => {
    const same = '2026-09-01T10:00:00Z';
    const rows = [
      battle({ id: 'a', created_at: same }),
      battle({ id: 'b', created_at: same }),
      battle({ id: 'c', created_at: same }),
    ];
    expect(sortBattlesForList(rows, ME).map((b) => b.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate its input', () => {
    const rows = [
      battle({ id: 'x', status: 'completed', winner_id: ME }),
      battle({ id: 'y' }),
    ];
    sortBattlesForList(rows, ME);
    expect(rows.map((b) => b.id)).toEqual(['x', 'y']);
  });
});

describe('arenaBattlePriority', () => {
  it('promotes exactly one urgent battle and removes its duplicate row', () => {
    const rows = [
      battle({ id: 'waiting', player_one_locked_at: 'x' }),
      battle({ id: 'new-turn', created_at: '2026-09-02T10:00:00Z' }),
      battle({ id: 'old-turn', created_at: '2026-09-01T10:00:00Z' }),
    ];

    const priority = arenaBattlePriority(rows, ME);
    expect(priority.primary?.id).toBe('new-turn');
    expect(priority.remaining.map((row) => row.id)).toEqual([
      'old-turn',
      'waiting',
    ]);
  });

  it('keeps every row when the daily-theme action should remain primary', () => {
    const rows = [
      battle({ id: 'old', player_one_locked_at: 'x' }),
      battle({
        id: 'new',
        player_one_locked_at: 'x',
        created_at: '2026-09-02T10:00:00Z',
      }),
    ];

    const priority = arenaBattlePriority(rows, ME);
    expect(priority.primary).toBeNull();
    expect(priority.remaining.map((row) => row.id)).toEqual(['new', 'old']);
  });
});

describe('battleRouteFor', () => {
  it('sends my turn to move-select with the round, and my locked turn to waiting', () => {
    expect(battleRouteFor(battle({ current_round: 2 }), ME)).toBe(
      '/(battle)/move-select?battleId=b1&round=2',
    );
    expect(battleRouteFor(battle({ player_one_locked_at: 'x' }), ME)).toBe(
      '/(battle)/waiting?battleId=b1',
    );
  });

  it('sends results and both failure states to the result screen', () => {
    for (const status of [
      'result_ready',
      'generating_video',
      'completed',
      'moderation_failed',
      'generation_failed',
    ]) {
      expect(battleRouteFor(battle({ status }), ME)).toBe(
        '/(battle)/result?battleId=b1',
      );
    }
  });

  it('gives timed-out and cancelled battles nowhere to go', () => {
    expect(battleRouteFor(battle({ status: 'expired' }), ME)).toBeNull();
    expect(battleRouteFor(battle({ status: 'canceled' }), ME)).toBeNull();
  });

  it('parks anything still matching or judging on the waiting screen', () => {
    for (const status of ['created', 'matched', 'resolving']) {
      expect(battleRouteFor(battle({ status }), ME)).toBe(
        '/(battle)/waiting?battleId=b1',
      );
    }
  });
});

describe('statusToneColor', () => {
  const palette = {
    primary: '#p',
    success: '#s',
    warning: '#w',
    error: '#e',
    textSecondary: '#t',
  };

  it('maps every tone to its themed colour', () => {
    expect(statusToneColor('primary', palette)).toBe('#p');
    expect(statusToneColor('success', palette)).toBe('#s');
    expect(statusToneColor('warning', palette)).toBe('#w');
    expect(statusToneColor('error', palette)).toBe('#e');
    expect(statusToneColor('neutral', palette)).toBe('#t');
  });
});

describe('groupBattlesForList', () => {
  it('splits rows into your turn, in progress and finished, newest first', () => {
    const rows = [
      battle({
        id: 'done-old',
        status: 'completed',
        winner_id: ME,
        created_at: '2026-08-30T09:00:00Z',
      }),
      battle({
        id: 'waiting',
        status: 'waiting_for_prompts',
        player_one_locked_at: 'x',
        created_at: '2026-09-01T09:00:00Z',
      }),
      battle({
        id: 'turn-old',
        status: 'waiting_for_prompts',
        created_at: '2026-08-31T09:00:00Z',
      }),
      battle({
        id: 'result',
        status: 'result_ready',
        created_at: '2026-09-01T12:00:00Z',
      }),
      battle({
        id: 'judging',
        status: 'resolving',
        created_at: '2026-09-01T11:00:00Z',
      }),
      battle({
        id: 'done-new',
        status: 'expired',
        created_at: '2026-09-01T13:00:00Z',
      }),
    ];
    const sections = groupBattlesForList(rows, ME);
    expect(sections.map((s) => [s.key, s.title])).toEqual([
      ['yourTurn', 'Your turn'],
      ['inProgress', 'In progress'],
      ['finished', 'Finished'],
    ]);
    expect(sections[0].data.map((b) => b.id)).toEqual(['result', 'turn-old']);
    expect(sections[1].data.map((b) => b.id)).toEqual(['judging', 'waiting']);
    expect(sections[2].data.map((b) => b.id)).toEqual(['done-new', 'done-old']);
  });

  it('omits empty sections and files a failed generation under finished', () => {
    const sections = groupBattlesForList(
      [battle({ id: 'g', status: 'generation_failed' })],
      ME,
    );
    expect(sections.map((s) => s.key)).toEqual(['finished']);
    expect(groupBattlesForList([], ME)).toEqual([]);
  });

  it('labels a section header with its count', () => {
    expect(battleSectionLabel({ title: 'Your turn', data: [1, 2] })).toBe(
      'Your turn, 2 battles',
    );
    expect(battleSectionLabel({ title: 'Finished', data: [1] })).toBe(
      'Finished, 1 battle',
    );
  });
});

describe('seriesScoreFor / roundProgressFor', () => {
  it('orients the series from my side', () => {
    const bo3 = battle({
      format: 'bo3',
      best_of: 3,
      player_one_rounds_won: 2,
      player_two_rounds_won: 1,
    });
    expect(seriesScoreFor(bo3, ME)).toEqual({ mine: 2, theirs: 1 });
    expect(
      seriesScoreFor({ ...bo3, player_one_id: THEM, player_two_id: ME }, ME),
    ).toEqual({ mine: 1, theirs: 2 });
    expect(seriesLabel({ mine: 2, theirs: 0 })).toBe('2–0');
  });

  it('has no series for a single-format row', () => {
    expect(seriesScoreFor(battle({ format: 'single' }), ME)).toBeNull();
    expect(roundProgressFor(battle({ format: 'single' }), ME)).toBeNull();
  });

  it('defaults missing series columns to zero and best-of to three', () => {
    const legacy = battle({
      format: 'bo3',
      best_of: null,
      current_round: null,
      player_one_rounds_won: null,
      player_two_rounds_won: null,
    });
    expect(roundProgressFor(legacy, ME)).toEqual({
      mine: 0,
      theirs: 0,
      round: 1,
      bestOf: 3,
    });
  });

  it('prints and speaks the round line', () => {
    const progress = roundProgressFor(
      battle({
        format: 'bo3',
        best_of: 3,
        current_round: 2,
        player_one_rounds_won: 1,
        player_two_rounds_won: 0,
      }),
      ME,
    )!;
    expect(roundProgressText(progress)).toBe('Round 2 of 3 · 1–0');
    expect(roundProgressSpoken(progress)).toBe('Round 2 of 3, 1–0');
  });

  it('clamps the round inside the series', () => {
    expect(
      roundProgressFor(
        battle({ format: 'bo3', best_of: 3, current_round: 7 }),
        ME,
      )?.round,
    ).toBe(3);
  });
});

describe('opponentProfileIds', () => {
  it('collects each human opponent once, from whichever side I am on', () => {
    const rows = [
      battle({ id: 'a' }),
      battle({ id: 'b' }),
      battle({ id: 'c', player_one_id: THEM, player_two_id: ME }),
      battle({ id: 'd', player_one_id: 'other-3', player_two_id: ME }),
    ];
    expect(opponentProfileIds(rows, ME)).toEqual([THEM, 'other-3']);
  });

  it('skips bots, empty seats and rows I am not in', () => {
    const rows = [
      battle({ id: 'bot', player_two_id: null, is_player_two_bot: true }),
      battle({ id: 'empty', player_two_id: null, status: 'created' }),
      battle({ id: 'theirs', player_one_id: 'x', player_two_id: 'y' }),
    ];
    expect(opponentProfileIds(rows, ME)).toEqual([]);
    expect(opponentProfileIds([battle()], null)).toEqual([]);
  });
});
