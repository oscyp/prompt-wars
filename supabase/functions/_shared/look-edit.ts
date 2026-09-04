// Pure planning for the batched `look` character edit.
//
// Every describing field -- art style, the prompt override, and the five traits,
// plus the signature item -- is free and saves in one write. This replaces a
// sequence of separately-priced calls that the edit screen had to issue one at a
// time, applying palette LAST so its 24-hour cooldown could not abort the paid
// traits ahead of it. With describing free and that cooldown gone, the whole
// ordering dance collapses into a single atomic UPDATE.
//
// Kept out of the Edge Function body so the part that decides what actually
// changes is testable without a server or a database. Mirrors identity-edit.ts.

export type LookField =
  | 'art_style'
  | 'portrait_prompt_raw'
  | 'palette_key'
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression'
  | 'signature_item_id';

export const VIBE = [
  'heroic',
  'sinister',
  'mischievous',
  'stoic',
  'unhinged',
  'regal',
];
export const SILHOUETTE = [
  'lean_duelist',
  'heavy_bruiser',
  'slim_trickster',
  'armored_knight',
  'robed_mystic',
  'sharp_tactician',
];
export const ERA = [
  'ancient',
  'industrial',
  'modern',
  'cyberpunk',
  'far_future',
];
export const EXPRESSION = [
  'smirk',
  'glare',
  'calm',
  'roar',
  'smile',
  'thousand_yard',
];
export const PALETTE = [
  'ember',
  'ocean',
  'neon',
  'bone',
  'forest',
  'royal',
  'ash',
  'gold',
];
export const ART_STYLE = [
  'painterly',
  'anime',
  'comic',
  'pixel',
  'oil',
  'lowpoly',
  'darkfantasy',
  'vaporwave',
];

/** Longest accepted custom portrait description, matching the column CHECK. */
export const PROMPT_MAX = 200;

export interface LookFieldDef {
  field: LookField;
  /** Value written to character_edits.edit_kind. Cooldowns key off this. */
  logKind: string;
}

/**
 * The five traits and art style all log as 'traits'; they are one decision as
 * far as the audit log is concerned. Palette and the item keep their own kinds
 * because they already had them.
 */
export const LOOK_FIELDS: readonly LookFieldDef[] = [
  { field: 'art_style', logKind: 'traits' },
  { field: 'portrait_prompt_raw', logKind: 'traits' },
  { field: 'vibe', logKind: 'traits' },
  { field: 'silhouette', logKind: 'traits' },
  { field: 'era', logKind: 'traits' },
  { field: 'expression', logKind: 'traits' },
  { field: 'palette_key', logKind: 'palette' },
  { field: 'signature_item_id', logKind: 'signature_item' },
];

function oneOf(
  allowed: string[],
  raw: unknown,
  label: string,
): { value: string } | { reason: string } {
  const v = typeof raw === 'string' ? raw : '';
  if (!allowed.includes(v)) return { reason: `invalid ${label}` };
  return { value: v };
}

/**
 * Validates one look field.
 *
 * `portrait_prompt_raw` is the one that accepts null: clearing it is how a
 * player switches from "your own words" back to the guided traits, and the
 * prompt resolver reads the traits again the moment it is empty.
 */
export function validateLookField(
  field: LookField,
  raw: unknown,
): { value: string | null } | { reason: string } {
  switch (field) {
    case 'art_style':
      return oneOf(ART_STYLE, raw, 'art_style');
    case 'palette_key':
      return oneOf(PALETTE, raw, 'palette_key');
    case 'vibe':
      return oneOf(VIBE, raw, 'vibe');
    case 'silhouette':
      return oneOf(SILHOUETTE, raw, 'silhouette');
    case 'era':
      return oneOf(ERA, raw, 'era');
    case 'expression':
      return oneOf(EXPRESSION, raw, 'expression');
    case 'portrait_prompt_raw': {
      if (raw === null || raw === '') return { value: null };
      const p = typeof raw === 'string' ? raw.trim() : '';
      if (p.length === 0) return { value: null };
      if (p.length > PROMPT_MAX) {
        return {
          reason: `portrait_prompt_raw must be at most ${PROMPT_MAX} chars`,
        };
      }
      return { value: p };
    }
    case 'signature_item_id': {
      // Never null: characters.signature_item_id is NOT NULL, and unequipping
      // is not a supported state. Ownership is checked against the database by
      // the caller, not here.
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
        return { reason: 'signature_item_id must be a uuid' };
      }
      return { value: id };
    }
  }
}

export interface PlannedLookChange extends LookFieldDef {
  value: string | null;
  current: unknown;
}

export type LookPlan =
  | { ok: false; field?: LookField; reason: string }
  | { ok: true; changed: PlannedLookChange[]; update: Record<string, unknown> };

/**
 * Works out which look fields genuinely change, validating everything before
 * reporting any of it as applicable.
 *
 * A field staged back to its saved value is dropped rather than applied: it is
 * not an edit, and writing it would bump appearance_version and tell the player
 * their portrait is out of date over a change they did not make.
 */
export function planLookBatch(
  character: Record<string, unknown>,
  payload: Record<string, unknown>,
): LookPlan {
  // `portrait_prompt_raw` is the one field whose null is meaningful, so presence
  // is keyed on `in` rather than on the value being non-null.
  const present = LOOK_FIELDS.filter((f) => f.field in payload);
  if (present.length === 0) {
    return {
      ok: false,
      reason: 'look payload must contain at least one field',
    };
  }

  const update: Record<string, unknown> = {};
  const changed: PlannedLookChange[] = [];

  for (const f of present) {
    const result = validateLookField(f.field, payload[f.field]);
    if ('reason' in result) {
      return { ok: false, field: f.field, reason: result.reason };
    }
    const current = character[f.field] ?? null;
    if (result.value === current) continue;
    update[f.field] = result.value;
    changed.push({ ...f, value: result.value, current });
  }

  return { ok: true, changed, update };
}

/** Randomises every trait. Backs the paid `random_character` action. */
export function randomLookTraits(): Record<string, string> {
  const pick = (list: string[]) =>
    list[Math.floor(Math.random() * list.length)];
  return {
    vibe: pick(VIBE),
    silhouette: pick(SILHOUETTE),
    era: pick(ERA),
    expression: pick(EXPRESSION),
    palette_key: pick(PALETTE),
  };
}
