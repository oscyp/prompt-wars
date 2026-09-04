// Pure helpers for translating RevenueCat subscription lifecycle events into
// `subscriptions` row updates. Kept separate from the webhook entrypoint so
// the semantics are unit-testable without a live Supabase stack.

export type SubscriptionLifecycleEventType =
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION';

export function isSubscriptionLifecycleEvent(
  eventType: string,
): eventType is SubscriptionLifecycleEventType {
  return (
    eventType === 'CANCELLATION' ||
    eventType === 'UNCANCELLATION' ||
    eventType === 'EXPIRATION'
  );
}

/**
 * Build the `subscriptions` UPDATE payload for a lifecycle event.
 *
 * Semantics (must stay in sync with the entitlement views, which treat
 * `status IN ('active','canceled') AND expires_at > now()` as subscribed):
 *
 * - CANCELLATION only means auto-renew was turned OFF. The user stays paid
 *   through `expires_at`, so we record status='canceled' but NEVER clear
 *   expires_at — the views keep granting benefits until the paid period ends.
 * - UNCANCELLATION means auto-renew was turned back on before expiry; the row
 *   returns to 'active'. Allowance counters are deliberately untouched (the
 *   billing period did not change).
 * - EXPIRATION is terminal: status='expired' is excluded by the views
 *   regardless of expires_at.
 *
 * When RevenueCat supplies `expiration_at_ms` we refresh expires_at with that
 * authoritative value; otherwise the stored value is preserved (the update
 * simply omits the column).
 */
export function buildSubscriptionLifecycleUpdate(
  eventType: SubscriptionLifecycleEventType,
  expirationAtMs: number | undefined,
  nowIso: string = new Date().toISOString(),
): Record<string, string> {
  const status =
    eventType === 'EXPIRATION'
      ? 'expired'
      : eventType === 'CANCELLATION'
        ? 'canceled'
        : 'active';

  const update: Record<string, string> = {
    status,
    updated_at: nowIso,
  };

  if (expirationAtMs) {
    update.expires_at = new Date(expirationAtMs).toISOString();
  }

  return update;
}

/**
 * Authoritative product -> credits map.
 *
 * The webhook used to derive the grant by regexing digits out of the product
 * id (`/credits_(\d+)/`). That silently ties the amount a player receives to a
 * store identifier string, so a renamed or mistyped SKU changes the payout, and
 * an id like `credits_9999` would grant 9999.
 *
 * It also made the wallet screen's hardcoded copy impossible to reconcile: it
 * advertised "50 credits for $3.99" on a button carrying `credits_30`, and the
 * regex paid 30. Players were shown one number and given another.
 *
 * Credit counts here match the ladder in the concept doc §10.1 and the product
 * ids in utils/revenuecat.ts. An unknown id grants nothing and is rejected.
 */
export const CREDIT_PACK_GRANTS: Record<string, number> = {
  credits_10: 10,
  credits_30: 30,
  credits_80: 80,
  credits_200: 200,
};

export function creditsForProductId(productId: string): number | null {
  return CREDIT_PACK_GRANTS[productId] ?? null;
}

/**
 * RevenueCat `store` -> our `purchases.platform` value.
 *
 * RevenueCat sends this field UPPERCASE (`APP_STORE`, `PLAY_STORE`,
 * `TEST_STORE`, ...). The webhook used to compare it against lowercase
 * literals, so every branch missed and every purchase ever recorded landed as
 * platform='unknown' -- including real App Store ones, not just Test Store.
 * Matching is case-insensitive here so neither casing can regress it.
 *
 * TEST_STORE gets its own value rather than collapsing into 'unknown': test
 * purchases are simulated and generate no revenue, so any revenue reporting
 * over this table has to be able to exclude them.
 */
const STORE_PLATFORMS: Record<string, string> = {
  APP_STORE: 'ios',
  MAC_APP_STORE: 'ios',
  PLAY_STORE: 'android',
  AMAZON: 'android',
  STRIPE: 'web',
  RC_BILLING: 'web',
  PADDLE: 'web',
  ROKU: 'web',
  TEST_STORE: 'test',
  PROMOTIONAL: 'promotional',
};

export function platformForStore(store: string | undefined | null): string {
  if (!store) return 'unknown';
  return STORE_PLATFORMS[store.toUpperCase()] ?? 'unknown';
}

/**
 * Event types that represent a completed one-off purchase.
 *
 * Consumables (credit packs) and non-consumables (the FTUO bundle) arrive as
 * NON_RENEWING_PURCHASE, NOT INITIAL_PURCHASE -- INITIAL_PURCHASE is only sent
 * for a new *subscription*. The webhook originally routed credit packs and the
 * FTUO on INITIAL_PURCHASE alone, so every credit pack ever bought fell through
 * to the "unknown event type" branch and was acknowledged with a 200 without
 * granting anything. RevenueCat showed the delivery as "Sent" and the player
 * got nothing.
 */
export function isOneOffPurchaseEvent(eventType: string): boolean {
  return (
    eventType === 'NON_RENEWING_PURCHASE' || eventType === 'INITIAL_PURCHASE'
  );
}
