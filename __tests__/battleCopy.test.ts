import {
  modeLabel,
  moveLabel,
  describeSubmitError,
  roundOutcomeFor,
  roundOutcomeCopy,
  seriesHeadline,
  ratingDeltaLabel,
  arenaPrimaryActionCopy,
} from '@/utils/battleCopy';
import { classifySuggestionFailure, hasOpponent } from '@/utils/battles';
import { orientSeriesScore } from '@/components/SeriesScoreIndicator';
import { inkFor, contrastRatio } from '@/utils/contrast';

describe('modeLabel', () => {
  it('uses the mode sheet titles so a mode has one name', () => {
    expect(modeLabel('ranked')).toBe('Ranked Battle');
    expect(modeLabel('unranked')).toBe('Casual Battle');
    expect(modeLabel('bot')).toBe('Practice vs Bot');
  });

  it('covers the modes the sheet does not sell', () => {
    expect(modeLabel('friend_challenge')).toBe('Friend Challenge');
    expect(modeLabel('daily_theme')).toBe('Daily Theme');
    expect(modeLabel('whatever')).toBe('Battle');
    expect(modeLabel(undefined)).toBe('Battle');
  });
});

describe('moveLabel', () => {
  it('capitalises the enum for prose', () => {
    expect(moveLabel('attack')).toBe('Attack');
    expect(moveLabel('finisher')).toBe('Finisher');
    expect(moveLabel(null)).toBe('');
  });
});

describe('arenaPrimaryActionCopy', () => {
  it('uses turn language only when the player must act', () => {
    expect(arenaPrimaryActionCopy('Your turn', 'Moon duel')).toEqual({
      eyebrow: 'YOUR TURN',
      title: 'Continue your battle',
      subtitle: 'Moon duel',
      accessibilityLabel: 'Your turn. Continue battle: Moon duel',
    });
  });

  it('labels ready and generating results without asking for another turn', () => {
    expect(arenaPrimaryActionCopy('Result ready', 'Moon duel')).toMatchObject({
      eyebrow: 'RESULT READY',
      title: 'Reveal your battle',
      accessibilityLabel: 'Result ready. Reveal battle: Moon duel',
    });
    expect(arenaPrimaryActionCopy('Cinematic on the way', 'Moon duel')).toEqual(
      {
        eyebrow: 'BATTLE RESULT',
        title: 'View your result',
        subtitle: 'Moon duel · Cinematic on the way',
        accessibilityLabel:
          'Cinematic on the way. View battle result: Moon duel',
      },
    );
  });
});

describe('describeSubmitError', () => {
  it('explains a held-for-review prompt without the developer string', () => {
    const copy = describeSubmitError({
      status: 403,
      code: 'moderation_review',
      message: 'Prompt requires review and cannot be submitted at this time',
    });
    expect(copy.title).toBe('Held for review');
    expect(copy.message).not.toContain('cannot be submitted');
    expect(copy.message).toMatch(/reword/i);
    expect(copy.roundClosed).toBe(false);
  });

  it('turns a moderation refusal into an edit-and-retry', () => {
    const copy = describeSubmitError({
      status: 403,
      message: 'Prompt rejected: graphic violence',
    });
    expect(copy.title).toBe('Not allowed by moderation');
    expect(copy.message).toContain('graphic violence');
    expect(copy.roundClosed).toBe(false);
  });

  it('does not echo the generic policy string as a reason', () => {
    const copy = describeSubmitError({
      status: 403,
      message: 'Prompt rejected: Content policy violation',
    });
    expect(copy.message).toBe(
      'Your prompt didn’t pass moderation. Edit it and try again.',
    );
  });

  it('marks a 409 as the round having moved on', () => {
    const copy = describeSubmitError({
      status: 409,
      message: 'Round not accepting prompts (status=resolving)',
    });
    expect(copy.roundClosed).toBe(true);
    expect(copy.message).not.toContain('status=');
  });

  it('never surfaces server prose for unknown failures', () => {
    const copy = describeSubmitError({
      status: 500,
      message: 'Internal error',
    });
    expect(copy.message).not.toContain('Internal error');
    expect(copy.title).toBe('Couldn’t lock in');
  });
});

describe('classifySuggestionFailure', () => {
  it('reads the code or the status, never the prose', () => {
    expect(classifySuggestionFailure(402, undefined)).toBe(
      'insufficient_credits',
    );
    expect(classifySuggestionFailure(undefined, 'insufficient_credits')).toBe(
      'insufficient_credits',
    );
    expect(classifySuggestionFailure(429, undefined)).toBe('rate_limited');
    expect(classifySuggestionFailure(500, 'provider_error')).toBe(
      'unavailable',
    );
    expect(classifySuggestionFailure(undefined, undefined)).toBe('unavailable');
  });
});

describe('hasOpponent', () => {
  it('counts a bot from its persona and a human from their id', () => {
    expect(hasOpponent({ player_two_id: null, bot_persona_id: null })).toBe(
      false,
    );
    expect(hasOpponent({ player_two_id: 'p2', bot_persona_id: null })).toBe(
      true,
    );
    expect(hasOpponent({ player_two_id: null, bot_persona_id: 'bot' })).toBe(
      true,
    );
    expect(hasOpponent({ player_two_id: null, is_player_two_bot: true })).toBe(
      true,
    );
  });
});

describe('orientSeriesScore', () => {
  it('shows player two their own lead as a lead', () => {
    expect(orientSeriesScore({ p1: 1, p2: 2 }, 'p2')).toEqual({
      mine: 2,
      theirs: 1,
    });
    expect(orientSeriesScore({ p1: 1, p2: 2 }, 'p1')).toEqual({
      mine: 1,
      theirs: 2,
    });
  });
});

describe('round outcome copy', () => {
  it('derives the outcome from the winner id, not from scores', () => {
    expect(
      roundOutcomeFor({
        status: 'result_ready',
        isDraw: false,
        roundWinnerId: 'me',
        myProfileId: 'me',
      }),
    ).toBe('won');
    expect(
      roundOutcomeFor({
        status: 'result_ready',
        isDraw: false,
        roundWinnerId: 'them',
        myProfileId: 'me',
      }),
    ).toBe('lost');
    expect(
      roundOutcomeFor({
        status: 'result_ready',
        isDraw: true,
        roundWinnerId: null,
        myProfileId: 'me',
      }),
    ).toBe('draw');
    expect(
      roundOutcomeFor({
        status: 'resolving',
        isDraw: false,
        roundWinnerId: null,
        myProfileId: 'me',
      }),
    ).toBe('pending');
  });

  it('names a knockout and the series consequence', () => {
    expect(
      roundOutcomeCopy({
        outcome: 'won',
        roundNumber: 2,
        isKo: true,
        seriesComplete: true,
        mine: 2,
        theirs: 0,
      }),
    ).toEqual({
      title: 'Knockout! Round 2 is yours',
      subtitle: 'Series 2–0 · you take the series',
    });
    expect(
      roundOutcomeCopy({
        outcome: 'lost',
        roundNumber: 1,
        isKo: false,
        seriesComplete: false,
        mine: 0,
        theirs: 1,
      }),
    ).toEqual({ title: 'Round 1 lost', subtitle: 'Series 0–1' });
    expect(
      roundOutcomeCopy({
        outcome: 'draw',
        roundNumber: 3,
        isKo: false,
        seriesComplete: false,
        mine: 1,
        theirs: 1,
      }),
    ).toEqual({
      title: 'Round 3 drawn',
      subtitle: 'Series 1–1 · no damage dealt',
    });
  });

  it('writes the series headline from the viewer’s side', () => {
    expect(
      seriesHeadline({ mine: 2, theirs: 1, isDraw: false, isWinner: true }),
    ).toBe('You won the series 2–1');
    expect(
      seriesHeadline({ mine: 1, theirs: 2, isDraw: false, isWinner: false }),
    ).toBe('You lost the series 1–2');
    expect(
      seriesHeadline({ mine: 1, theirs: 1, isDraw: true, isWinner: false }),
    ).toBe('Series drawn 1–1');
  });
});

describe('ratingDeltaLabel', () => {
  it('rounds and signs the delta', () => {
    expect(ratingDeltaLabel(12.4)).toBe('Rating +12');
    expect(ratingDeltaLabel(-7.6)).toBe('Rating -8');
    expect(ratingDeltaLabel(0.2)).toBe('Rating unchanged');
    expect(ratingDeltaLabel(null)).toBeNull();
  });
});

describe('inkFor', () => {
  it('picks dark ink on the dark palette’s light move colours', () => {
    expect(inkFor('#F87171')).toBe('#0B0B0F');
    expect(inkFor('#60A5FA')).toBe('#0B0B0F');
    expect(inkFor('#F472B6')).toBe('#0B0B0F');
  });

  it('keeps white on genuinely dark fills', () => {
    expect(inkFor('#7C3AED')).toBe('#FFFFFF');
    expect(inkFor('#0B0B0F')).toBe('#FFFFFF');
  });

  it('falls back to white when the colour cannot be parsed', () => {
    expect(inkFor('rgba(0,0,0,0.5)')).toBe('#FFFFFF');
  });

  it('meets AA for every move colour in both palettes with its chosen ink', () => {
    for (const fill of [
      '#EF4444',
      '#3B82F6',
      '#DB2777',
      '#F87171',
      '#60A5FA',
      '#F472B6',
    ]) {
      const ratio = contrastRatio(fill, inkFor(fill));
      expect(ratio).not.toBeNull();
      expect(ratio as number).toBeGreaterThanOrEqual(4.5);
    }
  });
});
