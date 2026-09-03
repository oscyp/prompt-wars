/**
 * The editor's length coaching, pinned.
 *
 * Two rulers: characters for the server's hard floor/ceiling (trimmed, like
 * the CHECK constraint), words for the judge's soft target. Each band and each
 * boundary is asserted so a future tweak to one ruler cannot silently move the
 * other.
 */
import {
  coachPrompt,
  countWords,
  COACH_DEFAULTS,
  WORDS_MIN_GOOD,
  WORDS_MAX_GOOD,
  WORDS_PENALTY,
} from '@/utils/promptCoach';

/** `n` distinct six-character words, so the char floor is never the limiter. */
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${String(i).padStart(2, '0')}`).join(
    ' ',
  );

describe('countWords', () => {
  it('is 0 for blank and whitespace-only input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });

  it('splits on any run of whitespace', () => {
    expect(countWords('one  two\nthree\t four')).toBe(4);
  });
});

describe('coachPrompt', () => {
  it('uses 20–800 characters by default', () => {
    expect(COACH_DEFAULTS).toEqual({ minChars: 20, maxChars: 800 });
  });

  describe('empty', () => {
    it('reports empty for blank and whitespace-only input', () => {
      for (const text of ['', '   ', '\n\n']) {
        const r = coachPrompt(text);
        expect(r.state).toBe('empty');
        expect(r.tone).toBe('muted');
        expect(r.icon).toBe('ellipse-outline');
        expect(r.label).toBe(
          `Aim for ${WORDS_MIN_GOOD}–${WORDS_MAX_GOOD} words`,
        );
        expect(r.chars).toBe(0);
        expect(r.words).toBe(0);
      }
    });
  });

  describe('tooShort by characters', () => {
    it('counts down to the floor using the trimmed length', () => {
      const r = coachPrompt('Strike hard'); // 11 chars
      expect(r.state).toBe('tooShort');
      expect(r.tone).toBe('warning');
      expect(r.icon).toBe('alert-circle');
      expect(r.label).toBe('At least 20 characters · 9 to go');
      expect(r.chars).toBe(11);
    });

    it('is tooShort at 19 characters and clears the floor at 20', () => {
      const nineteen = 'abcdefghijklmnopqrs';
      expect(nineteen).toHaveLength(19);
      expect(coachPrompt(nineteen).state).toBe('tooShort');
      expect(coachPrompt(nineteen).label).toBe(
        'At least 20 characters · 1 to go',
      );
      const twenty = nineteen + 't';
      expect(coachPrompt(twenty).label).not.toMatch(/^At least/);
    });

    it('does not let surrounding whitespace count toward the floor', () => {
      const padded = '     Strike hard     ';
      const r = coachPrompt(padded);
      expect(r.chars).toBe(11);
      expect(r.state).toBe('tooShort');
      expect(r.label).toBe('At least 20 characters · 9 to go');
    });

    it('respects a custom minChars', () => {
      const r = coachPrompt('abc', { minChars: 5, maxChars: 800 });
      expect(r.label).toBe('At least 5 characters · 2 to go');
    });
  });

  describe('tooShort by words (past the floor, under the sweet spot)', () => {
    it('is still tooShort but says so in words', () => {
      const r = coachPrompt(words(4)); // 27 chars, 4 words
      expect(r.chars).toBeGreaterThanOrEqual(20);
      expect(r.state).toBe('tooShort');
      expect(r.tone).toBe('warning');
      expect(r.label).toBe(
        `Short — aim for ${WORDS_MIN_GOOD}–${WORDS_MAX_GOOD} words`,
      );
    });

    it('flips to good at exactly the word minimum', () => {
      expect(coachPrompt(words(WORDS_MIN_GOOD - 1)).state).toBe('tooShort');
      expect(coachPrompt(words(WORDS_MIN_GOOD)).state).toBe('good');
    });
  });

  describe('good', () => {
    it('covers the judge sweet spot inclusive on both ends', () => {
      for (const n of [WORDS_MIN_GOOD, 40, WORDS_MAX_GOOD]) {
        const r = coachPrompt(words(n));
        expect(r.state).toBe('good');
        expect(r.tone).toBe('success');
        expect(r.icon).toBe('checkmark-circle');
        expect(r.label).toBe('Good length');
        expect(r.words).toBe(n);
      }
    });
  });

  describe('long', () => {
    it('starts one past the sweet spot and runs to the penalty line', () => {
      for (const n of [WORDS_MAX_GOOD + 1, 90, WORDS_PENALTY]) {
        const r = coachPrompt(words(n));
        expect(r.state).toBe('long');
        expect(r.tone).toBe('warning');
        expect(r.icon).toBe('alert-circle');
        expect(r.label).toBe('Getting long');
      }
    });
  });

  describe('tooLong', () => {
    it('is tooLong one word past the penalty line', () => {
      const r = coachPrompt(words(WORDS_PENALTY + 1));
      expect(r.state).toBe('tooLong');
      expect(r.tone).toBe('error');
      expect(r.icon).toBe('close-circle');
      expect(r.label).toBe('Too long — the judge caps length');
    });

    it('is tooLong past maxChars even with few words', () => {
      const oneHugeWord = 'x'.repeat(801);
      const r = coachPrompt(oneHugeWord);
      expect(r.state).toBe('tooLong');
      expect(r.label).toBe('Too long — max 800 characters');
      expect(r.words).toBe(1);
    });

    it('is not tooLong at exactly maxChars', () => {
      const r = coachPrompt(words(30).padEnd(800, 'y'));
      expect(r.chars).toBe(800);
      expect(r.state).not.toBe('tooLong');
    });
  });

  describe('counter', () => {
    it('reports words and the trimmed character count over the maximum', () => {
      const r = coachPrompt('  Strike hard and fast  ');
      expect(r.counter).toBe('4 words · 20/800');
    });

    it('uses the singular for one word', () => {
      expect(coachPrompt('Strike').counter).toBe('1 word · 6/800');
    });

    it('reads 0 words for blank input', () => {
      expect(coachPrompt('   ').counter).toBe('0 words · 0/800');
    });

    it('shows the configured maximum', () => {
      const r = coachPrompt('hello', { minChars: 1, maxChars: 100 });
      expect(r.counter).toBe('1 word · 5/100');
    });
  });
});
