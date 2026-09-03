/**
 * Option lists for the shared `OptionGrid`, built once from the trait enums.
 *
 * Onboarding and the edit screen used to build these separately (chips with
 * labels only on one side, steppers with descriptions on the other), so the
 * same trait read differently depending on where you met it. One builder, one
 * reading.
 */

import type { OptionGridOption } from '@/components/OptionGrid';
import type { ColorSwatchOption } from '@/components/ColorSwatchGrid';
import {
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  ITEM_CLASSES,
  PALETTES,
  TRAIT_LABELS,
  TRAIT_DESCRIPTIONS,
} from '@/constants/CharacterTraits';
import { ARCHETYPE_LIST } from '@/constants/Archetypes';

/** Palette is absent on purpose: it renders on `ColorSwatchGrid`. */
export type TraitOptionKey =
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression'
  | 'itemClass';

function build(key: TraitOptionKey): readonly OptionGridOption[] {
  switch (key) {
    case 'vibe':
      return VIBES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.vibe[v],
        description: TRAIT_DESCRIPTIONS.vibe[v],
      }));
    case 'silhouette':
      return SILHOUETTES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.silhouette[v],
        description: TRAIT_DESCRIPTIONS.silhouette[v],
      }));
    case 'era':
      return ERAS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.era[v],
        description: TRAIT_DESCRIPTIONS.era[v],
      }));
    case 'expression':
      return EXPRESSIONS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.expression[v],
        description: TRAIT_DESCRIPTIONS.expression[v],
      }));
    case 'itemClass':
      return ITEM_CLASSES.map((c) => ({
        value: c,
        label: TRAIT_LABELS.itemClass[c],
      }));
  }
}

const CACHE: Partial<Record<TraitOptionKey, readonly OptionGridOption[]>> = {};

/** Precomputed once per key; returns the same frozen array each call. */
export function traitOptions(key: TraitOptionKey): readonly OptionGridOption[] {
  const cached = CACHE[key];
  if (cached) return cached;
  const built = Object.freeze(build(key));
  CACHE[key] = built;
  return built;
}

const ARCHETYPE_OPTIONS: readonly OptionGridOption[] = Object.freeze(
  ARCHETYPE_LIST.map((a) => ({
    value: a.id,
    label: a.name,
    description: `Rewards ${a.rewards}`,
    swatch: a.color,
  })),
);

/** The five archetypes as option cards, coloured by archetype. */
export function archetypeOptions(): readonly OptionGridOption[] {
  return ARCHETYPE_OPTIONS;
}

/** The eight outfit palettes for `ColorSwatchGrid`, keyed by palette key. */
export const PALETTE_SWATCH_OPTIONS: ColorSwatchOption[] = PALETTES.map(
  (p) => ({
    value: p.key,
    label: TRAIT_LABELS.palette[p.key],
    hex: p.hex,
  }),
);
