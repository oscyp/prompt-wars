// RevenueCat Provider / Hook
// Wraps RevenueCat SDK and coordinates with server-side validation

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import Purchases, {
  PurchasesOfferings,
  CustomerInfo,
  PurchasesPackage,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/utils/supabase';
import { isPlusActive } from '@/utils/revenuecat';
import { generateIdempotencyKey } from '@/utils/characters';
import { restoreOutcomeFor, type RestoreOutcome } from '@/utils/walletView';

import {
  readPendingPurchase,
  beginPendingPurchase,
  replacePendingPurchase,
  sameCheckout,
  clearPendingPurchase,
  settlePendingPurchase,
  type PendingPurchase,
} from '@/utils/walletRecovery';

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
export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed' | 'pending';

export type { RestoreOutcome };

interface RevenueCatContextValue {
  pendingPurchase: PendingPurchase | null;
  /** Last checkout verified against server fulfillment, scoped to the current account. */
  fulfilledPurchase: PendingPurchase | null;
  checkPendingPurchase: () => Promise<boolean>;
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

// RevenueCat has one process-wide account. Keep binding and the associated SDK
// operation in one queue, including across provider remounts. Storage uses its
// own short per-account queue; no callback below re-enters this SDK queue.
let sdkTail: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = sdkTail.catch(() => {}).then(operation);
  sdkTail = run.catch(() => {});
  return run;
}
function withStoreAccount<T>(
  accountId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withStoreLock(async () => {
    const current = async () => (await supabase.auth.getUser()).data.user?.id;
    if ((await current()) !== accountId)
      throw new Error('Account changed. Check again.');
    let sdkAccount: string;
    try {
      sdkAccount = await Purchases.getAppUserID();
    } catch (error) {
      const apiKey = Platform.select({
        ios: IOS_API_KEY,
        android: ANDROID_API_KEY,
      });
      if (!apiKey) throw error;
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      await Purchases.configure({ apiKey, appUserID: accountId });
      sdkAccount = accountId;
    }
    if (sdkAccount !== accountId) await Purchases.logIn(accountId);
    if ((await current()) !== accountId)
      throw new Error('Account changed. Check again.');
    return operation();
  });
}

// Kept local to the provider: legacy stored rows without a phase remain uncertain.
type CheckoutRecord = PendingPurchase & {
  checkoutPhase?: 'reserved' | 'started' | 'cleanup';
};
const needsCheckoutCleanup = (record: CheckoutRecord) =>
  record.checkoutPhase === 'reserved' || record.checkoutPhase === 'cleanup';
async function cleanupCheckout(record: CheckoutRecord) {
  // Mark intent before removal so a failed delete can be retried after restart.
  // Both updates compare checkout identity and cannot touch a newer attempt.
  await replacePendingPurchase(record, {
    ...record,
    checkoutPhase: 'cleanup',
  } as CheckoutRecord).catch(() => false);
  return clearPendingPurchase(record);
}

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] =
    useState<PendingPurchase | null>(null);
  const [fulfilledPurchase, setFulfilledPurchase] =
    useState<PendingPurchase | null>(null);
  const mounted = useRef(true);
  const account = useRef<string | null | undefined>(undefined);
  const publication = useRef(0);
  const purchaseInFlight = useRef(false);
  const checks = useRef(new Map<string, Promise<boolean>>());

  const isCurrent = useCallback(async (id: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    return (
      mounted.current &&
      user?.id === id &&
      (account.current === undefined || account.current === id)
    );
  }, []);
  // Always re-read persisted state; a completed old check must never publish its
  // captured snapshot after a newer checkout has reserved the account slot.
  const publishPending = useCallback(
    async (id: string) => {
      const sequence = ++publication.current;
      const stored = await readPendingPurchase(id);
      if ((await isCurrent(id)) && sequence === publication.current)
        setPendingPurchase(stored);
      return stored;
    },
    [isCurrent],
  );
  const checkPendingPurchase = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return false;
    const existingCheck = checks.current.get(user.id);
    if (existingCheck) return existingCheck;
    const checking = (async () => {
      let pending = (await readPendingPurchase(
        user.id,
      )) as CheckoutRecord | null;
      if (pending && needsCheckoutCleanup(pending)) {
        const expected = pending;
        // Wait behind any purchase that owns the SDK. A captured reserved phase
        // may have become started while this recovery call was waiting.
        await withStoreLock(async () => {
          const current = (await readPendingPurchase(
            user.id,
          )) as CheckoutRecord | null;
          if (
            current &&
            sameCheckout(current, expected) &&
            needsCheckoutCleanup(current)
          )
            await cleanupCheckout(current);
        });
        pending = (await readPendingPurchase(user.id)) as CheckoutRecord | null;
      }
      if (!pending) {
        await publishPending(user.id);
        return true;
      }
      await publishPending(user.id);
      if (!pending.transactionId) {
        const info = await withStoreAccount(user.id, () =>
          Purchases.getCustomerInfo(),
        ).catch(() => null);
        // Legacy attempts without a pre-checkout baseline have no unambiguous
        // SDK correlation. Their account-scoped server record remains the fallback.
        const matches =
          pending.sdkTransactionBaseline &&
          info?.nonSubscriptionTransactions?.filter(
            (tx) =>
              tx.productIdentifier === pending!.productId &&
              !pending!.sdkTransactionBaseline!.includes(
                tx.transactionIdentifier,
              ) &&
              Date.parse(tx.purchaseDate) >= Date.parse(pending!.startedAt),
          );
        if (matches?.length === 1) {
          const recovered = {
            ...pending,
            transactionId: matches[0].transactionIdentifier,
          };
          if (await replacePendingPurchase(pending, recovered))
            pending = recovered;
        }
      }
      const fulfilled = await settlePendingPurchase(pending);
      // Publish verified fulfillment before clearing the visible pending state.
      // Settlement already verified this account's receipt and removed its durable
      // pending identity. Do not insert a fallible auth read before handing off
      // that only event; the auth subscription fences account changes synchronously.
      // Empty storage and canceled/unstarted cleanup never emit this event.
      if (
        fulfilled &&
        mounted.current &&
        (account.current === undefined || account.current === user.id)
      )
        setFulfilledPurchase(pending);
      return (await publishPending(user.id)) === null;
    })();
    checks.current.set(user.id, checking);
    try {
      return await checking;
    } catch (error) {
      if (await isCurrent(user.id))
        setError('Could not check purchase. Try again.');
      throw error;
    } finally {
      if (checks.current.get(user.id) === checking)
        checks.current.delete(user.id);
    }
  }, [publishPending, isCurrent]);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void checkPendingPurchase().catch(() => {});
    };
    const {
      data: { subscription: auth },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (id !== account.current) {
        account.current = id;
        publication.current++;
        setPendingPurchase(null);
        setFulfilledPurchase(null);
        setCustomerInfo(null);
        setError(null);
        // Never await SDK/auth calls inside the Supabase auth callback.
        if (id) queueMicrotask(refresh);
      }
    });
    refresh();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      auth.unsubscribe();
      foreground.remove();
    };
  }, [checkPendingPurchase, isCurrent]);

  useEffect(() => {
    void (async () => {
      try {
        const apiKey = Platform.select({
          ios: IOS_API_KEY,
          android: ANDROID_API_KEY,
        });
        if (!apiKey) return;
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return;
        const result = await withStoreAccount(user.id, async () => {
          const [available, info] = await Promise.all([
            Purchases.getOfferings(),
            Purchases.getCustomerInfo(),
          ]);
          return { available, info };
        });
        if (await isCurrent(user.id)) {
          setOfferings(result.available);
          setCustomerInfo(result.info);
        }
      } catch {
        if (mounted.current) setError('Could not load store. Check again.');
      } finally {
        if (mounted.current) setIsLoading(false);
      }
    })();
  }, [isCurrent]);

  async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
    if (purchaseInFlight.current) return 'pending';
    purchaseInFlight.current = true;
    let pending: CheckoutRecord | null = null;
    let ownsReservation = false;
    let id: string | undefined;
    let storeStarted = false;
    try {
      id = (await supabase.auth.getUser()).data.user?.id;
      if (!id) throw new Error('Sign in before purchasing');
      if (await isCurrent(id)) setError(null);
      return await withStoreAccount(id, async () => {
        const existing = await readPendingPurchase(id!);
        if (existing) {
          await publishPending(id!);
          return 'pending';
        }
        // Snapshot store history before persisting/reserving and before checkout.
        // If it cannot be read, persist uncertainty; never infer from old history.
        const info = await Purchases.getCustomerInfo().catch(() => null);
        pending = {
          accountId: id!,
          productId: pkg.product.identifier,
          startedAt: new Date().toISOString(),
          checkoutId: generateIdempotencyKey(),
          checkoutPhase: 'reserved',
          ...(info
            ? {
                sdkTransactionBaseline: (
                  info.nonSubscriptionTransactions ?? []
                ).map((tx) => tx.transactionIdentifier),
              }
            : {}),
        };
        const reserved = await beginPendingPurchase(pending);
        if (!sameCheckout(reserved, pending)) {
          await publishPending(id!);
          return 'pending';
        }
        ownsReservation = true;
        await publishPending(id!);
        if (!(await isCurrent(id!)))
          throw new Error('Account changed before checkout opened');
        const started: CheckoutRecord = {
          ...pending,
          checkoutPhase: 'started',
        };
        if (!(await replacePendingPurchase(pending, started)))
          throw new Error('Checkout reservation changed. Check again.');
        pending = started;
        storeStarted = true;
        const { customerInfo: infoAfter, transaction } =
          await Purchases.purchasePackage(pkg);
        await replacePendingPurchase(pending, {
          ...pending,
          transactionId: transaction.transactionIdentifier,
        });
        await publishPending(id!);
        if (await isCurrent(id!)) setCustomerInfo(infoAfter);
        return 'purchased';
      });
    } catch (error) {
      if (
        pending &&
        ownsReservation &&
        (!storeStarted || isUserCancelled(error))
      ) {
        try {
          await cleanupCheckout(pending);
          if (id) await publishPending(id);
          return isUserCancelled(error) ? 'cancelled' : 'failed';
        } catch {
          if (id && (await isCurrent(id).catch(() => false)))
            setError(
              'Could not finish canceling checkout. Check again to retry cleanup.',
            );
          if (id) await publishPending(id).catch(() => {});
          return 'pending';
        }
      }
      if (id && (await isCurrent(id).catch(() => false)))
        setError(error instanceof Error ? error.message : 'Purchase failed');
      return storeStarted ? 'pending' : 'failed';
    } finally {
      purchaseInFlight.current = false;
    }
  }
  async function purchasePackage(pkg: PurchasesPackage) {
    return (await purchase(pkg)) === 'purchased';
  }
  async function restorePurchases(): Promise<RestoreOutcome> {
    const id = (await supabase.auth.getUser()).data.user?.id;
    if (!id) return 'failed';
    try {
      const info = await withStoreAccount(id, () =>
        Purchases.restorePurchases(),
      );
      if (await isCurrent(id)) {
        setCustomerInfo(info);
        setError(null);
      }
      await checkPendingPurchase();
      return restoreOutcomeFor(info);
    } catch (error) {
      if (await isCurrent(id))
        setError(error instanceof Error ? error.message : 'Restore failed');
      return 'failed';
    }
  }
  async function refreshCustomerInfo() {
    const id = (await supabase.auth.getUser()).data.user?.id;
    if (!id) return;
    try {
      const info = await withStoreAccount(id, () =>
        Purchases.getCustomerInfo(),
      );
      if (await isCurrent(id)) setCustomerInfo(info);
    } catch {
      if (await isCurrent(id)) setError('Could not load store. Check again.');
    }
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
        pendingPurchase,
        fulfilledPurchase,
        checkPendingPurchase,
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
