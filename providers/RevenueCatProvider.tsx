// RevenueCat Provider / Hook
// Wraps RevenueCat SDK and coordinates with server-side validation

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import Purchases, {
  PurchasesOfferings,
  CustomerInfo,
  PurchasesPackage,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase';
import { isPlusActive } from '@/utils/revenuecat';
import { restoreOutcomeFor, type RestoreOutcome } from '@/utils/walletView';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/**
 * How a purchase attempt ended.
 *
 * `cancelled` is the player closing the store sheet; it is not a failure and
 * must not be reported as one. The old boolean return folded it into `false`,
 * so the wallet could not tell "they changed their mind" from "the store broke"
 * and stayed silent on both.
 */
export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

export type { RestoreOutcome };

interface RevenueCatContextValue {
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
  isSubscriber: boolean;
  isLoading: boolean;
  /** Message from the last failed SDK call; cleared at the start of the next. */
  error: string | null;
  /** Full outcome. Prefer this on surfaces that give purchase feedback. */
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  /** Boolean-compatible wrapper: true only for `'purchased'`. */
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<RestoreOutcome>;
  refreshCustomerInfo: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextValue | undefined>(
  undefined,
);

/** The SDK flags cancellation two ways across versions; accept either. */
function isUserCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { userCancelled?: boolean | null; code?: string };
  if (e.userCancelled) return true;
  return (
    PURCHASES_ERROR_CODE !== undefined &&
    e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize RevenueCat on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const apiKey = Platform.select({
          ios: IOS_API_KEY,
          android: ANDROID_API_KEY,
        });

        if (!apiKey) {
          console.warn('RevenueCat API key not configured for this platform');
          if (mounted) setIsLoading(false);
          return;
        }

        // Get current user ID from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.warn('No authenticated user for RevenueCat setup');
          if (mounted) setIsLoading(false);
          return;
        }

        // Configure RevenueCat. Verbose SDK logging and the user-id echo are
        // development-only: in production they wrote the Supabase user id and
        // entitlement keys to the device log.
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        await Purchases.configure({
          apiKey,
          appUserID: user.id, // Supabase user ID
        });

        if (__DEV__) console.log('RevenueCat initialized with user:', user.id);

        // Fetch offerings and customer info
        await Promise.all([fetchOfferings(), fetchCustomerInfo()]);
      } catch (err) {
        console.error('RevenueCat initialization error:', err);
        if (mounted)
          setError(
            err instanceof Error ? err.message : 'Initialization failed',
          );
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  async function fetchOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      setOfferings(offerings);
      if (__DEV__) {
        console.log(
          'Offerings loaded:',
          offerings.current?.availablePackages.length,
        );
      }
    } catch (err) {
      console.error('Fetch offerings error:', err);
    }
  }

  async function fetchCustomerInfo() {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      if (__DEV__) {
        console.log(
          'Customer info loaded. Active entitlements:',
          Object.keys(info.entitlements.active),
        );
      }
    } catch (err) {
      console.error('Fetch customer info error:', err);
    }
  }

  async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
    try {
      setError(null);
      if (__DEV__) console.log('Purchasing package:', pkg.identifier);

      const { customerInfo: newCustomerInfo } =
        await Purchases.purchasePackage(pkg);

      setCustomerInfo(newCustomerInfo);

      // Server-side validation happens via webhook
      // Client only updates local state; server owns entitlements
      if (__DEV__)
        console.log('Purchase completed. Server validation via webhook.');

      return 'purchased';
    } catch (err) {
      // User cancelled: not an error, and not worth a console.error either.
      if (isUserCancelled(err)) {
        if (__DEV__) console.log('User cancelled purchase');
        return 'cancelled';
      }
      console.error('Purchase error:', err);

      setError(
        err instanceof Error && err.message ? err.message : 'Purchase failed',
      );
      return 'failed';
    }
  }

  async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
    return (await purchase(pkg)) === 'purchased';
  }

  async function restorePurchases(): Promise<RestoreOutcome> {
    try {
      setError(null);
      if (__DEV__) console.log('Restoring purchases...');

      const restoredInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredInfo);

      const outcome = restoreOutcomeFor(restoredInfo);
      if (__DEV__) console.log('Restore finished:', outcome);
      return outcome;
    } catch (err) {
      console.error('Restore purchases error:', err);
      setError(err instanceof Error ? err.message : 'Restore failed');
      return 'failed';
    }
  }

  async function refreshCustomerInfo() {
    await fetchCustomerInfo();
  }

  // Named entitlement, not "has any entitlement". The previous check was
  // `Object.keys(entitlements.active).length > 0`, which answers a different
  // question: it is only accidentally correct while Plus is the sole
  // entitlement configured. Adding any other one -- a cosmetic bundle, a promo,
  // a founder's pack -- would silently grant subscriber status, and its
  // benefits, to everyone holding it.
  const isSubscriber = isPlusActive(customerInfo);

  return (
    <RevenueCatContext.Provider
      value={{
        offerings,
        customerInfo,
        isSubscriber: Boolean(isSubscriber),
        isLoading,
        error,
        purchase,
        purchasePackage,
        restorePurchases,
        refreshCustomerInfo,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within RevenueCatProvider');
  }
  return context;
}
