// Pure prompt-resolver for character portraits and item icons.
// No network calls. Safe to unit-test under Deno.

export type Archetype = 'strategist' | 'trickster' | 'titan' | 'mystic' | 'engineer';

export interface PortraitTraits {
  vibe?: string;
  silhouette?: string;
  palette?: string;
  era?: string;
  expression?: string;
}

export interface PortraitPromptInput {
  prompt_raw?: string;
  traits?: PortraitTraits;
  archetype: Archetype;
  signature_color: string; // hex like "#A12FCC"
  signature_item_fragment?: string;
  seed: number;
}

export interface ItemIconPromptInput {
  name: string;
  description: string;
  item_class: 'tool' | 'symbol' | 'weaponized_mundane' | 'relic' | 'instrument';
  seed: number;
}

const MAX_PROMPT_CHARS = 800;
const MAX_RAW_SUBJECT_CHARS = 200;

// ---------------------------------------------------------------------------
// Trait dictionaries
// ---------------------------------------------------------------------------

const VIBE_PHRASES: Record<string, string> = {
  heroic: 'heroic and steadfast',
  sinister: 'sinister grin',
  mischievous: 'mischievous gleam',
  stoic: 'stoic gaze',
  unhinged: 'unhinged energy',
  regal: 'regal poise',
};

const SILHOUETTE_PHRASES: Record<string, string> = {
  duelist: 'lean duelist build',
  bruiser: 'heavy bruiser silhouette',
  trickster: 'slim trickster frame',
  knight: 'armored knight stance',
  mystic: 'robed mystic figure',
  tactician: 'sharp tactician posture',
};

const PALETTE_PHRASES: Record<string, string> = {
  ember: 'ember reds and oranges',
  ocean: 'deep ocean blues',
  neon: 'neon magenta and cyan',
  bone: 'bleached bone whites',
  forest: 'deep forest greens',
  royal: 'royal purples and gold',
  ashen: 'ashen grays',
  gold: 'warm golds',
};

const ERA_PHRASES: Record<string, string> = {
  ancient: 'ancient mythic setting',
  industrial: 'industrial steam-era setting',
  modern: 'modern stylized setting',
  cyberpunk: 'cyberpunk neon setting',
  scifi: 'far-future sci-fi setting',
};

const EXPRESSION_PHRASES: Record<string, string> = {
  smirk: 'subtle smirk',
  glare: 'fierce glare',
  calm: 'calm gaze',
  roar: 'open roar',
  smile: 'warm smile',
  stare: 'thousand-yard stare',
};

const ARCHETYPE_HINTS: Record<Archetype, string> = {
  strategist: 'tactical precision',
  trickster: 'chaotic unpredictability',
  titan: 'raw power',
  mystic: 'abstract poetry',
  engineer: 'technical mastery',
};

const ITEM_CLASS_FLAVOR: Record<ItemIconPromptInput['item_class'], string> = {
  tool: 'utilitarian crafted tool',
  symbol: 'emblematic symbolic motif',
  weaponized_mundane: 'ordinary object turned makeshift weapon',
  relic: 'ancient mystical relic',
  instrument: 'finely tuned instrument',
};

const NEGATIVE_CLAUSES =
  'No real people or celebrity likeness. No nudity or sexual content. No brand logos or trademarks. No text, letters, captions, signatures, or watermarks.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lookupPhrase(table: Record<string, string>, key?: string): string | null {
  if (!key) return null;
  const norm = key.trim().toLowerCase();
  if (!norm) return null;
  if (table[norm]) return table[norm];
  // Allow free-text traits to pass through, sanitized.
  return norm.replace(/[<>"`]/g, '').slice(0, 60);
}

function sanitizeRawSubject(raw: string): string {
  return raw
    .replace(/[<>"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_RAW_SUBJECT_CHARS);
}

/**
 * Convert a hex color to a descriptive phrase (no raw hex in provider prompt).
 * Buckets the hue into a small set of named color families.
 */
export function describeSignatureColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 'a distinctive signature color';
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2 / 255;

  if (delta < 18) {
    if (lightness < 0.2) return 'a near-black signature accent';
    if (lightness > 0.85) return 'a near-white signature accent';
    return 'a neutral gray signature accent';
  }

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;

  let family: string;
  if (hue < 15 || hue >= 345) family = 'crimson red';
  else if (hue < 45) family = 'burnt orange';
  else if (hue < 70) family = 'amber gold';
  else if (hue < 165) family = 'verdant green';
  else if (hue < 200) family = 'teal cyan';
  else if (hue < 255) family = 'deep blue';
  else if (hue < 290) family = 'royal purple';
  else family = 'magenta pink';

  const tone = lightness < 0.35 ? 'deep ' : lightness > 0.7 ? 'bright ' : '';
  return `a ${tone}${family} signature accent`;
}

function capPrompt(s: string): string {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_PROMPT_CHARS) return collapsed;
  return collapsed.slice(0, MAX_PROMPT_CHARS - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export function resolvePortraitPrompt(input: PortraitPromptInput): string {
  const archetypeHint = ARCHETYPE_HINTS[input.archetype] ?? 'distinctive presence';
  const colorPhrase = describeSignatureColor(input.signature_color);

  let subject: string;
  if (input.prompt_raw && input.prompt_raw.trim()) {
    subject = sanitizeRawSubject(input.prompt_raw);
  } else {
    const t = input.traits ?? {};
    const parts: string[] = [];
    const vibe = lookupPhrase(VIBE_PHRASES, t.vibe);
    const silhouette = lookupPhrase(SILHOUETTE_PHRASES, t.silhouette);
    const expression = lookupPhrase(EXPRESSION_PHRASES, t.expression);
    const palette = lookupPhrase(PALETTE_PHRASES, t.palette);
    const era = lookupPhrase(ERA_PHRASES, t.era);

    if (vibe) parts.push(vibe);
    if (silhouette) parts.push(silhouette);
    if (expression) parts.push(expression);
    if (palette) parts.push(`color story of ${palette}`);
    if (era) parts.push(era);

    subject = parts.length > 0
      ? `a stylized champion with ${parts.join(', ')}`
      : `a stylized ${input.archetype} champion`;
  }

  const signatureItem =
    input.signature_item_fragment && input.signature_item_fragment.trim()
      ? sanitizeRawSubject(input.signature_item_fragment)
      : null;

  const styleScaffold =
    'Stylized illustrated character portrait, painterly digital art, head-and-shoulders framing, dramatic rim lighting, clean studio background, cohesive game-ready hero card composition.';

  const promptBody = [
    styleScaffold,
    `Subject: ${subject}.`,
    `Archetype hint: ${input.archetype} energy, conveying ${archetypeHint}.`,
    `Palette bias: ${colorPhrase} threading through the composition.`,
    signatureItem ? `Signature detail: ${signatureItem}.` : null,
    `Composition seed: ${input.seed}.`,
    `Constraints: ${NEGATIVE_CLAUSES}`,
  ]
    .filter(Boolean)
    .join(' ');

  return capPrompt(promptBody);
}

export function resolveItemIconPrompt(input: ItemIconPromptInput): string {
  const flavor = ITEM_CLASS_FLAVOR[input.item_class] ?? 'distinctive object';
  const name = sanitizeRawSubject(input.name);
  const description = sanitizeRawSubject(input.description);

  const body = [
    `Game UI sticker icon of ${name}, isometric 3/4 angle, single centered object, transparent background, soft inner shadow, crisp readable silhouette.`,
    description ? `Detail: ${description}.` : null,
    `Style: ${flavor}, vibrant but clean, game-ready collectible icon.`,
    `Composition seed: ${input.seed}.`,
    `Constraints: ${NEGATIVE_CLAUSES}`,
  ]
    .filter(Boolean)
    .join(' ');

  return capPrompt(body);
}

export const __internal = {
  MAX_PROMPT_CHARS,
  NEGATIVE_CLAUSES,
};
