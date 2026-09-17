import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';
import {
  isPurchaseFulfilled,
  readPendingPurchase,
  writePendingPurchase,
  settlePendingPurchase,
} from '@/utils/walletRecovery';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('@/utils/supabase', () => ({ supabase: {} }));
beforeEach(async () => {
  await AsyncStorage.clear();
});
const pending = {
  accountId: 'alice',
  productId: 'credits_30',
  startedAt: '2026-09-13T10:00:00Z',
  transactionId: 'store-123',
};
it('survives reload and never crosses account boundaries', async () => {
  await writePendingPurchase(pending);
  expect(await readPendingPurchase('alice')).toEqual(pending);
  expect(await readPendingPurchase('bob')).toBeNull();
});
it('retains a purchase through delayed server fulfillment and failed reads', async () => {
  await writePendingPurchase(pending);
  expect(await settlePendingPurchase(pending, async () => false)).toBe(false);
  expect(await readPendingPurchase('alice')).toEqual(pending);
  await expect(
    settlePendingPurchase(pending, async () => {
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
  expect(await readPendingPurchase('alice')).toEqual(pending);
  expect(await settlePendingPurchase(pending, async () => true)).toBe(true);
  expect(await readPendingPurchase('alice')).toBeNull();
});

it('does not confuse a purchase insert with the matching credit grant', async () => {
  let credited = false;
  const purchase: any = {
    select: () => purchase,
    eq: () => purchase,
    maybeSingle: async () => ({
      data: { id: 'purchase', credits_granted: 30, fulfilled_at: 'now' },
      error: null,
    }),
  };
  const ledger: any = {
    select: () => ledger,
    eq: () => ledger,
    gt: () => ledger,
    limit: async () => ({
      data: credited ? [{ id: 'ledger' }] : [],
      error: null,
    }),
  };
  (supabase as any).from = (table: string) =>
    table === 'purchases' ? purchase : ledger;
  expect(await isPurchaseFulfilled(pending)).toBe(false);
  credited = true;
  expect(await isPurchaseFulfilled(pending)).toBe(true);
});

it('waits for the offer ledger even when its purchase row defaults credits_granted to zero', async () => {
  const purchase: any = {
    select: () => purchase,
    eq: () => purchase,
    maybeSingle: async () => ({
      data: { id: 'offer-purchase', credits_granted: 0, fulfilled_at: 'now' },
      error: null,
    }),
  };
  const ledger: any = {
    select: () => ledger,
    eq: () => ledger,
    in: () => ledger,
    gt: () => ledger,
    limit: async () => ({ data: [], error: null }),
  };
  (supabase as any).from = (table: string) =>
    table === 'purchases' ? purchase : ledger;
  expect(
    await isPurchaseFulfilled({ ...pending, productId: 'ftuo_starter_legend' }),
  ).toBe(false);
});

it('recovers the store reference from the server after termination before the SDK response', async () => {
  const interrupted = { ...pending, transactionId: undefined };
  await writePendingPurchase(interrupted);
  const purchase: any = {
    select: () => purchase,
    eq: () => purchase,
    gte: () => purchase,
    order: () => purchase,
    limit: () => purchase,
    maybeSingle: async () => ({
      data: {
        id: 'purchase',
        revenuecat_transaction_id: 'recovered-txn',
        credits_granted: 30,
      },
      error: null,
    }),
  };
  const ledger: any = {
    select: () => ledger,
    eq: () => ledger,
    gt: () => ledger,
    limit: async () => ({ data: [], error: null }),
  };
  (supabase as any).from = (table: string) =>
    table === 'purchases' ? purchase : ledger;
  expect(await isPurchaseFulfilled(interrupted)).toBe(false);
  expect((await readPendingPurchase('alice'))?.transactionId).toBe(
    'recovered-txn',
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('an old fulfillment cannot clear a newer checkout after its server check is delayed', async () => {
  await writePendingPurchase(pending);
  const check = deferred<boolean>();
  const settling = settlePendingPurchase(pending, () => check.promise);
  const newer = {
    ...pending,
    checkoutId: 'new',
    startedAt: '2026-09-13T10:01:00Z',
    transactionId: 'second',
  };
  await writePendingPurchase(newer);
  check.resolve(true);
  expect(await settling).toBe(false);
  expect(await readPendingPurchase('alice')).toEqual(newer);
});
it('an old missing-reference lookup cannot overwrite a newer checkout', async () => {
  const old = { ...pending, transactionId: undefined };
  await writePendingPurchase(old);
  const lookup = deferred<any>();
  const query: any = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => lookup.promise,
  };
  const ledger: any = {
    select: () => ledger,
    eq: () => ledger,
    gt: () => ledger,
    limit: async () => ({ data: [], error: null }),
  };
  (supabase as any).from = (table: string) =>
    table === 'purchases' ? query : ledger;
  const checking = isPurchaseFulfilled(old);
  const newer = {
    ...pending,
    startedAt: '2026-09-13T10:01:00Z',
    transactionId: 'second',
  };
  await writePendingPurchase(newer);
  lookup.resolve({
    data: { id: 'old', revenuecat_transaction_id: 'old-txn' },
    error: null,
  });
  // A stale reference must be rejected before touching the ledger.
  await checking;
  expect(await readPendingPurchase('alice')).toEqual(newer);
});
