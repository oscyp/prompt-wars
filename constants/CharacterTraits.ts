/**
 * Character trait enums and palette values.
 *
 * Values must match backend CHECK constraints exactly.
 * See `supabase/migrations/*characters*` and the implementation concept doc.
 */

import type { ImageSourcePropType } from 'react-native';

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

/**
 * Short, evocative descriptions of what each abstract trait value *renders* as.
 * The portrait is a paid AI render, so users can't preview a trait before
 * paying — these sentences are the preview. Keep them concrete and visual.
 */
export const TRAIT_DESCRIPTIONS: {
  vibe: Record<Vibe, string>;
  silhouette: Record<Silhouette, string>;
  era: Record<Era, string>;
  expression: Record<Expression, string>;
} = {
  vibe: {
    heroic: 'Noble stance, bright resolve — the champion the crowd roots for.',
    sinister: 'Shadowed menace with a cruel edge; villainy worn openly.',
    mischievous: 'A playful glint and loose posture, always one trick ahead.',
    stoic: 'Unmoved and unreadable — calm that never cracks.',
    unhinged: 'Wild-eyed and unpredictable, one breath from chaos.',
    regal: 'Commanding poise and cold confidence; born to rule.',
  },
  silhouette: {
    lean_duelist: 'Slender and poised, built for speed and precise strikes.',
    heavy_bruiser: 'Massive frame and broad shoulders that punch through walls.',
    slim_trickster: 'Light, nimble, and hard to pin down.',
    armored_knight: 'Plated head to toe — a walking fortress.',
    robed_mystic: 'Flowing robes and arcane weight; power without bulk.',
    sharp_tactician: 'Trim and deliberate, every line suggesting a plan.',
  },
  era: {
    ancient: 'Bronze, stone, and myth — forged before history.',
    industrial: 'Soot, brass, and gears from the age of smoke.',
    modern: 'Clean, contemporary styling grounded in the here and now.',
    cyberpunk: 'Neon glow, chrome, and street-tech grit.',
    far_future: 'Sleek alloys and impossible light from ages to come.',
  },
  expression: {
    smirk: 'A half-smile that says they already know the ending.',
    glare: 'A hard, locked-on stare meant to unsettle.',
    calm: 'Serene and centered, untouched by the noise.',
    roar: 'Mid-battle cry — teeth bared, full fury.',
    smile: 'Warm and open, disarming before the clash.',
    thousand_yard: 'Distant, haunted eyes of a veteran of too many wars.',
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

// ---------------------------------------------------------------------------
// Art Style — drives the portrait prompt scaffold server-side.
// Keys must match supabase/functions/_shared/portrait-prompt-resolver.ts.
// ---------------------------------------------------------------------------

export const ART_STYLES = [
  'painterly',
  'anime',
  'comic',
  'pixel',
  'oil',
  'lowpoly',
  'darkfantasy',
  'vaporwave',
] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  painterly: 'Painterly',
  anime: 'Anime',
  comic: 'Comic Book',
  pixel: 'Pixel Art',
  oil: 'Oil Painting',
  lowpoly: 'Low-Poly 3D',
  darkfantasy: 'Dark Fantasy',
  vaporwave: 'Vaporwave',
};

export const ART_STYLE_DESCRIPTIONS: Record<ArtStyle, string> = {
  painterly: 'Hero card with painterly brushwork and rim light.',
  anime: 'Crisp cel shading, bold lines, vibrant flats.',
  comic: 'Inked panels with halftone dots and saturated colors.',
  pixel: '64×64 retro bust with dithered shading.',
  oil: 'Classical bust with visible brushwork and chiaroscuro.',
  lowpoly: 'Faceted 3D render with soft studio HDR.',
  darkfantasy: 'Muted, atmospheric, gritty fantasy mood.',
  vaporwave: 'Neon synthwave with magenta/cyan grid backdrop.',
};

/** Background gradient (two stops) for style chip fallback rendering. */
export const ART_STYLE_GRADIENTS: Record<ArtStyle, readonly [string, string]> = {
  painterly: ['#7C3AED', '#EC4899'],
  anime: ['#F472B6', '#FBBF24'],
  comic: ['#FBBF24', '#EF4444'],
  pixel: ['#22D3EE', '#1E40AF'],
  oil: ['#92400E', '#1F2937'],
  lowpoly: ['#10B981', '#0EA5E9'],
  darkfantasy: ['#1F2937', '#6B21A8'],
  vaporwave: ['#D946EF', '#22D3EE'],
};

/**
 * Bundled reference thumbnails for each art style (512×512 JPEG).
 * Generated via `scripts/generate-assets.mjs` (Google Nano Banana /
 * Gemini 2.5 Flash Image). Rendered by `ArtStylePicker`, which falls back to
 * a themed vector icon (`ART_STYLE_ICON`, defined in the component) if a
 * thumbnail is missing.
 *
 * JPEG (not webp) because React Native's core <Image> on iOS cannot decode
 * webp without a third-party loader.
 */
export const ART_STYLE_THUMBS: Record<ArtStyle, ImageSourcePropType> = {
  painterly: require('../assets/images/styles/painterly.jpg'),
  anime: require('../assets/images/styles/anime.jpg'),
  comic: require('../assets/images/styles/comic.jpg'),
  pixel: require('../assets/images/styles/pixel.jpg'),
  oil: require('../assets/images/styles/oil.jpg'),
  lowpoly: require('../assets/images/styles/lowpoly.jpg'),
  darkfantasy: require('../assets/images/styles/darkfantasy.jpg'),
  vaporwave: require('../assets/images/styles/vaporwave.jpg'),
};


// ---------------------------------------------------------------------------
// Portrait description preview
// ---------------------------------------------------------------------------

/**
 * Staged look fields, in the order they read in a sentence.
 *
 * Lives here rather than in a pricing module: these used to be "the traits you
 * pay per swap for", and the module that named them existed to price them.
 * Describing is free now, so they are simply what a character looks like.
 */
export type StageTraitKey =
  | 'palette'
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression';

/**
 * The phrase each trait contributes to the image prompt.
 *
 * A mirror of the tables in `supabase/functions/_shared/portrait-prompt-resolver.ts`,
 * which remains the source of truth — the resolver runs server-side in Deno and
 * cannot be imported here. Kept so the player can read the description they are
 * building before paying to have it drawn.
 *
 * `__tests__/portraitDescription.test.ts` asserts every trait value has a phrase.
 * That catches coverage drift, which is the failure that matters: the resolver
 * falls back to the raw key when a phrase is missing, so a gap ships
 * `lean_duelist` to the image model rather than failing loudly. It cannot catch
 * wording drift, which degrades the preview without misleading anyone about
 * which trait was chosen.
 */
export const PORTRAIT_PHRASES: {
  vibe: Record<Vibe, string>;
  silhouette: Record<Silhouette, string>;
  era: Record<Era, string>;
  expression: Record<Expression, string>;
  palette: Record<PaletteKey, string>;
} = {
  vibe: {
    heroic: 'heroic and steadfast',
    sinister: 'a sinister grin',
    mischievous: 'a mischievous gleam',
    stoic: 'a stoic gaze',
    unhinged: 'unhinged energy',
    regal: 'regal poise',
  },
  silhouette: {
    lean_duelist: 'a lean duelist build',
    heavy_bruiser: 'a heavy bruiser silhouette',
    slim_trickster: 'a slim trickster frame',
    armored_knight: 'an armored knight stance',
    robed_mystic: 'a robed mystic figure',
    sharp_tactician: 'a sharp tactician posture',
  },
  era: {
    ancient: 'an ancient mythic setting',
    industrial: 'an industrial steam-era setting',
    modern: 'a modern stylized setting',
    cyberpunk: 'a cyberpunk neon setting',
    far_future: 'a far-future sci-fi setting',
  },
  expression: {
    smirk: 'a subtle smirk',
    glare: 'a fierce glare',
    calm: 'a calm gaze',
    roar: 'an open roar',
    smile: 'a warm smile',
    thousand_yard: 'a thousand-yard stare',
  },
  palette: {
    ember: 'ember reds and oranges',
    ocean: 'deep ocean blues',
    neon: 'neon magenta and cyan',
    bone: 'bleached bone whites',
    forest: 'deep forest greens',
    royal: 'royal purples and gold',
    ash: 'ashen grays',
    gold: 'warm golds',
  },
};

export interface DescribedLook {
  vibe?: Vibe | null;
  silhouette?: Silhouette | null;
  expression?: Expression | null;
  palette?: PaletteKey | null;
  era?: Era | null;
  artStyle?: ArtStyle | null;
}

/**
 * The character being described, in plain English.
 *
 * Four of these controls are abstract adjectives with no thumbnail, and until a
 * render exists there is nothing on screen connecting them to anything. Showing
 * the sentence they build closes that gap for free — and it is what surfaced the
 * resolver keys shipping `lean_duelist` verbatim to the image model.
 *
 * Order matches the resolver's: vibe, silhouette, expression, palette, era.
 */
export function describeLook(look: DescribedLook): string {
  const parts: string[] = [];
  if (look.vibe) parts.push(PORTRAIT_PHRASES.vibe[look.vibe]);
  if (look.silhouette) parts.push(PORTRAIT_PHRASES.silhouette[look.silhouette]);
  if (look.expression) parts.push(PORTRAIT_PHRASES.expression[look.expression]);
  if (look.palette) parts.push(`a colour story of ${PORTRAIT_PHRASES.palette[look.palette]}`);
  if (look.era) parts.push(PORTRAIT_PHRASES.era[look.era]);

  const subject = parts.length > 0
    ? `A champion with ${parts.join(', ')}`
    : 'A champion';

  return look.artStyle
    ? `${subject} — drawn as ${ART_STYLE_LABELS[look.artStyle].toLowerCase()}.`
    : `${subject}.`;
}
