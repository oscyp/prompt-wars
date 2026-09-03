/**
 * "Changed since last render" names fields, so each column must map to the
 * right snapshot key and to the same label the save sheet uses.
 */
import {
  changedSinceRender,
  describeChangedSinceRender,
  type LookDiffCharacter,
} from '@/utils/lookDiff';
import type { PortraitPromptSnapshot } from '@/utils/characters';

const CHARACTER: LookDiffCharacter = {
  archetype: 'strategist',
  signature_color: '#8B5CF6',
  signature_item_id: 'item-1',
  vibe: 'heroic',
  silhouette: 'lean',
  palette_key: 'ember',
  era: 'modern',
  expression: 'calm',
  art_style: 'painterly',
  portrait_prompt_raw: null,
};

const SNAPSHOT: PortraitPromptSnapshot = {
  raw: null,
  resolved: 'a heroic champion',
  traits: {
    vibe: 'heroic',
    silhouette: 'lean',
    palette: 'ember',
    era: 'modern',
    expression: 'calm',
  },
  archetype: 'strategist',
  signature_color: '#8B5CF6',
  signature_item_id: 'item-1',
  art_style: 'painterly',
};

describe('changedSinceRender', () => {
  it('is empty when the character matches the snapshot', () => {
    expect(changedSinceRender(CHARACTER, SNAPSHOT)).toEqual([]);
  });

  it('is empty without a snapshot to compare against', () => {
    expect(changedSinceRender({ ...CHARACTER, era: 'ancient' }, null)).toEqual(
      [],
    );
  });

  it.each([
    ['archetype', 'trickster', 'Archetype'],
    ['signature_color', '#0EA5E9', 'Signature colour'],
    ['signature_item_id', 'item-2', 'Signature item'],
    ['vibe', 'unhinged', 'Vibe'],
    ['silhouette', 'bulky', 'Silhouette'],
    ['era', 'ancient', 'Era'],
    ['expression', 'smirk', 'Expression'],
    ['art_style', 'comic', 'Art style'],
    ['portrait_prompt_raw', 'a neon knight', 'Description'],
  ] as const)('maps %s to "%s" → %s', (column, value, label) => {
    expect(
      changedSinceRender({ ...CHARACTER, [column]: value }, SNAPSHOT),
    ).toEqual([label]);
  });

  it('compares palette_key with traits.palette', () => {
    expect(
      changedSinceRender({ ...CHARACTER, palette_key: 'ocean' }, SNAPSHOT),
    ).toEqual(['Outfit palette']);
    expect(
      changedSinceRender(CHARACTER, {
        ...SNAPSHOT,
        traits: { ...SNAPSHOT.traits, palette: 'ocean' },
      }),
    ).toEqual(['Outfit palette']);
  });

  it('treats an empty prompt and a null prompt as the same prompt', () => {
    expect(
      changedSinceRender({ ...CHARACTER, portrait_prompt_raw: '' }, SNAPSHOT),
    ).toEqual([]);
    expect(
      changedSinceRender(
        { ...CHARACTER, portrait_prompt_raw: null },
        { ...SNAPSHOT, raw: '' },
      ),
    ).toEqual([]);
  });

  it('ignores art_style when the snapshot predates the key', () => {
    const { art_style: _omitted, ...legacy } = SNAPSHOT;
    expect(
      changedSinceRender({ ...CHARACTER, art_style: 'comic' }, legacy),
    ).toEqual([]);
  });

  it('compares art_style when the key is present, even as null', () => {
    expect(
      changedSinceRender(CHARACTER, { ...SNAPSHOT, art_style: null }),
    ).toEqual(['Art style']);
  });

  it('tolerates a snapshot without traits', () => {
    const { traits: _omitted, ...noTraits } = SNAPSHOT;
    expect(changedSinceRender(CHARACTER, noTraits)).toEqual([
      'Outfit palette',
      'Vibe',
      'Silhouette',
      'Era',
      'Expression',
    ]);
  });

  it('lists several changes in DRAFT_FIELDS order', () => {
    expect(
      changedSinceRender(
        {
          ...CHARACTER,
          era: 'ancient',
          art_style: 'comic',
          archetype: 'trickster',
        },
        SNAPSHOT,
      ),
    ).toEqual(['Archetype', 'Art style', 'Era']);
  });
});

describe('describeChangedSinceRender', () => {
  it('is null while the render is current, whatever the labels say', () => {
    expect(describeChangedSinceRender(['Era'], false)).toBeNull();
    expect(describeChangedSinceRender([], false)).toBeNull();
  });

  it('names the fields when it can', () => {
    expect(describeChangedSinceRender(['Era', 'Art style'], true)).toBe(
      'Changed since last render: Era, Art style',
    );
  });

  it('falls back to the generic line for a legacy snapshot', () => {
    expect(describeChangedSinceRender([], true)).toBe(
      'Look changed since last render',
    );
  });
});
