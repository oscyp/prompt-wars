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

/**
 * Credit cost of setting all four paid traits at once (`traits_full_reroll`).
 *
 * Applying N paid traits as N single swaps costs N credits, but the backend
 * sets all four for 2 -- so staging three or four traits and applying them one
 * at a time overcharged the player.
 *
 * The threshold is `>=`, not `>`: two paid swaps cost 2 credits either way, but
 * the batch is a single request. Looping means a failure partway through (a
 * cooldown, a dropped connection) leaves the player charged for the swaps that
 * already landed, with no way to tell which. Same price, one transaction.
 */
export const TRAIT_FULL_REROLL_PRICE = 2;

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
): {
  changed: StageTraitKey[];
  cost: number;
  /** True when applying via one `traits_full_reroll` is cheaper than N swaps. */
  useBatch: boolean;
  paidCount: number;
} {
  const keys = Object.keys(TRAIT_FIELD) as StageTraitKey[];
  const changed = keys.filter((key) => {
    const staged = pending[key];
    return staged != null && staged !== (current[TRAIT_FIELD[key]] ?? undefined);
  });
  const paidCount = changed.filter((key) => !isTraitFree(key)).length;

  // Charge whichever route the apply actually takes: N single swaps, or one
  // full reroll when that is cheaper. Free traits (palette) never contribute.
  const singleSwapCost = paidCount * TRAIT_SWAP_PRICE;
  const useBatch = singleSwapCost >= TRAIT_FULL_REROLL_PRICE;
  const cost = useBatch ? TRAIT_FULL_REROLL_PRICE : singleSwapCost;

  return { changed, cost, useBatch, paidCount };
}
