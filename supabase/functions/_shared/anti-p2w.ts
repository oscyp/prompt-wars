// Anti-pay-to-win runtime guard.
//
// Lives in _shared because it now has two consumers: round-resolve, which runs
// it over every scoring input before the judge sees them, and the leave-battle
// tests, which assert that a paid exit leaves no trace in the score payload it
// writes. Keeping one copy means the ban list cannot drift between "what the
// judge refuses to see" and "what we test for".

/**
 * Anti-pay-to-win runtime guard. Fails loudly if a future edit introduces a
 * field name that smells like monetization into the scoring inputs. This is a
 * defense-in-depth check; the structural invariant is enforced by the judge
 * pipeline signature (see `_shared/judge.ts`).
 */
export function assertNoMonetizationDataInScoring(
  inputs: Record<string, unknown>,
): void {
  const banned = [
    'subscription',
    'subscriber',
    'is_subscriber',
    'tier',
    'plus',
    'cosmetic',
    'cosmetic_unlocks',
    'purchase',
    'purchase_id',
    'product_id',
    'credit',
    'credits',
    'credits_balance',
    'credits_charged',
    'allowance',
    'allowance_remaining',
    'grant',
    'free_grant',
    'new_user_grant',
    'reservation',
    'reservation_id',
    'entitlement',
    'entitlement_source',
    'revenuecat',
    'wallet_transaction',
  ];
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (typeof v !== 'object') return;
    if (seen.has(v as unknown as string)) return;
    seen.add(v as unknown as string);
    for (const k of Object.keys(v as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (banned.some((b) => lower === b)) {
        throw new Error(
          `anti_pay_to_win_violation: scoring input contains forbidden key '${k}'`,
        );
      }
      walk((v as Record<string, unknown>)[k]);
    }
  };
  walk(inputs);
}
