// Pure prompt-resolver for character portraits and item icons.
// No network calls. Safe to unit-test under Deno.

export type Archetype =
  | 'strategist'
  | 'trickster'
  | 'titan'
  | 'mystic'
  | 'engineer';

export type ArtStyle =
  | 'painterly'
  | 'anime'
  | 'comic'
  | 'pixel'
  | 'oil'
  | 'lowpoly'
  | 'darkfantasy'
  | 'vaporwave';

export const ART_STYLE_KEYS: readonly ArtStyle[] = [
  'painterly',
  'anime',
  'comic',
  'pixel',
  'oil',
  'lowpoly',
  'darkfantasy',
  'vaporwave',
] as const;

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
  art_style?: ArtStyle;
  /**
   * Which render this prompt is for. Defaults to 'fighter' so every existing
   * caller is unchanged.
   *   fighter -- full-body, head to feet. Reveal poster + video reference.
   *   avatar  -- head-and-shoulders bust. Battle strips and rings, where the
   *              full figure is cropped to a circle and the face is all that
   *              survives anyway.
   */
  kind?: PortraitKind;
}

export type PortraitKind = 'fighter' | 'avatar';

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

export const VIBE_PHRASES: Record<string, string> = {
  heroic: 'heroic and steadfast',
  sinister: 'sinister grin',
  mischievous: 'mischievous gleam',
  stoic: 'stoic gaze',
  unhinged: 'unhinged energy',
  regal: 'regal poise',
};

// Keys MUST be the exact values stored on characters.silhouette. They were not:
// every key here was an abbreviation ('duelist' for 'lean_duelist'), so
// lookupPhrase missed all six and fell through to its raw-key passthrough,
// sending the literal token `lean_duelist` to the image model instead of a
// description. Same class of bug hit far_future, thousand_yard and ash below.
export const SILHOUETTE_PHRASES: Record<string, string> = {
  lean_duelist: 'lean duelist build',
  heavy_bruiser: 'heavy bruiser silhouette',
  slim_trickster: 'slim trickster frame',
  armored_knight: 'armored knight stance',
  robed_mystic: 'robed mystic figure',
  sharp_tactician: 'sharp tactician posture',
};

export const PALETTE_PHRASES: Record<string, string> = {
  ember: 'ember reds and oranges',
  ocean: 'deep ocean blues',
  neon: 'neon magenta and cyan',
  bone: 'bleached bone whites',
  forest: 'deep forest greens',
  royal: 'royal purples and gold',
  ash: 'ashen grays',
  gold: 'warm golds',
};

export const ERA_PHRASES: Record<string, string> = {
  ancient: 'ancient mythic setting',
  industrial: 'industrial steam-era setting',
  modern: 'modern stylized setting',
  cyberpunk: 'cyberpunk neon setting',
  far_future: 'far-future sci-fi setting',
};

export const EXPRESSION_PHRASES: Record<string, string> = {
  smirk: 'subtle smirk',
  glare: 'fierce glare',
  calm: 'calm gaze',
  roar: 'open roar',
  smile: 'warm smile',
  thousand_yard: 'thousand-yard stare',
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

// Style-specific scaffolds. Each scaffold is a single sentence that establishes
// medium, lighting, and full-body composition. Keep them short to leave room
// for traits. Every scaffold demands the entire figure, head to feet, uncropped.
const ART_STYLE_SCAFFOLDS: Record<ArtStyle, string> = {
  painterly:
    'Stylized painterly digital art full-body character illustration, entire figure visible head to toe including feet, standing full-figure hero pose, no crop, dramatic rim lighting, clean studio background, game-ready hero card composition.',
  anime:
    'Crisp cel-shaded anime full-body character illustration, bold clean linework, vibrant flat colors with sharp shadow shapes, entire figure visible head to toe including feet, standing full-figure pose, no crop, hero card composition.',
  comic:
    'Inked western comic-book full-body character illustration, bold black outlines, halftone shading with Ben-Day dot accents, saturated flats, entire figure visible head to toe including feet, dynamic standing full-figure pose, no crop, hero card composition.',
  pixel:
    'Retro pixel-art full-body character sprite, hand-placed pixels, dithered shading, limited 16-color palette, entire figure visible head to toe including feet, standing full-figure pose, no crop, clean solid background, hero card composition.',
  oil: 'Classical oil-painting full-length character portrait, visible textured brushwork, rich chiaroscuro lighting, muted earthy palette, entire figure visible head to toe including feet, standing full-figure pose, no crop, gallery-style composition.',
  lowpoly:
    'Stylized low-poly 3D full-body character render, faceted geometric shading, soft studio HDR lighting, matte finish, entire figure visible head to toe including feet, standing full-figure pose, no crop, hero card composition.',
  darkfantasy:
    'Gritty dark-fantasy full-body character illustration, muted desaturated palette, atmospheric haze and shadow, dramatic side lighting, entire figure visible head to toe including feet, standing full-figure pose, no crop, hero card composition.',
  vaporwave:
    'Neon synthwave full-body character illustration, magenta and cyan rim lighting, retro vaporwave grid backdrop, subtle chromatic aberration, entire figure visible head to toe including feet, standing full-figure pose, no crop, hero card composition.',
};

// Avatar scaffolds. A deliberate parallel map rather than a refactor of the
// fighter scaffolds above: those are tuned, and their exact wording is asserted
// per art style by _tests/portrait-prompt-resolver.test.ts. Sharing a builder
// between the two would put the fighter prompts one careless edit away from
// changing.
//
// Framing is the only real difference -- the medium/lighting language is kept
// deliberately close so an avatar and a fighter of the same character read as
// the same artwork.
const ART_STYLE_AVATAR_SCAFFOLDS: Record<ArtStyle, string> = {
  painterly:
    'Stylized painterly digital art character portrait, head-and-shoulders bust framing, face centered and clearly visible, dramatic rim lighting, clean studio background, profile-avatar composition.',
  anime:
    'Crisp cel-shaded anime character portrait, head-and-shoulders bust framing, bold clean linework, vibrant flat colors with sharp shadow shapes, face centered and clearly visible, profile-avatar composition.',
  comic:
    'Inked western comic-book character portrait, head-and-shoulders bust framing, bold black outlines, halftone shading with Ben-Day dot accents, face centered and clearly visible, profile-avatar composition.',
  pixel:
    'Retro pixel-art character portrait, head-and-shoulders bust framing, hand-placed pixels, dithered shading, limited 16-color palette, face centered and clearly visible, clean solid background, profile-avatar composition.',
  oil: 'Classical oil-painting character portrait, head-and-shoulders bust framing, visible textured brushwork, rich chiaroscuro lighting, muted earthy palette, face centered and clearly visible, gallery-style composition.',
  lowpoly:
    'Stylized low-poly 3D character portrait, head-and-shoulders bust framing, faceted geometric shading, soft studio HDR lighting, matte finish, face centered and clearly visible, profile-avatar composition.',
  darkfantasy:
    'Gritty dark-fantasy character portrait, head-and-shoulders bust framing, muted desaturated palette, atmospheric haze and shadow, dramatic side lighting, face centered and clearly visible, profile-avatar composition.',
  vaporwave:
    'Neon synthwave character portrait, head-and-shoulders bust framing, magenta and cyan rim lighting, retro vaporwave grid backdrop, subtle chromatic aberration, face centered and clearly visible, profile-avatar composition.',
};

// Short per-style medium tags, reiterated near the end of the prompt so the
// style survives the image model's chat-model prompt revision pass.
const ART_STYLE_LOCKS: Record<ArtStyle, string> = {
  painterly: 'painterly digital art',
  anime: 'cel-shaded anime',
  comic: 'inked comic-book',
  pixel: 'retro pixel-art',
  oil: 'classical oil-painting',
  lowpoly: 'low-poly 3D',
  darkfantasy: 'gritty dark-fantasy',
  vaporwave: 'neon synthwave',
};

const NEGATIVE_CLAUSES =
  'No real people or celebrity likeness. No nudity or sexual content. No brand logos or trademarks. No text, letters, captions, signatures, or watermarks.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lookupPhrase(
  table: Record<string, string>,
  key?: string,
): string | null {
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

/**
 * Cap the prompt while guaranteeing the trailing sentence (safety constraints)
 * always survives truncation: over-long bodies are trimmed, never the tail.
 */
function capPromptWithTail(body: string, tail: string): string {
  const collapsedTail = tail.replace(/\s+/g, ' ').trim();
  const collapsedBody = body.replace(/\s+/g, ' ').trim();
  const joined = `${collapsedBody} ${collapsedTail}`;
  if (joined.length <= MAX_PROMPT_CHARS) return joined;
  const budget = MAX_PROMPT_CHARS - collapsedTail.length - 2; // '… ' separator
  return `${collapsedBody.slice(0, Math.max(0, budget)).trimEnd()}… ${collapsedTail}`;
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export function resolvePortraitPrompt(input: PortraitPromptInput): string {
  const archetypeHint =
    ARCHETYPE_HINTS[input.archetype] ?? 'distinctive presence';
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

    subject =
      parts.length > 0
        ? `a stylized champion with ${parts.join(', ')}`
        : `a stylized ${input.archetype} champion`;
  }

  const signatureItem =
    input.signature_item_fragment && input.signature_item_fragment.trim()
      ? sanitizeRawSubject(input.signature_item_fragment)
      : null;

  const styleKey: ArtStyle =
    input.art_style && ART_STYLE_SCAFFOLDS[input.art_style]
      ? input.art_style
      : 'painterly';
  const kind: PortraitKind = input.kind ?? 'fighter';
  const isAvatar = kind === 'avatar';
  const styleScaffold = isAvatar
    ? ART_STYLE_AVATAR_SCAFFOLDS[styleKey]
    : ART_STYLE_SCAFFOLDS[styleKey];
  const styleLock = ART_STYLE_LOCKS[styleKey];

  const promptBody = [
    styleScaffold,
    `Subject: ${subject}.`,
    `Archetype hint: ${input.archetype} energy, conveying ${archetypeHint}.`,
    `Palette bias: ${colorPhrase} threading through the composition.`,
    // A bust crop cannot show something held at waist height, so asking the
    // model to make it "prominently held and clearly visible" fights the
    // framing and tends to drag the camera back out to full body.
    signatureItem
      ? isAvatar
        ? `Signature item: hints of ${signatureItem} may appear at the shoulder or collar if it fits the bust framing.`
        : `Signature item, required: the character prominently holds or wears ${signatureItem}, clearly visible in frame.`
      : null,
    `Composition seed: ${input.seed}.`,
    isAvatar
      ? `Style lock: render strictly in ${styleLock} style, head-and-shoulders bust portrait, face fully visible.`
      : `Style lock: render strictly in ${styleLock} style, full figure head to feet, uncropped.`,
  ]
    .filter(Boolean)
    .join(' ');

  return capPromptWithTail(promptBody, `Constraints: ${NEGATIVE_CLAUSES}`);
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
  ]
    .filter(Boolean)
    .join(' ');

  return capPromptWithTail(body, `Constraints: ${NEGATIVE_CLAUSES}`);
}

export const __internal = {
  MAX_PROMPT_CHARS,
  NEGATIVE_CLAUSES,
  ART_STYLE_SCAFFOLDS,
  ART_STYLE_LOCKS,
};
