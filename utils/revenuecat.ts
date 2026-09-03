/**
 * RevenueCat identifiers and pure predicates shared by the provider and the
 * wallet screen.
 *
 * The SDK itself is driven from `providers/RevenueCatProvider.tsx`. The
 * module-level `initializeRevenueCat`, `getCustomerInfo`, `hasActiveSubscription`
 * and `restorePurchases` helpers that used to live here duplicated the
 * provider's own calls and had no callers; they were removed rather than left
 * as a second, unmaintained way to talk to the store.
 */

/**
 * The single RevenueCat entitlement that grants Prompt Wars+.
 *
 * This must exactly match the entitlement identifier configured in the
 * RevenueCat dashboard, and ONLY the Plus subscription products
 * (`promptwars_plus_monthly` / `_annual`) may be attached to it.
 *
 * Credit packs and the first-time offer must NOT grant it: they are
 * consumables, and Plus is what gates cosmetics, allowance and the subscriber
 * badge. Attaching them here would hand a $1.99 credit buyer a subscription.
 */
export const PLUS_ENTITLEMENT_ID = 'plus';

/**
 * True when the named Plus entitlement is active.
 *
 * Previously this returned `Object.keys(entitlements.active).length > 0`, i.e.
 * "has ANY active entitlement". That is not the same question. It happens to be
 * correct only while Plus is the sole entitlement in the dashboard -- the first
 * time any other one is added (a cosmetic bundle, a founder's pack, a promo),
 * everyone holding it silently becomes a subscriber. Checking the name is
 * correct regardless of what else gets configured later.
 *
 * Pure predicate over a CustomerInfo-shaped object, so it is unit-testable.
 */
export function isPlusActive(
  customerInfo:
    | { entitlements?: { active?: Record<string, unknown> } }
    | null
    | undefined,
): boolean {
  const active = customerInfo?.entitlements?.active;
  if (!active) return false;
  return Object.prototype.hasOwnProperty.call(active, PLUS_ENTITLEMENT_ID);
}

/**
 * Product IDs for credit packs and subscriptions
 * Match these with RevenueCat dashboard and .env.example documentation
 */
export const PRODUCT_IDS = {
  // Credit packs (consumable)
  CREDITS_10: 'credits_10', // Starter: $1.99
  CREDITS_30: 'credits_30', // Standard: $4.99 (best value)
  CREDITS_80: 'credits_80', // Big: $9.99
  CREDITS_200: 'credits_200', // Mega: $19.99

  // Subscription (Prompt Wars+)
  PLUS_MONTHLY: 'promptwars_plus_monthly', // ~$9.99/mo
  PLUS_ANNUAL: 'promptwars_plus_annual', // ~$59.99/yr

  // First-time-user offer (one-time bundle; product_id must match the
  // first_time_offers.product_id seeded in the DB migration)
  FTUO_STARTER: 'ftuo_starter_legend',
} as const;

/**
 * IMPORTANT: All purchase validation and entitlement grants MUST happen
 * server-side via Supabase Edge Functions. Never trust client-side
 * purchase state for gameplay decisions.
 *
 * Purchase flow:
 * 1. Client initiates purchase via RevenueCat SDK
 * 2. RevenueCat processes payment with App Store / Play Store
 * 3. RevenueCat sends webhook to `revenuecat-webhook` Edge Function
 * 4. Server validates, mirrors purchase/subscription to DB, grants credits
 * 5. Client queries `entitlements` view to check feature gates
 *
 * Video upgrade flow:
 * 1. Client calls `request-video-upgrade` Edge Function
 * 2. Server checks `entitlements` view (single source of truth)
 * 3. Server spends credits/allowance or grants from free tier
 * 4. Server creates `video_jobs` row
 * 5. Client subscribes to Realtime updates for video status
 */

/**
 * Credits delivered per pack, mirroring the server's authoritative map in
 * `supabase/functions/_shared/revenuecat-events.ts`.
 *
 * The wallet screen used to hardcode both the credit count and the price, and
 * they had drifted: it advertised 50 credits for $3.99 on a button carrying
 * `credits_30`, while the server granted 30. Display now derives from here and
 * price comes from the store product, so the two can no longer disagree
 * silently. Keep this in lockstep with the server map.
 */
export const CREDIT_PACK_CREDITS: Record<string, number> = {
  [PRODUCT_IDS.CREDITS_10]: 10,
  [PRODUCT_IDS.CREDITS_30]: 30,
  [PRODUCT_IDS.CREDITS_80]: 80,
  [PRODUCT_IDS.CREDITS_200]: 200,
};

/**
 * Display name and ordering for the credit packs. "Mega", not "Whale": the
 * latter is industry slang for a high-spending player and is not a name to put
 * in front of one.
 */
export const CREDIT_PACK_META: Record<
  string,
  { title: string; order: number; badge?: string }
> = {
  [PRODUCT_IDS.CREDITS_10]: { title: 'Starter', order: 1 },
  [PRODUCT_IDS.CREDITS_30]: {
    title: 'Standard',
    order: 2,
    badge: 'Best value',
  },
  [PRODUCT_IDS.CREDITS_80]: { title: 'Big', order: 3 },
  [PRODUCT_IDS.CREDITS_200]: { title: 'Mega', order: 4 },
};
