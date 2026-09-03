import {
  traitOptions,
  archetypeOptions,
  PALETTE_SWATCH_OPTIONS,
  type TraitOptionKey,
} from '@/utils/traitOptions';
import {
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  ITEM_CLASSES,
  PALETTES,
  PALETTE_HEX,
  TRAIT_LABELS,
  TRAIT_DESCRIPTIONS,
} from '@/constants/CharacterTraits';
import { ARCHETYPE_LIST } from '@/constants/Archetypes';

type Labelled = Record<string, string>;

const ENUM_CASES: [TraitOptionKey, readonly string[], Labelled][] = [
  ['vibe', VIBES, TRAIT_LABELS.vibe],
  ['silhouette', SILHOUETTES, TRAIT_LABELS.silhouette],
  ['era', ERAS, TRAIT_LABELS.era],
  ['expression', EXPRESSIONS, TRAIT_LABELS.expression],
  ['itemClass', ITEM_CLASSES, TRAIT_LABELS.itemClass],
];

const DESCRIBED: [Exclude<TraitOptionKey, 'itemClass'>, Labelled][] = [
  ['vibe', TRAIT_DESCRIPTIONS.vibe],
  ['silhouette', TRAIT_DESCRIPTIONS.silhouette],
  ['era', TRAIT_DESCRIPTIONS.era],
  ['expression', TRAIT_DESCRIPTIONS.expression],
];

describe('traitOptions', () => {
  it.each(ENUM_CASES)(
    '%s values and labels follow the enum, in enum order',
    (key, values, labels) => {
      const options = traitOptions(key);
      expect(options.map((o) => o.value)).toEqual([...values]);
      expect(options.map((o) => o.label)).toEqual(values.map((v) => labels[v]));
    },
  );

  it.each(DESCRIBED)(
    'every %s option carries its description',
    (key, descriptions) => {
      for (const option of traitOptions(key)) {
        expect(option.description).toBe(descriptions[option.value]);
        expect(option.description).toBeTruthy();
      }
    },
  );

  it('item classes have no description (there is none to show)', () => {
    for (const option of traitOptions('itemClass')) {
      expect(option.description).toBeUndefined();
    }
  });

  it('returns the same frozen array on every call', () => {
    const first = traitOptions('vibe');
    expect(traitOptions('vibe')).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

describe('archetypeOptions', () => {
  it('maps each archetype to a swatch and a "Rewards …" description', () => {
    const options = archetypeOptions();
    expect(options).toHaveLength(ARCHETYPE_LIST.length);
    ARCHETYPE_LIST.forEach((a, i) => {
      expect(options[i]).toEqual({
        value: a.id,
        label: a.name,
        description: `Rewards ${a.rewards}`,
        swatch: a.color,
      });
    });
  });

  it('is a stable reference', () => {
    expect(archetypeOptions()).toBe(archetypeOptions());
  });
});

describe('PALETTE_SWATCH_OPTIONS', () => {
  it('covers every palette with its hex and label', () => {
    expect(PALETTE_SWATCH_OPTIONS.map((o) => o.value)).toEqual(
      PALETTES.map((p) => p.key),
    );
    for (const option of PALETTE_SWATCH_OPTIONS) {
      const key = option.value as keyof typeof PALETTE_HEX;
      expect(option.hex).toBe(PALETTE_HEX[key]);
      expect(option.label).toBe(TRAIT_LABELS.palette[key]);
    }
  });
});
