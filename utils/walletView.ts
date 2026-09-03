/**
 * Pure helpers for the profile-group screens: wallet, cosmetic shop, stats
 * and blocked players.
 *
 * Kept free of React and of the Supabase/RevenueCat clients so every sentence
 * a player reads on these screens can be pinned by a plain Jest test. The
 * screens compose these; they do not hold copy of their own.
 */

import { formatCredits } from '@/utils/credits';
import { isPlusActive } from '@/utils/revenuecat';

// ---------------------------------------------------------------------------
// Cosmetic shop
// ---------------------------------------------------------------------------

/** `cosmetics_catalog.unlock_rule` as the server stores it. */
export type UnlockRule = Record<string, number> | null | undefined;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * The bare condition an earned cosmetic unlocks at: "25 wins", "level 5",
 * "a 3-day login streak", "play".
 *
 * Bare on purpose. The old helper returned "Unlock: 25 wins" and every caller
 * then wrapped it again, so the card read "Free at: Unlock: 25 wins". Callers
 * compose the sentence they need from this phrase.
 */
export function unlockHint(rule: UnlockRule): string {
  if (!rule) return 'play';
  if (rule.wins) return plural(rule.wins, 'win');
  if (rule.total_battles) return plural(rule.total_battles, 'battle');
  if (rule.level) return `level ${rule.level}`;
  if (rule.best_streak) return `a ${rule.best_streak}-win streak`;
  if (rule.daily_login_streak)
    return `a ${rule.daily_login_streak}-day login streak`;
  return 'play';
}

/** Under a card that can be both earned and bought. */
export function earnOrBuyHint(rule: UnlockRule): string {
  const hint = unlockHint(rule);
  return hint === 'play'
    ? 'Free through play — or buy it now'
    : `Free at ${hint} — or buy it now`;
}

/** In the purchase confirmation, so nobody two wins away spends first. */
export function alsoEarnHint(rule: UnlockRule): string {
  const hint = unlockHint(rule);
  return hint === 'play'
    ? 'You can also earn it through play'
    : `You can also earn it: ${hint}`;
}

/** The lock pill on an earned item that is not for sale. */
export function lockedHint(rule: UnlockRule): string {
  const hint = unlockHint(rule);
  return hint === 'play' ? 'Earned through play' : `Unlocks at ${hint}`;
}

/** Screen-reader label for a Buy button. */
export function buyAccessibilityLabel(a: {
  name: string;
  price: number;
  earnable: boolean;
  rule: UnlockRule;
}): string {
  const base = `Buy ${a.name} for ${formatCredits(a.price, 'sentence')}`;
  return a.earnable ? `${base}, or earn it: ${unlockHint(a.rule)}` : base;
}

/**
 * Player copy for the `cosmetics` function's error codes. The raw codes are
 * developer identifiers and used to reach the player verbatim.
 */
export const COSMETIC_ERROR_COPY: Record<string, string> = {
  not_purchasable: 'This item isn’t for sale.',
  already_owned: 'You already own this one.',
  type_mismatch: 'That item doesn’t fit this slot.',
  not_your_character: 'That isn’t your character.',
  not_owned: 'You don’t own this one yet.',
  no_active_character: 'Create a character before equipping cosmetics.',
};

export const COSMETIC_ERROR_FALLBACK = 'Something went wrong. Try again.';

/** Never returns the raw code. */
export function cosmeticErrorMessage(code: string | null | undefined): string {
  if (!code) return COSMETIC_ERROR_FALLBACK;
  return COSMETIC_ERROR_COPY[code.trim()] ?? COSMETIC_ERROR_FALLBACK;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * When to re-read the balance after a store purchase. The webhook that grants
 * credits usually lands within a couple of seconds but can take longer under
 * load; one fixed 2 s timeout missed it often enough that players saw their
 * old balance and assumed the purchase had failed.
 */
export const BALANCE_POLL_DELAYS_MS: readonly number[] = [2000, 5000, 10000];

/** "3 Oct 2026" in the device locale; null when the input is not a date. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  return at.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * "Renews 3 Oct 2026" / "Expires 3 Oct 2026", from the Plus entitlement info.
 * Null when RevenueCat has no expiry to show (lifetime, or not loaded yet).
 */
export function subscriptionRenewalLabel(
  entitlement:
    | { expirationDate?: string | null; willRenew?: boolean | null }
    | null
    | undefined,
): string | null {
  const date = shortDate(entitlement?.expirationDate);
  if (!date) return null;
  return entitlement?.willRenew ? `Renews ${date}` : `Expires ${date}`;
}

/** Where the platform lets a subscriber cancel or change their plan. */
export function subscriptionManageUrl(os: string): string {
  return os === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
}

/** One-line auto-renew disclosure the stores require next to a Subscribe button. */
export function autoRenewDisclosure(
  priceString: string | null | undefined,
): string {
  const price = priceString ? `${priceString}/month` : 'the monthly price';
  return `Renews automatically at ${price} until cancelled in your store account settings.`;
}

export type RestoreOutcome = 'restored' | 'nothing' | 'failed';

/**
 * Whether a restore actually found anything. RevenueCat's `restorePurchases`
 * resolves either way, so "Purchases restored" used to be shown to players
 * whose account had nothing to restore.
 */
export function restoreOutcomeFor(
  info:
    | {
        entitlements?: { active?: Record<string, unknown> };
        allPurchasedProductIdentifiers?: string[] | null;
      }
    | null
    | undefined,
): Exclude<RestoreOutcome, 'failed'> {
  if (isPlusActive(info)) return 'restored';
  if ((info?.allPurchasedProductIdentifiers?.length ?? 0) > 0)
    return 'restored';
  return 'nothing';
}

/** "30 video reveals left this month", never "0 video reveals remaining this month". */
export function allowanceLabel(remaining: number): string {
  if (remaining <= 0) return 'No video reveals left this month';
  return `${remaining} video reveal${remaining === 1 ? '' : 's'} left this month`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** "62.5%" or "—" before the first battle; never "0%" from a division by zero. */
export function winRateLabel(wins: number, total: number): string {
  if (!total || total <= 0) return '—';
  const pct = (Math.max(0, wins) / total) * 100;
  return `${pct.toFixed(pct === 100 || pct === 0 ? 0 : 1)}%`;
}

// ---------------------------------------------------------------------------
// Blocked players
// ---------------------------------------------------------------------------

/** "Blocked 12 Aug 2026"; null when the block has no timestamp. */
export function blockedAtLabel(iso: string | null | undefined): string | null {
  const date = shortDate(iso);
  return date ? `Blocked ${date}` : null;
}
