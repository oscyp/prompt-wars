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
    for (const status of ['queued', 'submitted', 'processing']) {
      expect(videoStatusCopy({ status, hasUrl: false })).toEqual({
        title: 'Cinematic video',
        body: 'Generating your cinematic… usually a few minutes',
        tone: 'pending',
      });
    }
    expect(videoStatusCopy({ status: 'succeeded', hasUrl: false })).toEqual({
      title: 'Cinematic video',
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
});

describe('upgradeSheetCopy', () => {
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
      { label: 'Price', value: '3 credits' },
      { label: 'Balance', value: '10 credits' },
      { label: 'After', value: '7 credits' },
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
    expect(copy.rows).toContainEqual({ label: 'Balance', value: '5 credits' });
    expect(copy.rows).toContainEqual({ label: 'After', value: '2 credits' });
  });

  it('omits the balance rows while the wallet is still loading', () => {
    const copy = upgradeSheetCopy(
      { can_upgrade: true, method: 'credits', cost_credits: 3 },
      null,
    );
    expect(copy.rows).toEqual([{ label: 'Price', value: '3 credits' }]);
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

  it('shows Free for a welcome grant', () => {
    const copy = upgradeSheetCopy(
      { can_upgrade: true, method: 'free_grant', free_grants_remaining: 2 },
      10,
    );
    expect(copy.rows).toEqual([{ label: 'Price', value: 'Free' }]);
    expect(copy.lines).toEqual(['Included with your welcome grant.']);
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
