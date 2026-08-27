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
  // The two paid actions on the edit screen. Everything else describing a
  // character is free.
  | 'render_look'
  | 'random_character'
  | 'rename'
  | 'battle_cry'
  | 'signature_color'
  | 'signature_item_swap'
  | 'palette'
  | 'archetype'
  | 'traits_single_swap'
  | 'traits_full_reroll'
  // Retired: regenerate-portrait priced every render through these four and now
  // reads render_look / random_character instead. Rows remain so historical
  // character_edits still resolve a price.
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

/**
 * Remaining cooldown as a short, player-facing duration.
 *
 * Cooldowns here run from 24 hours to 14 days, so hours-and-minutes alone
 * produced things like "312h 0m".
 */
export function formatCooldown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * How long an edit locks its field once made, in prose.
 *
 * Used before the edit, in the save confirmation, where "14d" reads as jargon
 * and the whole point is that the player understands what they are committing
 * to. `formatCooldown` covers the after-the-fact countdown instead.
 */
export function describeCooldownLength(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const days = Math.round(seconds / 86400);
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
  const hours = Math.max(1, Math.round(seconds / 3600));
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
