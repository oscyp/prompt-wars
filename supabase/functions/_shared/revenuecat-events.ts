// Pure helpers for translating RevenueCat subscription lifecycle events into
// `subscriptions` row updates. Kept separate from the webhook entrypoint so
// the semantics are unit-testable without a live Supabase stack.

export type SubscriptionLifecycleEventType =
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION';

export function isSubscriptionLifecycleEvent(
  eventType: string
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
  nowIso: string = new Date().toISOString()
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
