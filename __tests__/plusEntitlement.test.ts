import { isPlusActive, PLUS_ENTITLEMENT_ID } from '@/utils/revenuecat';

/**
 * Subscriber status must be decided by a NAMED entitlement.
 *
 * Both the provider and `hasActiveSubscription` previously used
 * `Object.keys(entitlements.active).length > 0` — "has any active entitlement".
 * That is only accidentally correct while Plus is the only entitlement in the
 * RevenueCat dashboard. The failure is invisible until a second one exists,
 * which is exactly when it becomes expensive, so it is pinned here.
 */
const withEntitlements = (...ids: string[]) => ({
  entitlements: {
    active: Object.fromEntries(ids.map((id) => [id, { identifier: id }])),
  },
});

describe('isPlusActive', () => {
  it('is true only when the Plus entitlement is active', () => {
    expect(isPlusActive(withEntitlements(PLUS_ENTITLEMENT_ID))).toBe(true);
  });

  it('is false with no active entitlements', () => {
    expect(isPlusActive(withEntitlements())).toBe(false);
  });

  // The regression this test exists for.
  it('is false when some OTHER entitlement is active', () => {
    expect(isPlusActive(withEntitlements('cosmetic_bundle'))).toBe(false);
    expect(isPlusActive(withEntitlements('founders_pack', 'promo_2026'))).toBe(
      false,
    );
  });

  it('is true when Plus is active alongside others', () => {
    expect(
      isPlusActive(withEntitlements('cosmetic_bundle', PLUS_ENTITLEMENT_ID)),
    ).toBe(true);
  });

  it('tolerates null, undefined and malformed customer info', () => {
    expect(isPlusActive(null)).toBe(false);
    expect(isPlusActive(undefined)).toBe(false);
    expect(isPlusActive({})).toBe(false);
    expect(isPlusActive({ entitlements: {} })).toBe(false);
  });

  it('is not fooled by inherited Object properties', () => {
    // `'toString' in active` would be true; hasOwnProperty is why it is not.
    expect(isPlusActive({ entitlements: { active: {} } })).toBe(false);
  });

  it('pins the identifier that must match the RevenueCat dashboard', () => {
    expect(PLUS_ENTITLEMENT_ID).toBe('plus');
  });
});
