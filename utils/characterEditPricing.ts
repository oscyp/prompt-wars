/**
 * Pure helpers for the edit-character "staged traits" flow.
 *
 * Traits are staged locally in the UI (free to fiddle) and applied in one
 * batch. This module computes which staged values actually differ from the
 * character's current values and what applying them costs — mirroring the
 * backend `character_edit_prices` (palette swaps are free; the other trait
 * swaps cost 1 credit each). Backend remains the source of truth and will
 * reject mismatched calls; these values are for display + gating only.
 */

export type StageTraitKey =
  | 'palette'
  | 'vibe'
  | 'silhouette'
  | 'era'
  | 'expression';

/** Credit cost of a single paid trait swap (`traits_single_swap`). */
export const TRAIT_SWAP_PRICE = 1;

/** Column on the character row that backs each staged trait. */
export const TRAIT_FIELD: Record<StageTraitKey, string> = {
  palette: 'palette_key',
  vibe: 'vibe',
  silhouette: 'silhouette',
  era: 'era',
  expression: 'expression',
};

/** Palette is a free edit; the rest are charged per swap. */
const FREE_TRAITS: readonly StageTraitKey[] = ['palette'];

export function isTraitFree(key: StageTraitKey): boolean {
  return FREE_TRAITS.includes(key);
}

/**
 * Given the current character fields and the locally staged values, return the
 * trait keys that genuinely changed and the total credit cost of applying them.
 */
export function computeStagedTraits(
  current: Record<string, unknown>,
  pending: Partial<Record<StageTraitKey, string>>,
): { changed: StageTraitKey[]; cost: number } {
  const keys = Object.keys(TRAIT_FIELD) as StageTraitKey[];
  const changed = keys.filter((key) => {
    const staged = pending[key];
    return staged != null && staged !== (current[TRAIT_FIELD[key]] ?? undefined);
  });
  const cost = changed.reduce(
    (sum, key) => sum + (isTraitFree(key) ? 0 : TRAIT_SWAP_PRICE),
    0,
  );
  return { changed, cost };
}
