import { useCallback, useMemo, useState } from 'react';
import {
  describeCooldownLength,
  type EditPriceKey,
  type EditPricing,
} from '@/utils/editCooldowns';
import {
  TRAIT_LABELS,
  ART_STYLE_LABELS,
  type StageTraitKey,
  type PaletteKey,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import type { IdentityChanges, LookChanges } from '@/utils/characters';

export type DraftSection = 'identity' | 'look' | 'gear';

/** Every field the player can stage, across all three tabs. */
export type DraftKey =
  // identity
  | 'name'
  | 'archetype'
  | 'battleCry'
  | 'signatureColor'
  // look
  | 'artStyle'
  | 'portraitPromptRaw'
  | 'palette'
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression'
  // gear
  | 'signatureItemId';

interface FieldDef {
  key: DraftKey;
  section: DraftSection;
  /** Column on the character row. */
  column: string;
  label: string;
  /** Only the identity fields carry cooldowns worth announcing. */
  priceKey?: EditPriceKey;
}

export const DRAFT_FIELDS: readonly FieldDef[] = [
  { key: 'name', section: 'identity', column: 'name', label: 'Name', priceKey: 'rename' },
  { key: 'archetype', section: 'identity', column: 'archetype', label: 'Archetype', priceKey: 'archetype' },
  { key: 'battleCry', section: 'identity', column: 'battle_cry', label: 'Battle cry', priceKey: 'battle_cry' },
  { key: 'signatureColor', section: 'identity', column: 'signature_color', label: 'Signature colour', priceKey: 'signature_color' },

  { key: 'artStyle', section: 'look', column: 'art_style', label: 'Art style' },
  { key: 'portraitPromptRaw', section: 'look', column: 'portrait_prompt_raw', label: 'Description' },
  { key: 'palette', section: 'look', column: 'palette_key', label: 'Outfit palette' },
  { key: 'vibe', section: 'look', column: 'vibe', label: 'Vibe' },
  { key: 'silhouette', section: 'look', column: 'silhouette', label: 'Silhouette' },
  { key: 'era', section: 'look', column: 'era', label: 'Era' },
  { key: 'expression', section: 'look', column: 'expression', label: 'Expression' },

  { key: 'signatureItemId', section: 'gear', column: 'signature_item_id', label: 'Signature item' },
];

export interface DraftChange {
  key: DraftKey;
  section: DraftSection;
  label: string;
  /** Player-facing new value, already formatted. */
  to: string;
  /** Present when saving this field locks it, e.g. "7 days". */
  locksFor?: string;
}

export interface DraftSummary {
  changes: DraftChange[];
  changeCount: number;
  dirty: boolean;
  /** Which tabs carry unsaved edits, for the staged dots. */
  dirtySections: Record<DraftSection, boolean>;
}

/** Staged values. `null` is meaningful for portraitPromptRaw and only there. */
export type DraftValues = Partial<Record<DraftKey, string | null>>;

/**
 * Formats a staged value for the save confirmation.
 *
 * Item ids resolve through `itemName` because a uuid in a confirmation dialog
 * tells the player nothing about what they are about to equip.
 */
function displayValue(
  key: DraftKey,
  value: string | null,
  itemName: (id: string) => string,
): string {
  if (value === null || value === '') return 'None';
  switch (key) {
    case 'archetype':
      return ARCHETYPES[value as ArchetypeId]?.name ?? value;
    case 'artStyle':
      return ART_STYLE_LABELS[value as ArtStyle] ?? value;
    case 'palette':
      return TRAIT_LABELS.palette[value as PaletteKey] ?? value;
    case 'vibe':
      return TRAIT_LABELS.vibe[value as keyof typeof TRAIT_LABELS.vibe] ?? value;
    case 'silhouette':
      return TRAIT_LABELS.silhouette[value as keyof typeof TRAIT_LABELS.silhouette] ?? value;
    case 'era':
      return TRAIT_LABELS.era[value as keyof typeof TRAIT_LABELS.era] ?? value;
    case 'expression':
      return TRAIT_LABELS.expression[value as keyof typeof TRAIT_LABELS.expression] ?? value;
    case 'signatureItemId':
      return itemName(value);
    case 'portraitPromptRaw':
      return value.length > 40 ? `${value.slice(0, 40)}…` : value;
    default:
      return value;
  }
}

export interface ComputeDraftInput {
  character: Record<string, unknown> | null;
  values: DraftValues;
  pricing: EditPricing;
  itemName?: (id: string) => string;
}

const EMPTY: DraftSummary = {
  changes: [],
  changeCount: 0,
  dirty: false,
  dirtySections: { identity: false, look: false, gear: false },
};

/**
 * Pure core of the draft: what actually differs from the saved character, and
 * what saving it will lock.
 *
 * There is no cost arithmetic here any more. Describing a character is free —
 * the money moved to the render — so the only thing a save can cost the player
 * is time: name locks for 7 days, archetype for 14.
 */
export function computeDraft(input: ComputeDraftInput): DraftSummary {
  const { character, values, pricing, itemName = (id) => id } = input;
  if (!character) return EMPTY;

  const changes: DraftChange[] = [];
  const dirtySections: Record<DraftSection, boolean> = {
    identity: false, look: false, gear: false,
  };

  for (const field of DRAFT_FIELDS) {
    // Presence, not truthiness: null is a real staged value for the prompt.
    if (!(field.key in values)) continue;
    const staged = values[field.key] ?? null;
    const current = (character[field.column] as string | null) ?? null;
    // A field staged back to its saved value is not a change. Writing it would
    // bump appearance_version and tell the player their portrait is out of date
    // over an edit they did not make.
    if (staged === current) continue;

    dirtySections[field.section] = true;
    changes.push({
      key: field.key,
      section: field.section,
      label: field.label,
      to: displayValue(field.key, staged, itemName),
      locksFor: field.priceKey
        ? (describeCooldownLength(pricing.prices[field.priceKey]?.cooldownSeconds ?? 0) ??
           undefined)
        : undefined,
    });
  }

  return {
    changes,
    changeCount: changes.length,
    dirty: changes.length > 0,
    dirtySections,
  };
}

export interface UseCharacterEditDraft extends DraftSummary {
  values: DraftValues;
  stage: (key: DraftKey, value: string | null) => void;
  clear: () => void;
  /** Batched payload for the free `identity` edit, or null when unchanged. */
  identityPayload: IdentityChanges | null;
  /** Batched payload for the free `look` edit (look + gear), or null. */
  lookPayload: LookChanges | null;
}

/**
 * Holds every unsaved edit on the character screen behind one Save action.
 *
 * Look and Gear join Identity in the draft: equipping an item on tap while the
 * rest of the screen staged would rebuild exactly the mixed-commit
 * inconsistency this model exists to remove.
 */
export function useCharacterEditDraft(
  character: Record<string, unknown> | null,
  pricing: EditPricing,
  itemName?: (id: string) => string,
): UseCharacterEditDraft {
  const [values, setValues] = useState<DraftValues>({});

  const stage = useCallback((key: DraftKey, value: string | null) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clear = useCallback(() => setValues({}), []);

  const summary = useMemo(
    () => computeDraft({ character, values, pricing, itemName }),
    [character, values, pricing, itemName],
  );

  const identityPayload = useMemo(() => {
    const staged = summary.changes.filter((c) => c.section === 'identity');
    if (staged.length === 0) return null;
    const payload: IdentityChanges = {};
    for (const c of staged) {
      const v = values[c.key];
      if (typeof v !== 'string') continue;
      if (c.key === 'name') payload.name = v;
      if (c.key === 'archetype') payload.archetype = v;
      if (c.key === 'battleCry') payload.battleCry = v;
      if (c.key === 'signatureColor') payload.signatureColor = v;
    }
    return payload;
  }, [summary.changes, values]);

  const lookPayload = useMemo(() => {
    const staged = summary.changes.filter(
      (c) => c.section === 'look' || c.section === 'gear',
    );
    if (staged.length === 0) return null;
    const payload: LookChanges = {};
    for (const c of staged) {
      const v = values[c.key];
      switch (c.key) {
        case 'artStyle': if (typeof v === 'string') payload.artStyle = v as ArtStyle; break;
        case 'palette': if (typeof v === 'string') payload.palette = v as PaletteKey; break;
        case 'vibe': if (typeof v === 'string') payload.vibe = v; break;
        case 'silhouette': if (typeof v === 'string') payload.silhouette = v; break;
        case 'era': if (typeof v === 'string') payload.era = v; break;
        case 'expression': if (typeof v === 'string') payload.expression = v; break;
        case 'signatureItemId': if (typeof v === 'string') payload.signatureItemId = v; break;
        // The one field whose null must survive: it is how a player returns
        // from "your own words" to the guided traits.
        case 'portraitPromptRaw': payload.portraitPromptRaw = v ?? null; break;
      }
    }
    return payload;
  }, [summary.changes, values]);

  return { ...summary, values, stage, clear, identityPayload, lookPayload };
}

export type { StageTraitKey };
