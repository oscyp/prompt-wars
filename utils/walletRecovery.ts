import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface PendingPurchase {
  accountId: string;
  productId: string;
  startedAt: string;
  transactionId?: string;
  /** Stable across SDK responses and app restarts. Legacy rows use account/product/start. */
  checkoutId?: string;
  /** Store transactions known before this checkout; absent means SDK recovery is uncertain. */
  sdkTransactionBaseline?: string[];
}
const key = (accountId: string) => `pending-purchase:v1:${accountId}`;
const storageTails = new Map<string, Promise<unknown>>();
function withStorage<T>(accountId: string, work: () => Promise<T>): Promise<T> {
  const next = (storageTails.get(accountId) ?? Promise.resolve())
    .catch(() => {})
    .then(work);
  storageTails.set(accountId, next);
  void next
    .finally(() => {
      if (storageTails.get(accountId) === next) storageTails.delete(accountId);
    })
    .catch(() => {});
  return next;
}
async function readStored(accountId: string): Promise<PendingPurchase | null> {
  const raw = await AsyncStorage.getItem(key(accountId));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingPurchase;
  if (value.accountId !== accountId || !value.productId || !value.startedAt)
    throw new Error('Could not read pending purchase');
  return value;
}
export const sameCheckout = (a: PendingPurchase, b: PendingPurchase) =>
  a.accountId === b.accountId &&
  (a.checkoutId || b.checkoutId
    ? Boolean(a.checkoutId) && a.checkoutId === b.checkoutId
    : a.productId === b.productId && a.startedAt === b.startedAt);
export function readPendingPurchase(accountId: string) {
  return withStorage(accountId, () => readStored(accountId));
}
export function writePendingPurchase(pending: PendingPurchase) {
  return withStorage(pending.accountId, () =>
    AsyncStorage.setItem(key(pending.accountId), JSON.stringify(pending)),
  );
}
/** Reserve only an empty slot; two callers can never start two store checkouts. */
export function beginPendingPurchase(pending: PendingPurchase) {
  return withStorage(pending.accountId, async () => {
    const existing = await readStored(pending.accountId);
    if (existing) return existing;
    await AsyncStorage.setItem(key(pending.accountId), JSON.stringify(pending));
    return pending;
  });
}
/** Enrich this attempt only; an earlier checker cannot overwrite a newer SDK reference. */
export function replacePendingPurchase(
  expected: PendingPurchase,
  next: PendingPurchase,
) {
  return withStorage(expected.accountId, async () => {
    const current = await readStored(expected.accountId);
    if (
      !current ||
      !sameCheckout(current, expected) ||
      !sameCheckout(expected, next) ||
      (current.transactionId && current.transactionId !== next.transactionId)
    )
      return false;
    await AsyncStorage.setItem(
      key(expected.accountId),
      JSON.stringify({ ...current, ...next }),
    );
    return true;
  });
}
export function clearPendingPurchase(expected: PendingPurchase) {
  return withStorage(expected.accountId, async () => {
    const current = await readStored(expected.accountId);
    if (!current || !sameCheckout(current, expected)) return false;
    await AsyncStorage.removeItem(key(expected.accountId));
    return true;
  });
}

/** Credit fulfillment requires its matching ledger entry, not just a purchase row or changed balance. */
export async function isPurchaseFulfilled(
  pending: PendingPurchase,
): Promise<boolean> {
  let query = supabase
    .from('purchases')
    .select('id, credits_granted, fulfilled_at, revenuecat_transaction_id')
    .eq('profile_id', pending.accountId)
    .eq('product_id', pending.productId);
  query = pending.transactionId
    ? query.eq('revenuecat_transaction_id', pending.transactionId)
    : query
        .gte('created_at', pending.startedAt)
        .order('created_at', { ascending: true })
        .limit(1);
  const { data: purchase, error } = await query.maybeSingle();
  if (error) throw error;
  if (!purchase) return false;
  if (!pending.transactionId && purchase.revenuecat_transaction_id) {
    if (
      pending.sdkTransactionBaseline?.includes(
        purchase.revenuecat_transaction_id,
      )
    )
      return false;
    const replaced = await replacePendingPurchase(pending, {
      ...pending,
      transactionId: purchase.revenuecat_transaction_id,
    });
    if (!replaced) return false;
  }
  if (
    pending.productId === 'promptwars_plus_monthly' ||
    pending.productId === 'promptwars_plus_annual'
  )
    return Boolean(purchase.fulfilled_at);
  const { data, error: ledgerError } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('profile_id', pending.accountId)
    .eq('purchase_id', purchase.id)
    .eq(
      'reason',
      pending.productId === 'ftuo_starter_legend'
        ? 'ftuo_purchase'
        : 'purchase',
    )
    .gt('amount', 0)
    .limit(1);
  if (ledgerError) throw ledgerError;
  return Boolean(data?.length);
}
export async function settlePendingPurchase(
  pending: PendingPurchase,
  check = isPurchaseFulfilled,
): Promise<boolean> {
  if (!(await check(pending))) return false;
  return clearPendingPurchase(pending);
}

/** Unlike the legacy sampled helper, a failed ledger read is never an empty ledger. */
export async function readWalletLedger(limit = 20) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
