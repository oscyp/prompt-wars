/**
 * Live edit pricing and cooldowns, read straight from the database.
 *
 * The edit screen used to carry a hardcoded mirror of `character_edit_prices`.
 * Mirrors drift: the constant claimed custom items were free while the server
 * charged 3 credits, and the whole cooldown column was simply absent, so the
 * countdown UI built into `CardShell` was never given anything to show.
 *
 * Both tables are readable by `authenticated` (`character_edit_prices_select_all`
 * and `character_edits_select_own`), so the client can compute all of this
 * itself with no new endpoint.
 */

import { supabase } from './supabase';

/** Price keys used by the edit screen, as they appear in the price table. */
export type EditPriceKey =
  | 'rename'
  | 'battle_cry'
  | 'signature_color'
  | 'signature_item_swap'
  | 'palette'
  | 'archetype'
  | 'traits_single_swap'
  | 'traits_full_reroll'
  | 'regenerate_portrait'
  | 'regenerate_avatar'
  | 'initial_avatar'
  | 'new_portrait'
  | 'custom_item_text'
  | 'custom_item_image';

export interface EditPrice {
  credits: number;
  cooldownSeconds: number;
}

/**
 * Price key -> the value stored in `character_edits.edit_kind`.
 *
 * These are NOT the same vocabulary: the server maps one to the other in
 * `editLogKind` (supabase/functions/edit-character/index.ts). Cooldowns are
 * tracked against the log kind, so several price keys share one cooldown.
 * Keys absent here are not cooldown-tracked through `character_edits`.
 */
const LOG_KIND_BY_PRICE_KEY: Partial<Record<EditPriceKey, string>> = {
  rename: 'name',
  traits_single_swap: 'traits',
  traits_full_reroll: 'traits',
  signature_item_swap: 'signature_item',
  palette: 'palette',
  archetype: 'archetype',
  signature_color: 'signature_color',
  battle_cry: 'battle_cry',
};

export interface EditPricing {
  prices: Partial<Record<EditPriceKey, EditPrice>>;
  /** Remaining cooldown in ms per price key. Absent or 0 means available. */
  cooldownMs: Partial<Record<EditPriceKey, number>>;
}

/** How many recent edits to scan when finding the latest per kind. */
const EDIT_SCAN_LIMIT = 200;

export async function fetchEditPricing(
  characterId: string,
): Promise<EditPricing> {
  const [{ data: priceRows }, { data: editRows }] = await Promise.all([
    supabase
      .from('character_edit_prices')
      .select('edit_kind, credits, cooldown_seconds'),
    supabase
      .from('character_edits')
      .select('edit_kind, created_at')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false })
      .limit(EDIT_SCAN_LIMIT),
  ]);

  const prices: Partial<Record<EditPriceKey, EditPrice>> = {};
  for (const row of priceRows ?? []) {
    prices[row.edit_kind as EditPriceKey] = {
      credits: Number(row.credits ?? 0),
      cooldownSeconds: Number(row.cooldown_seconds ?? 0),
    };
  }

  // Rows arrive newest-first, so the first sighting of a kind is its latest.
  const latestByLogKind = new Map<string, number>();
  for (const row of editRows ?? []) {
    const kind = row.edit_kind as string;
    if (latestByLogKind.has(kind)) continue;
    const at = new Date(row.created_at as string).getTime();
    if (Number.isFinite(at)) latestByLogKind.set(kind, at);
  }

  const now = Date.now();
  const cooldownMs: Partial<Record<EditPriceKey, number>> = {};
  for (const [key, price] of Object.entries(prices) as [
    EditPriceKey,
    EditPrice,
  ][]) {
    if (price.cooldownSeconds <= 0) continue;
    const logKind = LOG_KIND_BY_PRICE_KEY[key];
    if (!logKind) continue;
    const last = latestByLogKind.get(logKind);
    if (last === undefined) continue;
    const remaining = last + price.cooldownSeconds * 1000 - now;
    if (remaining > 0) cooldownMs[key] = remaining;
  }

  return { prices, cooldownMs };
}
