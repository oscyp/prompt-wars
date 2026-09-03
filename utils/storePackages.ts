/**
 * Pure helpers for matching a server-side product id to a RevenueCat package
 * and reading the store's own price strings off it.
 *
 * The server knows offers by `product_id` and quotes USD reference numbers.
 * The store knows the real, localized price. Wherever both are available, the
 * store wins: the USD figure is wrong for every non-US storefront.
 */

import type {
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

/**
 * Find the package whose store product matches `productId`, searching the
 * current offering first and then every other offering. Returns null when the
 * offerings have not loaded or no offering carries the product.
 */
export function findPackageForProduct(
  offerings: PurchasesOfferings | null | undefined,
  productId: string | null | undefined,
): PurchasesPackage | null {
  if (!offerings || !productId) return null;
  const seen = new Set<string>();
  const candidates: PurchasesPackage[] = [];
  const push = (pkgs: readonly PurchasesPackage[] | undefined) => {
    for (const pkg of pkgs ?? []) {
      const key = `${pkg.offeringIdentifier}:${pkg.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(pkg);
    }
  };
  push(offerings.current?.availablePackages);
  for (const offering of Object.values(offerings.all ?? {})) {
    push(offering.availablePackages);
  }
  return candidates.find((pkg) => pkg.product.identifier === productId) ?? null;
}

export interface OfferPriceStrings {
  /** The store's localized price, or null when there is no package to read. */
  priceString: string | null;
  /**
   * What to show as the "usually" price.
   *
   * `undefined` means "no store information, fall back to the server's USD
   * reference". `null` means "suppress it": the store priced the offer in a
   * currency other than USD, so the server's USD anchor would sit next to a
   * localized price and read as a different amount. A derived local anchor is
   * not an option either; a reference price has to be a real one.
   */
  referencePriceString: string | null | undefined;
}

/**
 * Price strings for an offer whose server copy quotes USD.
 *
 * Without a package both are undefined-ish so the caller's fallbacks apply.
 * With a USD package the store price is used and the USD reference stands.
 * With any other currency the reference is suppressed (see above).
 */
export function offerPriceStrings(
  pkg: PurchasesPackage | null | undefined,
): OfferPriceStrings {
  if (!pkg) return { priceString: null, referencePriceString: undefined };
  const currency = pkg.product.currencyCode?.toUpperCase();
  const usdOrUnknown = !currency || currency === 'USD';
  return {
    priceString: pkg.product.priceString || null,
    referencePriceString: usdOrUnknown ? undefined : null,
  };
}
