import {
  PORTRAIT_PHRASES,
  describeLook,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  PALETTES,
} from '@/constants/CharacterTraits';

/**
 * The resolver falls back to the raw key when a trait has no phrase, so a gap
 * here does not fail loudly — it ships `lean_duelist` to the image model and to
 * the player's description preview. Every silhouette did exactly that until the
 * phrase tables were re-keyed onto the real column values.
 */
describe('PORTRAIT_PHRASES coverage', () => {
  const cases: [string, readonly string[], Record<string, string>][] = [
    ['vibe', VIBES, PORTRAIT_PHRASES.vibe],
    ['silhouette', SILHOUETTES, PORTRAIT_PHRASES.silhouette],
    ['era', ERAS, PORTRAIT_PHRASES.era],
    ['expression', EXPRESSIONS, PORTRAIT_PHRASES.expression],
    ['palette', PALETTES.map((p) => p.key), PORTRAIT_PHRASES.palette],
  ];

  it.each(cases)('every %s value has a phrase', (_label, values, phrases) => {
    expect(values.filter((v) => !phrases[v])).toEqual([]);
  });

  it.each(cases)('no %s phrase is keyed on a value that cannot occur', (_l, values, phrases) => {
    expect(Object.keys(phrases).filter((k) => !values.includes(k))).toEqual([]);
  });

  it('never leaks a snake_case identifier into the sentence', () => {
    for (const vibe of VIBES) {
      for (const silhouette of SILHOUETTES) {
        for (const era of ERAS) {
          const sentence = describeLook({ vibe, silhouette, era });
          expect(sentence).not.toMatch(/[a-z]+_[a-z]+/);
        }
      }
    }
  });
});

describe('describeLook', () => {
  it('reads as one sentence in the resolver’s order', () => {
    expect(
      describeLook({
        vibe: 'mischievous',
        silhouette: 'lean_duelist',
        expression: 'roar',
        palette: 'neon',
        era: 'far_future',
        artStyle: 'comic',
      }),
    ).toBe(
      'A champion with a mischievous gleam, a lean duelist build, an open roar, ' +
        'a colour story of neon magenta and cyan, a far-future sci-fi setting — ' +
        'drawn as comic book.',
    );
  });

  it('omits traits that are not set rather than leaving gaps', () => {
    expect(describeLook({ vibe: 'regal', era: 'ancient' })).toBe(
      'A champion with regal poise, an ancient mythic setting.',
    );
  });

  it('still says something for a character with nothing chosen', () => {
    expect(describeLook({})).toBe('A champion.');
  });
});
