/**
 * What a credit buys, from the live price table.
 *
 * The wallet sells credit packs; until now nothing on that screen said what a
 * credit is worth in play, so packs were priced against an unknown. The
 * labels here are the player's words for each paid action; the numbers come
 * from `character_edit_prices`, the same table every paid surface reads, so
 * this card can never disagree with the price shown at the moment of
 * spending. Cinematic videos are priced per battle at purchase and are named,
 * not numbered, here.
 */

import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const CREDIT_USES_TITLE = 'What credits buy';
export const VIDEO_PRICE_NOTE =
  'Cinematic videos: the price is shown before you buy.';
export const PRICES_UNAVAILABLE = 'Prices unavailable right now.';

/**
 * Price-table keys with a player-facing label. Keys absent here (identity
 * edits, capability flags) are never listed, whatever their price.
 */
export const CREDIT_USE_LABELS: Readonly<Record<string, string>> = {
  render_look: 'Draw a new look',
  random_character: 'Random character',
  custom_item_image: 'Custom item with icon',
  custom_item_text: 'Custom item',
  prompt_suggestions_reroll: 'New move suggestions',
  leave_battle: 'Leave a battle after locking in',
  regenerate_avatar: 'Redraw the avatar',
  regenerate_portrait: 'Redraw the portrait',
};

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

export interface CreditUse {
  key: string;
  label: string;
  credits: number;
}

/** Anything shaped like `EditPricing` from `utils/editCooldowns.ts`. */
export interface CreditPriceTable {
  prices: Partial<Record<string, { credits: number } | undefined>>;
}

/**
 * The labelled, positively-priced actions, cheapest first and alphabetical
 * within a price. Unknown keys and free actions are skipped: a "Free" row
 * would be noise, and an unlabelled key would be a raw server string.
 */
export function creditUses(
  pricing: CreditPriceTable | null | undefined,
): CreditUse[] {
  if (!pricing) return [];
  const rows: CreditUse[] = [];
  for (const [key, label] of Object.entries(CREDIT_USE_LABELS)) {
    const credits = pricing.prices[key]?.credits;
    if (
      typeof credits !== 'number' ||
      !Number.isFinite(credits) ||
      credits <= 0
    ) {
      continue;
    }
    rows.push({ key, label, credits });
  }
  return rows.sort(
    (a, b) => a.credits - b.credits || a.label.localeCompare(b.label),
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const CREDIT_PRICE_COLUMNS = 'edit_kind, credits';

/**
 * The whole price table. `fetchEditPricing` in `utils/editCooldowns.ts` reads
 * the same rows but needs a character id, because it also reads that
 * character's edit log for cooldowns; the wallet has no character in scope
 * and no use for cooldowns. Null when the read fails, never an empty table.
 */
export async function fetchCreditPrices(): Promise<CreditPriceTable | null> {
  try {
    const { data, error } = await supabase
      .from('character_edit_prices')
      .select(CREDIT_PRICE_COLUMNS);
    if (error) {
      console.error('fetchCreditPrices:', error);
      return null;
    }
    const prices: CreditPriceTable['prices'] = {};
    const rows = (data ?? []) as {
      edit_kind: string;
      credits: number | string | null;
    }[];
    for (const row of rows) {
      prices[row.edit_kind] = { credits: Number(row.credits ?? 0) };
    }
    return { prices };
  } catch (err) {
    console.error('fetchCreditPrices:', err);
    return null;
  }
}
