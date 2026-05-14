/**
 * Character trait enums and palette values.
 *
 * Values must match backend CHECK constraints exactly.
 * See `supabase/migrations/*characters*` and the implementation concept doc.
 */

export const VIBES = [
  'heroic',
  'sinister',
  'mischievous',
  'stoic',
  'unhinged',
  'regal',
] as const;
export type Vibe = (typeof VIBES)[number];

export const SILHOUETTES = [
  'lean_duelist',
  'heavy_bruiser',
  'slim_trickster',
  'armored_knight',
  'robed_mystic',
  'sharp_tactician',
] as const;
export type Silhouette = (typeof SILHOUETTES)[number];

export const ERAS = [
  'ancient',
  'industrial',
  'modern',
  'cyberpunk',
  'far_future',
] as const;
export type Era = (typeof ERAS)[number];

export const EXPRESSIONS = [
  'smirk',
  'glare',
  'calm',
  'roar',
  'smile',
  'thousand_yard',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface PaletteEntry {
  key: PaletteKey;
  hex: string;
}

export const PALETTES = [
  { key: 'ember', hex: '#EF4444' },
  { key: 'ocean', hex: '#0EA5E9' },
  { key: 'neon', hex: '#D946EF' },
  { key: 'bone', hex: '#E7E5E4' },
  { key: 'forest', hex: '#16A34A' },
  { key: 'royal', hex: '#7C3AED' },
  { key: 'ash', hex: '#6B7280' },
  { key: 'gold', hex: '#EAB308' },
] as const satisfies ReadonlyArray<{ key: string; hex: string }>;

export type PaletteKey =
  | 'ember'
  | 'ocean'
  | 'neon'
  | 'bone'
  | 'forest'
  | 'royal'
  | 'ash'
  | 'gold';

export const PALETTE_HEX: Record<PaletteKey, string> = PALETTES.reduce(
  (acc, p) => {
    acc[p.key] = p.hex;
    return acc;
  },
  {} as Record<PaletteKey, string>,
);

export const ITEM_CLASSES = [
  'tool',
  'symbol',
  'weaponized_mundane',
  'relic',
  'instrument',
] as const;
export type ItemClass = (typeof ITEM_CLASSES)[number];

/** Human-readable labels for every enum value above. */
export const TRAIT_LABELS: {
  vibe: Record<Vibe, string>;
  silhouette: Record<Silhouette, string>;
  era: Record<Era, string>;
  expression: Record<Expression, string>;
  palette: Record<PaletteKey, string>;
  itemClass: Record<ItemClass, string>;
} = {
  vibe: {
    heroic: 'Heroic',
    sinister: 'Sinister',
    mischievous: 'Mischievous',
    stoic: 'Stoic',
    unhinged: 'Unhinged',
    regal: 'Regal',
  },
  silhouette: {
    lean_duelist: 'Lean Duelist',
    heavy_bruiser: 'Heavy Bruiser',
    slim_trickster: 'Slim Trickster',
    armored_knight: 'Armored Knight',
    robed_mystic: 'Robed Mystic',
    sharp_tactician: 'Sharp Tactician',
  },
  era: {
    ancient: 'Ancient',
    industrial: 'Industrial',
    modern: 'Modern',
    cyberpunk: 'Cyberpunk',
    far_future: 'Far Future',
  },
  expression: {
    smirk: 'Smirk',
    glare: 'Glare',
    calm: 'Calm',
    roar: 'Roar',
    smile: 'Smile',
    thousand_yard: 'Thousand-Yard Stare',
  },
  palette: {
    ember: 'Ember',
    ocean: 'Ocean',
    neon: 'Neon',
    bone: 'Bone',
    forest: 'Forest',
    royal: 'Royal',
    ash: 'Ash',
    gold: 'Gold',
  },
  itemClass: {
    tool: 'Tool',
    symbol: 'Symbol',
    weaponized_mundane: 'Weaponized Mundane',
    relic: 'Relic',
    instrument: 'Instrument',
  },
};

export type ArchetypeForTraits =
  | 'strategist'
  | 'trickster'
  | 'titan'
  | 'mystic'
  | 'engineer';

/** Battle-cry suggestions (3 per archetype) used as starter chips. */
export const BATTLE_CRY_SUGGESTIONS: Record<ArchetypeForTraits, string[]> = {
  strategist: [
    'Every move calculated.',
    'I saw this coming.',
    'Checkmate, friend.',
  ],
  trickster: [
    'Catch me if you can!',
    'You blinked. Game over.',
    'Chaos is a ladder.',
  ],
  titan: [
    'I am the storm.',
    'Stand down or fall.',
    'Steel meets bone.',
  ],
  mystic: [
    'The veil parts for me.',
    'Words become worlds.',
    'I dream you defeated.',
  ],
  engineer: [
    'Built to win.',
    'Precision over force.',
    'Specs check out.',
  ],
};

/** Archetype glyphs used by the fallback portrait SVG. */
export const ARCHETYPE_INITIAL: Record<ArchetypeForTraits, string> = {
  strategist: 'S',
  trickster: 'T',
  titan: 'T',
  mystic: 'M',
  engineer: 'E',
};

export const ITEM_CLASS_GLYPH: Record<ItemClass, string> = {
  tool: '⚒',
  symbol: '✦',
  weaponized_mundane: '⚡',
  relic: '✧',
  instrument: '♬',
};
