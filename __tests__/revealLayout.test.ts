import {
  JUDGE_CARDS_STACK_BELOW,
  REVEAL_BOTTOM_BAR_HEIGHT,
  REVEAL_HEADER_OFFSET,
  REVEAL_TOP_BAR_HEIGHT,
  STING_DURATION_MS,
  STING_LANDING_MS,
  VERDICT_DOT_STEP_MS,
  VERDICT_HEADLINE_GAP_MS,
  VERDICT_STAMP_GAP_MS,
  imageSourceChain,
  joinSentences,
  judgeBeatLabel,
  judgeCardsStacked,
  payoffBeatLabel,
  revealContentInsets,
  revealSeenKey,
  summaryJudgeLine,
  verdictTimeline,
} from '@/utils/revealLayout';
import { BEAT_AUTO_ADVANCE_MS, type RevealModel } from '@/utils/revealBeats';

describe('revealContentInsets', () => {
  it('keeps content below the header and the top bar, above the bottom bar', () => {
    const insets = revealContentInsets({ top: 59, bottom: 34 });
    expect(insets.top).toBeGreaterThanOrEqual(
      59 + REVEAL_HEADER_OFFSET + REVEAL_TOP_BAR_HEIGHT,
    );
    expect(insets.bottom).toBeGreaterThanOrEqual(34 + REVEAL_BOTTOM_BAR_HEIGHT);
  });
});

describe('judgeCardsStacked', () => {
  it('stacks below the threshold only', () => {
    expect(judgeCardsStacked(JUDGE_CARDS_STACK_BELOW - 1)).toBe(true);
    expect(judgeCardsStacked(JUDGE_CARDS_STACK_BELOW)).toBe(false);
    expect(judgeCardsStacked(750)).toBe(false);
  });
});

describe('imageSourceChain', () => {
  it('drops empties and duplicates while keeping order', () => {
    expect(
      imageSourceChain([null, 'a', undefined, '  ', 'b', 'a', 'c']),
    ).toEqual(['a', 'b', 'c']);
    expect(imageSourceChain([null, undefined])).toEqual([]);
  });
});

describe('verdictTimeline', () => {
  it('lands dots in step, then the headline, then the stamp', () => {
    const t = verdictTimeline({ dots: 3, hasStamp: true, reduceMotion: false });
    expect(t.dotDelays).toEqual([
      0,
      VERDICT_DOT_STEP_MS,
      VERDICT_DOT_STEP_MS * 2,
    ]);
    expect(t.headlineAt).toBe(
      VERDICT_DOT_STEP_MS * 3 + VERDICT_HEADLINE_GAP_MS,
    );
    expect(t.stampAt).toBe(t.headlineAt + VERDICT_STAMP_GAP_MS);
    expect(t.outcomeAt).toBe(t.stampAt);
  });

  it('fires the outcome with the headline when there is no stamp', () => {
    const t = verdictTimeline({
      dots: 0,
      hasStamp: false,
      reduceMotion: false,
    });
    expect(t.dotDelays).toEqual([]);
    expect(t.headlineAt).toBe(VERDICT_HEADLINE_GAP_MS);
    expect(t.stampAt).toBeNull();
    expect(t.outcomeAt).toBe(t.headlineAt);
  });

  it('is all at rest under Reduce Motion', () => {
    const t = verdictTimeline({ dots: 2, hasStamp: true, reduceMotion: true });
    expect(t).toEqual({
      dotDelays: [0, 0],
      headlineAt: 0,
      stampAt: 0,
      outcomeAt: 0,
    });
  });

  it('finishes inside the verdict beat’s auto-advance for a full 2–1 series', () => {
    const t = verdictTimeline({ dots: 3, hasStamp: true, reduceMotion: false });
    expect(t.outcomeAt).toBeLessThan(BEAT_AUTO_ADVANCE_MS.verdict);
  });
});

describe('sting timing', () => {
  it('every landing happens inside the sting', () => {
    for (const ms of Object.values(STING_LANDING_MS)) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(STING_DURATION_MS);
    }
  });
});

describe('joinSentences', () => {
  it('ends each fragment once, respecting punctuation already there', () => {
    expect(joinSentences(['One', 'Two.', ' Three! ', '', 'Four…'])).toBe(
      'One. Two. Three! Four…',
    );
  });
});

describe('labels', () => {
  const model: RevealModel = {
    me: {
      profileId: 'me',
      name: 'Rook',
      archetype: 'titan',
      signatureColor: null,
      battleCry: null,
      moveType: 'attack',
      promptExcerpt: 'A hammer falls.',
      rubric: null,
      portraitUrl: null,
    },
    them: {
      profileId: 'them',
      name: 'Vex',
      archetype: null,
      signatureColor: null,
      battleCry: null,
      moveType: null,
      promptExcerpt: null,
      rubric: null,
      portraitUrl: null,
    },
    winnerProfileId: 'me',
    isDraw: false,
    isKo: false,
    judgeWhy: 'Rook was clearer.',
    animationPreset: null,
    winnerColor: null,
  };

  it('reads the judge beat as header, judge line, then both prompts', () => {
    expect(judgeBeatLabel(model)).toBe(
      'What the judge saw. Judge: Rook was clearer. Rook, Attack: A hammer falls. Vex: Prompt not recorded.',
    );
  });

  it('reads the payoff rows and any fallback line', () => {
    expect(
      payoffBeatLabel(
        [
          { key: 'rating', label: 'Rating', value: '+12', tone: 'up' },
          {
            key: 'streak',
            label: 'Win streak',
            value: '3',
            tone: 'up',
            detail: 'New best!',
          },
        ],
        null,
      ),
    ).toBe('Your rewards. Rating: +12. Win streak: 3, New best!');
    expect(payoffBeatLabel([], 'Tallying your rewards…')).toBe(
      'Your rewards. Tallying your rewards…',
    );
  });
});

describe('summary helpers', () => {
  it('keys the seen flag per battle', () => {
    expect(revealSeenKey('b1')).toBe('pw:reveal-seen:b1');
  });

  it('shows the judge line only when it adds to the last round', () => {
    expect(
      summaryJudgeLine({
        battleExplanation: ' Same words. ',
        lastRoundExplanation: 'Same words.',
      }),
    ).toBeNull();
    expect(
      summaryJudgeLine({
        battleExplanation: 'Series verdict.',
        lastRoundExplanation: 'Round verdict.',
      }),
    ).toBe('Series verdict.');
    expect(
      summaryJudgeLine({
        battleExplanation: 'Single battle.',
        lastRoundExplanation: undefined,
      }),
    ).toBe('Single battle.');
    expect(
      summaryJudgeLine({ battleExplanation: '', lastRoundExplanation: 'x' }),
    ).toBeNull();
  });
});
