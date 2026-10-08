/**
 * The result screens' view model, pinned.
 *
 * The cases that matter are the ones where the screen could lie to a player:
 * showing player two their own lead as a deficit, calling a forfeited round a
 * loss on points, hiding the video button after a refunded failure, or
 * quoting a price only after the charge.
 */
import {
  battleOutcomeFor,
  canOfferVideoUpgrade,
  cinematicLabel,
  fighterNameFor,
  formatPct,
  formatPoints,
  judgeNotesUnavailable,
  moveMatchupLine,
  outcomeAnnouncement,
  outcomeHeadline,
  outcomeIconLabel,
  QUALITY_FLOOR_NOTE,
  ratingSummary,
  roundMiniView,
  singleMatchupNote,
  upgradeBlockedCopy,
  upgradeSheetCopy,
  videoStatusCopy,
  VIDEO_NEARLY_OUT_OF_TIME_MS,
  VIDEO_SLOW_AFTER_MS,
} from '@/utils/resultView';
import type { BattleRound } from '@/types/battle';

const ME = 'me';
const THEM = 'them';

function round(over: Partial<BattleRound> = {}): BattleRound {
  return {
    id: 'r1',
    battle_id: 'b1',
    round_number: 1,
    status: 'result_ready',
    lock_in_deadline: null,
    player_one_locked_at: null,
    player_two_locked_at: null,
    both_locked_at: null,
    round_winner_id: null,
    is_draw: false,
    player_one_score: null,
    player_two_score: null,
    score_gap: null,
    player_one_damage: 0,
    player_two_damage: 0,
    player_one_hp_after: null,
    player_two_hp_after: null,
    is_ko: false,
    judge_payload: null,
    judge_prompt_version: null,
    judge_model_id: null,
    stat_modifier_player_one: null,
    stat_modifier_player_two: null,
    move_type_modifier_player_one: null,
    move_type_modifier_player_two: null,
    created_at: '',
    resolved_at: null,
    updated_at: '',
    ...over,
  };
}

describe('battleOutcomeFor', () => {
  it('reads the winner from the viewer’s side', () => {
    expect(
      battleOutcomeFor({ winnerId: ME, isDraw: false, myProfileId: ME }),
    ).toBe('won');
    expect(
      battleOutcomeFor({ winnerId: THEM, isDraw: false, myProfileId: ME }),
    ).toBe('lost');
  });

  it('a draw is a draw whatever winner_id says', () => {
    expect(
      battleOutcomeFor({ winnerId: ME, isDraw: true, myProfileId: ME }),
    ).toBe('draw');
  });

  it('no winner and no draw reads as a loss, never a win', () => {
    expect(
      battleOutcomeFor({ winnerId: null, isDraw: false, myProfileId: ME }),
    ).toBe('lost');
  });
});

describe('outcomeHeadline', () => {
  it('states the series from the viewer’s side in Bo3', () => {
    // Player two's 2–1 win is stored as p1=1, p2=2; oriented it is mine=2.
    expect(
      outcomeHeadline({ format: 'bo3', outcome: 'won', mine: 2, theirs: 1 }),
    ).toBe('You won the series 2–1');
    expect(
      outcomeHeadline({ format: 'bo3', outcome: 'lost', mine: 1, theirs: 2 }),
    ).toBe('You lost the series 1–2');
    expect(
      outcomeHeadline({ format: 'bo3', outcome: 'draw', mine: 1, theirs: 1 }),
    ).toBe('Series drawn 1–1');
  });

  it('uses one title-case word for single format', () => {
    expect(
      outcomeHeadline({ format: 'single', outcome: 'won', mine: 0, theirs: 0 }),
    ).toBe('Victory');
    expect(
      outcomeHeadline({
        format: 'single',
        outcome: 'lost',
        mine: 0,
        theirs: 0,
      }),
    ).toBe('Defeat');
    expect(
      outcomeHeadline({
        format: 'single',
        outcome: 'draw',
        mine: 0,
        theirs: 0,
      }),
    ).toBe('Draw');
  });
});

describe('outcomeIconLabel / outcomeAnnouncement', () => {
  it('names the glyph', () => {
    expect(outcomeIconLabel('won')).toBe('Trophy');
    expect(outcomeIconLabel('lost')).toBe('Broken heart');
    expect(outcomeIconLabel('draw')).toBe('Handshake');
  });

  it('appends the rating line only when there is one', () => {
    expect(
      outcomeAnnouncement({ headline: 'Victory', ratingLine: 'Rating +12' }),
    ).toBe('Victory. Rating +12.');
    expect(outcomeAnnouncement({ headline: 'Draw', ratingLine: null })).toBe(
      'Draw.',
    );
  });
});

describe('ratingSummary', () => {
  it('reads this player’s delta out of the keyed payload', () => {
    const s = ratingSummary({
      ratingDeltaPayload: { [ME]: { delta: 11.6 }, [THEM]: { delta: -11.6 } },
      scorePayload: {},
      myProfileId: ME,
    });
    expect(s).toEqual({ line: 'Rating +12', delta: 11.6, gated: false });
  });

  it('accepts a numeric string, which JSONB round-trips can produce', () => {
    const s = ratingSummary({
      ratingDeltaPayload: { [ME]: { delta: '-4.2' } },
      scorePayload: null,
      myProfileId: ME,
    });
    expect(s.line).toBe('Rating -4');
    expect(s.delta).toBeCloseTo(-4.2);
  });

  it('says nothing when there is no payload or no viewer', () => {
    expect(
      ratingSummary({
        ratingDeltaPayload: null,
        scorePayload: null,
        myProfileId: ME,
      }),
    ).toEqual({
      line: null,
      delta: null,
      gated: false,
    });
    expect(
      ratingSummary({
        ratingDeltaPayload: { [ME]: { delta: 3 } },
        scorePayload: null,
        myProfileId: null,
      }).line,
    ).toBeNull();
  });

  it('the quality floor wins over any delta present', () => {
    const s = ratingSummary({
      ratingDeltaPayload: { [ME]: { delta: 9 } },
      scorePayload: { rating_gated: 'quality_floor' },
      myProfileId: ME,
    });
    expect(s).toEqual({ line: QUALITY_FLOOR_NOTE, delta: null, gated: true });
    expect(QUALITY_FLOOR_NOTE).toBe(
      'No rating change — both prompts were below the quality floor.',
    );
  });

  it('other gates fall through to the delta', () => {
    const s = ratingSummary({
      ratingDeltaPayload: { [ME]: { delta: 0.2 } },
      scorePayload: { rating_gated: 'diversity' },
      myProfileId: ME,
    });
    expect(s.gated).toBe(false);
    expect(s.line).toBe('Rating unchanged');
  });
});

describe('roundMiniView', () => {
  const viewerP1 = { myProfileId: ME, playerOneId: ME };
  const viewerP2 = { myProfileId: ME, playerOneId: THEM };

  it('decides won/lost from round_winner_id, not from the scores', () => {
    // A forfeit: the server names a winner but the scores say the opposite.
    const r = round({
      round_winner_id: ME,
      player_one_score: 3,
      player_two_score: 8,
    });
    expect(roundMiniView(r, viewerP1).outcome).toBe('won');
    expect(roundMiniView(r, viewerP1).status).toBe('You won');
  });

  it('orients scores and HP to the viewer’s seat', () => {
    const r = round({
      round_winner_id: ME,
      player_one_score: 6.1,
      player_two_score: 8.25,
      player_one_hp_after: 70,
      player_two_hp_after: 100,
    });
    const asP2 = roundMiniView(r, viewerP2);
    expect(asP2.scoreLine).toBe('8.3 vs 6.1');
    expect(asP2.hpLine).toBe('HP after: 100 vs 70');
    const asP1 = roundMiniView(r, viewerP1);
    expect(asP1.scoreLine).toBe('6.1 vs 8.3');
    expect(asP1.hpLine).toBe('HP after: 70 vs 100');
  });

  it('names the opponent’s win and a draw', () => {
    expect(
      roundMiniView(round({ round_winner_id: THEM }), viewerP1).status,
    ).toBe('Opponent won');
    expect(roundMiniView(round({ is_draw: true }), viewerP1)).toMatchObject({
      outcome: 'draw',
      status: 'Draw',
    });
  });

  it('is pending until the round resolves, with dashes for missing HP', () => {
    const v = roundMiniView(round({ status: 'resolving' }), viewerP1);
    expect(v.outcome).toBe('pending');
    expect(v.status).toBe('Pending');
    expect(v.scoreLine).toBeNull();
    expect(v.hpLine).toBe('HP after: — vs —');
  });
});

describe('canOfferVideoUpgrade', () => {
  it('offers when there is no job on a resolved, non-bot battle', () => {
    expect(
      canOfferVideoUpgrade({
        job: null,
        battleStatus: 'completed',
        mode: 'ranked',
      }),
    ).toBe(true);
    expect(
      canOfferVideoUpgrade({
        job: null,
        battleStatus: 'result_ready',
        mode: 'unranked',
      }),
    ).toBe(true);
  });

  it('treats a failed job as no job, because the server refunded and allows a retry', () => {
    expect(
      canOfferVideoUpgrade({
        job: { status: 'failed' },
        battleStatus: 'completed',
        mode: 'ranked',
      }),
    ).toBe(true);
  });

  it('does not offer while a job is live or done, nor on bot battles or unresolved battles', () => {
    for (const status of ['queued', 'submitted', 'processing', 'succeeded']) {
      expect(
        canOfferVideoUpgrade({
          job: { status },
          battleStatus: 'completed',
          mode: 'ranked',
        }),
      ).toBe(false);
    }
    expect(
      canOfferVideoUpgrade({
        job: null,
        battleStatus: 'completed',
        mode: 'bot',
      }),
    ).toBe(false);
    expect(
      canOfferVideoUpgrade({
        job: null,
        battleStatus: 'resolving',
        mode: 'ranked',
      }),
    ).toBe(false);
  });
});

describe('videoStatusCopy', () => {
  it('covers every enum state that is not yet playable', () => {
    expect(videoStatusCopy({ status: 'queued', hasUrl: false })).toEqual({
      title: 'Cinematic',
      body: 'Starting your cinematic…',
      tone: 'pending',
    });
    for (const status of ['submitted', 'processing']) {
      expect(
        videoStatusCopy({ status, hasUrl: false, elapsedMs: 0 })?.tone,
      ).toBe('pending');
    }
    expect(videoStatusCopy({ status: 'succeeded', hasUrl: false })).toEqual({
      title: 'Cinematic',
      body: 'Finishing up…',
      tone: 'pending',
    });
    expect(videoStatusCopy({ status: 'failed', hasUrl: false })).toEqual({
      title: 'Video didn’t generate',
      body: 'You weren’t charged for this attempt.',
      tone: 'error',
    });
  });

  it('hands over to the player once the url is signed', () => {
    expect(videoStatusCopy({ status: 'succeeded', hasUrl: true })).toBeNull();
  });

  it('never promises "a few minutes" for a p50 of about one', () => {
    // The old copy said that for every non-terminal state. Overstating the
    // wait is the expensive direction: the player leaves, and the cinematic
    // lands seconds later.
    const bodies = [0, 30_000, 60_000, 120_000, 280_000].map(
      (elapsedMs) =>
        videoStatusCopy({ status: 'processing', hasUrl: false, elapsedMs })
          ?.body ?? '',
    );
    for (const body of bodies) {
      expect(body).not.toContain('few minutes');
    }
  });

  it('describes longer renders without completion estimates', () => {
    const early = videoStatusCopy({
      status: 'processing',
      hasUrl: false,
      elapsedMs: 10_000,
    });
    const slow = videoStatusCopy({
      status: 'processing',
      hasUrl: false,
      elapsedMs: VIDEO_SLOW_AFTER_MS,
    });
    const nearlyDone = videoStatusCopy({
      status: 'processing',
      hasUrl: false,
      elapsedMs: VIDEO_NEARLY_OUT_OF_TIME_MS,
    });

    expect(early?.body).toContain('Creating your cinematic');
    expect(early?.body).not.toContain('about a minute');
    expect(slow?.body).toContain('longer than usual');
    // Longer waits keep useful status without adding a time promise.
    expect(slow?.body).not.toContain('about a minute');
    expect(nearlyDone?.body).toContain('Nearly out of time');
  });

  it('tells the player they are free to leave', () => {
    // There is already a push when the video is ready, so the card should not
    // read as something that must be watched.
    const body = videoStatusCopy({
      status: 'processing',
      hasUrl: false,
      elapsedMs: 0,
    })?.body;
    expect(body).toContain('don’t have to wait');
  });

  it('treats a missing elapsed time as the start of the wait', () => {
    expect(
      videoStatusCopy({ status: 'processing', hasUrl: false })?.body,
    ).toContain('Creating your cinematic');
  });
});

describe('upgradeSheetCopy', () => {
  it.each([8, 12, 15, 20])(
    'shows the quoted %i-second length and exact credit cost',
    (duration) => {
      const copy = upgradeSheetCopy(
        {
          can_upgrade: true,
          method: 'credit',
          cost_credits: 2,
          target_duration_seconds: duration,
        },
        10,
      );
      expect(copy.title).toBe(`${duration}-second cinematic`);
      expect(copy.subtitle).toContain('2 credits');
      expect(copy.rows[0]).toMatchObject({ amount: 2 });
    },
  );

  it.each(['subscriber_full', 'subscriber_round'] as const)(
    'recognizes %s as allowance funding even for a Plus duration',
    (method) => {
      const copy = upgradeSheetCopy(
        {
          can_upgrade: true,
          method,
          allowance_remaining: 4,
          target_duration_seconds: 15,
        },
        10,
      );
      expect(copy.title).toBe('15-second cinematic');
      expect(copy.subtitle).toContain('Included with your allowance');
      expect(copy.lines).toEqual(['Uses 1 of 4 monthly video reveals']);
      expect(copy.rows).toEqual([]);
    },
  );

  it('recognizes new_user_grant without falsely quoting a credit spend', () => {
    const copy = upgradeSheetCopy(
      {
        can_upgrade: true,
        method: 'new_user_grant',
        target_duration_seconds: 12,
      },
      10,
    );
    expect(copy.subtitle).toContain('Included with your welcome grant');
    expect(copy.rows).toEqual([]);
  });

  it('does not invent an allowance balance when a round preview omits it', () => {
    const copy = upgradeSheetCopy(
      {
        can_upgrade: true,
        method: 'subscriber_round',
        target_duration_seconds: 15,
      },
      10,
    );
    expect(copy.lines).toEqual(['Uses 1 monthly video reveal']);
  });
  it('states the price, balance and remainder before a credit spend', () => {
    const copy = upgradeSheetCopy(
      { can_upgrade: true, method: 'credits', cost_credits: 3 },
      10,
    );
    expect(copy.title).toBe('Cinematic video');
    expect(copy.subtitle).toBe('A short AI-generated clip of this battle.');
    expect(copy.confirmLabel).toBe('Get the video');
    expect(copy.lines).toEqual([]);
    expect(copy.rows).toEqual([
      { label: 'Price', value: '3 credits', amount: 3 },
      { label: 'Balance', value: '10 credits', amount: 10 },
      { label: 'After', value: '7 credits', amount: 7 },
    ]);
  });

  it('prefers the server’s balance over the cached one', () => {
    const copy = upgradeSheetCopy(
      {
        can_upgrade: true,
        method: 'credits',
        cost_credits: 3,
        credits_balance: 5,
      },
      10,
    );
    expect(copy.rows).toContainEqual({
      label: 'Balance',
      value: '5 credits',
      amount: 5,
    });
    expect(copy.rows).toContainEqual({
      label: 'After',
      value: '2 credits',
      amount: 2,
    });
  });

  it('omits the balance rows while the wallet is still loading', () => {
    const copy = upgradeSheetCopy(
      { can_upgrade: true, method: 'credits', cost_credits: 3 },
      null,
    );
    expect(copy.rows).toEqual([
      { label: 'Price', value: '3 credits', amount: 3 },
    ]);
  });

  it('says which allowance it uses when a subscription covers it', () => {
    const copy = upgradeSheetCopy(
      {
        can_upgrade: true,
        method: 'subscription_allowance',
        allowance_remaining: 4,
      },
      10,
    );
    expect(copy.lines).toEqual(['Uses 1 of 4 monthly video reveals']);
    expect(copy.rows).toEqual([]);
  });

  it('explains the welcome grant without a routine price label', () => {
    const copy = upgradeSheetCopy(
      { can_upgrade: true, method: 'free_grant', free_grants_remaining: 2 },
      10,
    );
    expect(copy.rows).toEqual([]);
    expect(copy.lines).toEqual(['Included with your welcome grant.']);
  });
});

describe('cinematic job duration', () => {
  it.each([8, 12, 15, 20])(
    'labels a created job using its frozen %i-second duration',
    (duration) => {
      expect(
        cinematicLabel({
          target_duration_seconds: duration,
          battle_round_id: 'r1',
        }),
      ).toBe(`${duration}-second cinematic`);
    },
  );
  it('keeps legacy job labels at their original round/single duration', () => {
    expect(cinematicLabel({ battle_round_id: 'r1' })).toBe(
      '8-second cinematic',
    );
    expect(cinematicLabel({ battle_round_id: null })).toBe(
      '12-second cinematic',
    );
  });
});

describe('upgradeBlockedCopy', () => {
  it('names the shortfall when both numbers are known', () => {
    expect(
      upgradeBlockedCopy(
        {
          can_upgrade: false,
          method: 'none',
          cost_credits: 3,
          credits_balance: 1,
        },
        99,
      ),
    ).toEqual({
      title: 'Not enough credits',
      message: 'You need 2 more credits for this. Top up in the shop.',
    });
  });

  it('falls back to the generic sentence otherwise', () => {
    expect(
      upgradeBlockedCopy({ can_upgrade: false, method: 'none' }, null).message,
    ).toBe('You don’t have enough credits for this. Top up in the shop.');
  });
});

describe('judge copy', () => {
  it('has a fallback for a missing explanation, scoped to what is being shown', () => {
    expect(judgeNotesUnavailable('battle')).toBe(
      'The judge’s notes aren’t available for this battle.',
    );
    expect(judgeNotesUnavailable('round')).toBe(
      'The judge’s notes aren’t available for this round.',
    );
  });

  it('states the single-format matchup without implying a modifier', () => {
    expect(singleMatchupNote('attack', 'defense')).toBe(
      'Your Attack vs their Defense. Move types don’t change the score in single battles.',
    );
    expect(singleMatchupNote('attack', null)).toBeNull();
    expect(singleMatchupNote(undefined, 'defense')).toBeNull();
  });
});

describe('fighterNameFor', () => {
  const tier0 = {
    players: {
      player_one: { profile_id: ME, character_name: 'Vex' },
      player_two: { profile_id: null, character_name: 'Rival Bot' },
    },
  };

  it('reads the side’s character name, bots included', () => {
    expect(fighterNameFor(tier0, 'player_one', 'You')).toBe('Vex');
    expect(fighterNameFor(tier0, 'player_two', 'Opponent')).toBe('Rival Bot');
  });

  it('falls back when the payload predates character_name or is blank', () => {
    expect(
      fighterNameFor(
        { players: { player_one: { archetype: 'titan' } } },
        'player_one',
        'You',
      ),
    ).toBe('You');
    expect(
      fighterNameFor(
        { players: { player_two: { character_name: '   ' } } },
        'player_two',
        'Opponent',
      ),
    ).toBe('Opponent');
    expect(fighterNameFor(null, 'player_one', 'You')).toBe('You');
  });
});

describe('number formatting', () => {
  it('formats move modifiers as signed points with a real minus sign', () => {
    expect(formatPoints(0.9)).toBe('+0.9 pts');
    expect(formatPoints(-0.6)).toBe('−0.6 pts');
    expect(formatPoints(0)).toBe('0.0 pts');
    expect(formatPoints(null)).toBe('0.0 pts');
  });

  it('formats stat modifiers as signed percentages', () => {
    expect(formatPct(0.125)).toBe('+12.5%');
    expect(formatPct(-0.05)).toBe('−5.0%');
    expect(formatPct(undefined)).toBe('0.0%');
  });

  it('writes the matchup line with move labels', () => {
    expect(moveMatchupLine('attack', 'defense', -0.6)).toBe(
      'Your Attack vs their Defense · −0.6 pts',
    );
  });
});

it('shows a completed bot round as lost from its frozen winner side, regardless of scores', () => {
  const botRound = round({
    round_winner_id: null,
    player_one_score: 50,
    player_two_score: 10,
    judge_payload: {
      combat: {
        winner: 2,
        playerOneScore: 50,
        playerTwoScore: 10,
        playerOneDamage: 20,
        playerTwoDamage: 0,
        scoreGap: 40,
      },
    },
  });
  expect(
    roundMiniView(botRound, { myProfileId: ME, playerOneId: ME }),
  ).toMatchObject({
    outcome: 'lost',
    status: 'Opponent won',
    scoreLine: '50.0 vs 10.0',
  });
});
