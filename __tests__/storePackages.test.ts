import type {
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import {
  findPackageForProduct,
  offerPriceStrings,
} from '@/utils/storePackages';

function pkg(
  offering: string,
  id: string,
  productId: string,
  extra: Partial<{ priceString: string; currencyCode: string }> = {},
): PurchasesPackage {
  return {
    identifier: id,
    offeringIdentifier: offering,
    product: {
      identifier: productId,
      priceString: extra.priceString ?? '$4.99',
      currencyCode: extra.currencyCode ?? 'USD',
    },
  } as unknown as PurchasesPackage;
}

function offerings(
  current: PurchasesPackage[],
  all: Record<string, PurchasesPackage[]>,
) {
  return {
    current: current.length
      ? { identifier: 'default', availablePackages: current }
      : null,
    all: Object.fromEntries(
      Object.entries(all).map(([k, v]) => [
        k,
        { identifier: k, availablePackages: v },
      ]),
    ),
  } as unknown as PurchasesOfferings;
}

describe('findPackageForProduct', () => {
  it('returns null without offerings or a product id', () => {
    expect(findPackageForProduct(null, 'x')).toBeNull();
    expect(findPackageForProduct(offerings([], {}), undefined)).toBeNull();
  });

  it('prefers the current offering', () => {
    const a = pkg('default', 'p', 'ftuo', { priceString: '$4.99' });
    const b = pkg('promo', 'p', 'ftuo', { priceString: '$3.99' });
    const found = findPackageForProduct(
      offerings([a], { default: [a], promo: [b] }),
      'ftuo',
    );
    expect(found?.product.priceString).toBe('$4.99');
  });

  it('falls back to non-current offerings', () => {
    const plus = pkg('default', 'monthly', 'plus_monthly');
    const ftuo = pkg('ftuo_offering', 'starter', 'ftuo_starter');
    const found = findPackageForProduct(
      offerings([plus], { default: [plus], ftuo_offering: [ftuo] }),
      'ftuo_starter',
    );
    expect(found).toBe(ftuo);
  });

  it('returns null when no offering carries the product', () => {
    const plus = pkg('default', 'monthly', 'plus_monthly');
    expect(
      findPackageForProduct(offerings([plus], { default: [plus] }), 'nope'),
    ).toBeNull();
  });
});

describe('offerPriceStrings', () => {
  it('leaves both fallbacks in place without a package', () => {
    expect(offerPriceStrings(null)).toEqual({
      priceString: null,
      referencePriceString: undefined,
    });
  });

  it('uses the store price and keeps the USD reference for USD storefronts', () => {
    const p = pkg('default', 'p', 'ftuo', {
      priceString: '$4.99',
      currencyCode: 'USD',
    });
    expect(offerPriceStrings(p)).toEqual({
      priceString: '$4.99',
      referencePriceString: undefined,
    });
  });

  it('suppresses the USD reference next to a non-USD store price', () => {
    const p = pkg('default', 'p', 'ftuo', {
      priceString: '4,99 €',
      currencyCode: 'EUR',
    });
    expect(offerPriceStrings(p)).toEqual({
      priceString: '4,99 €',
      referencePriceString: null,
    });
  });

  it('treats an unknown currency as USD-compatible', () => {
    const p = pkg('default', 'p', 'ftuo', {
      priceString: '$4.99',
      currencyCode: '',
    });
    expect(offerPriceStrings(p).referencePriceString).toBeUndefined();
  });
});
