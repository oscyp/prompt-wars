/**
 * Player-facing labels for the wallet ledger.
 *
 * `wallet_transactions.reason` is written by a dozen server paths as a machine
 * key — `render_look_refund:timeout`, `draft_render_refund:provider_error`,
 * `video_generation_failed_refund_502` — and the wallet screen printed it
 * verbatim. This maps every known key (and the refund suffix pattern) to a
 * sentence a player recognises, and never returns the raw key.
 */

import { creditsNoun } from '@/utils/credits';

const BASE_LABELS: Record<string, string> = {
  purchase: 'Credit pack',
  daily_login: 'Daily login reward',
  quest_complete: 'Quest reward',
  win_streak: 'Win streak reward',
  cosmetic_purchase: 'Cosmetic',
  identity: 'Character edit',
  draft_render: 'Portrait draft',
  render_look: 'Portrait render',
  random_character: 'Random character',
  regenerate_portrait: 'Portrait render',
  regenerate_avatar: 'Avatar render',
  initial_avatar: 'Avatar render',
  new_portrait: 'Portrait render',
  custom_item_image: 'Custom item',
  custom_item_text: 'Custom item',
  traits_single_swap: 'Trait change',
  traits_full_reroll: 'Trait reroll',
  video_upgrade: 'Cinematic video',
  video_moderation_refund: 'Refund · cinematic video',
  leave_battle: 'Left a battle',
  prompt_suggestions: 'New ideas',
  prompt_suggestions_reroll: 'New ideas',
  welcome_grant: 'Welcome credits',
  first_time_offer: 'Starter offer',
  appeal_refund: 'Refund · appeal upheld',
};

function humanise(key: string): string {
  const cleaned = key.replace(/[_-]+/g, ' ').trim();
  return cleaned
    ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    : 'Credits';
}

/**
 * "Refund · portrait render", "Credit pack", "Quest reward" …
 *
 * Refunds arrive as `<base>_refund:<why>` or `<base>_refund_<why>`; the reason
 * after the separator is operational detail the player does not need.
 */
export function transactionLabel(reason: string | null | undefined): string {
  if (!reason) return 'Credits';
  const key = reason.trim();
  if (BASE_LABELS[key]) return BASE_LABELS[key];

  const refund = /^(.*?)_refund(?:[:_].*)?$/.exec(key);
  if (refund) {
    const base = refund[1];
    const baseLabel = BASE_LABELS[base] ?? humanise(base);
    return `Refund · ${baseLabel.charAt(0).toLowerCase()}${baseLabel.slice(1)}`;
  }

  if (/^remote_test|^test_/.test(key)) return 'Test adjustment';
  return humanise(key);
}

/** "+30 credits" / "−3 credits", with the sign the player expects. */
export function transactionAmountLabel(amount: number): string {
  const n = Math.abs(Math.round(amount));
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${creditsNoun(n)}`;
}
