import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import {
  RevenueCatProvider,
  useRevenueCat,
} from '@/providers/RevenueCatProvider';
import {
  readPendingPurchase,
  writePendingPurchase,
} from '@/utils/walletRecovery';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getAppUserID: jest.fn(async () => mockSdkAccount),
    logIn: jest.fn(async (id: string) => {
      mockSdkAccount = id;
      return {};
    }),
    purchasePackage: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({ nonSubscriptionTransactions: [] })),
  },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'cancelled' },
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => {
        if (mockAuthFailure) {
          mockAuthFailure = false;
          throw new Error('Auth read failed');
        }
        return { data: { user: { id: mockAccountId } } };
      },
      onAuthStateChange: (callback: any) => {
        mockAuthChange = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  },
}));
let mockAuthFailure = false;
let mockAccountId = 'alice';
let mockAuthChange: any;
let mockSdkAccount = 'alice';
const pkg: any = { identifier: 'pack', product: { identifier: 'credits_30' } };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RevenueCatProvider>{children}</RevenueCatProvider>
);
beforeEach(async () => {
  mockAuthFailure = false;
  mockAccountId = 'alice';
  mockSdkAccount = 'alice';
  (Purchases.getCustomerInfo as jest.Mock).mockReset().mockResolvedValue({
    nonSubscriptionTransactions: [],
    entitlements: { active: {} },
  });
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
it('persists the SDK transaction and prevents a second checkout while fulfillment is pending', async () => {
  (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
    customerInfo: { entitlements: { active: {} } },
    transaction: { transactionIdentifier: 'txn-123' },
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  let first: string | undefined;
  await act(async () => {
    first = await result.current.purchase(pkg);
  });
  expect(first).toBe('purchased');
  expect((await readPendingPurchase('alice'))?.transactionId).toBe('txn-123');
  let second: string | undefined;
  await act(async () => {
    second = await result.current.purchase(pkg);
  });
  expect(second).toBe('pending');
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
});
it('restores a pending purchase after remount and Check again never opens checkout', async () => {
  await writePendingPurchase({
    accountId: 'alice',
    productId: 'credits_30',
    startedAt: '2026-09-13T10:00:00Z',
    transactionId: 'txn-123',
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() =>
    expect(result.current.pendingPurchase?.transactionId).toBe('txn-123'),
  );
  await act(async () => {
    expect(await result.current.checkPendingPurchase()).toBe(false);
  });
  expect(result.current.pendingPurchase?.transactionId).toBe('txn-123');
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});
it('clears a canceled checkout so the next explicit purchase is possible', async () => {
  (Purchases.purchasePackage as jest.Mock).mockRejectedValue({
    userCancelled: true,
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchase(pkg)).toBe('cancelled');
  });
  expect(await readPendingPurchase('alice')).toBeNull();
});

it('binds the store to the authenticated account before purchasing after an account switch', async () => {
  mockAccountId = 'bob';
  (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
    customerInfo: { entitlements: { active: {} } },
    transaction: { transactionIdentifier: 'bob-txn' },
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    await result.current.purchase(pkg);
  });
  expect(Purchases.logIn).toHaveBeenCalledWith('bob');
  expect((await readPendingPurchase('bob'))?.transactionId).toBe('bob-txn');
  expect(await readPendingPurchase('alice')).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('recovery binds the current account before reading its store history', async () => {
  mockAccountId = 'bob';
  await writePendingPurchase({
    accountId: 'bob',
    productId: 'credits_30',
    startedAt: new Date().toISOString(),
  });
  const observed: string[] = [];
  (Purchases.getCustomerInfo as jest.Mock).mockImplementation(async () => {
    observed.push(mockSdkAccount);
    return { nonSubscriptionTransactions: [] };
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await result.current.checkPendingPurchase();
  });
  expect(observed.length).toBeGreaterThan(0);
  expect(observed.every((account) => account === 'bob')).toBe(true);
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});
it('does not adopt a same-product transaction from just before a new interrupted checkout', async () => {
  const now = Date.now();
  await writePendingPurchase({
    accountId: 'alice',
    productId: 'credits_30',
    startedAt: new Date(now).toISOString(),
    checkoutId: 'second',
    sdkTransactionBaseline: ['prior'],
  } as any);
  (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
    nonSubscriptionTransactions: [
      {
        productIdentifier: 'credits_30',
        purchaseDate: new Date(now - 1000).toISOString(),
        transactionIdentifier: 'prior',
      },
    ],
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await result.current.checkPendingPurchase();
  });
  expect((await readPendingPurchase('alice'))?.transactionId).toBeUndefined();
  expect(result.current.pendingPurchase).toMatchObject({
    checkoutId: 'second',
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});
it('a delayed previous-account check cannot replace the new account state', async () => {
  const { result } = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await result.current.checkPendingPurchase();
  });
  await writePendingPurchase({
    accountId: 'alice',
    productId: 'credits_30',
    startedAt: new Date().toISOString(),
  });
  const info = deferred<any>();
  (Purchases.getCustomerInfo as jest.Mock).mockReturnValueOnce(info.promise);
  let checking!: Promise<boolean>;
  await act(async () => {
    checking = result.current.checkPendingPurchase();
  });
  await act(async () => {
    mockAccountId = 'bob';
    mockAuthChange?.('SIGNED_IN', { user: { id: 'bob' } });
  });
  await act(async () => {
    info.resolve({ nonSubscriptionTransactions: [] });
    await checking;
  });
  expect(result.current.pendingPurchase?.accountId).not.toBe('alice');
  expect(await readPendingPurchase('alice')).not.toBeNull();
});

it('keeps SDK account binding until a deferred checkout returns, then recovers the next account', async () => {
  const store = deferred<any>(),
    opened = deferred<void>();
  (Purchases.purchasePackage as jest.Mock).mockImplementation(() => {
    opened.resolve();
    return store.promise;
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  let buying!: Promise<string>;
  await act(async () => {
    buying = result.current.purchase(pkg);
    await opened.promise;
  });
  const persisted = await readPendingPurchase('alice');
  expect(persisted?.checkoutId).toBeTruthy();
  expect(persisted?.sdkTransactionBaseline).toEqual([]);
  await writePendingPurchase({
    accountId: 'bob',
    productId: 'credits_30',
    startedAt: new Date().toISOString(),
    checkoutId: 'bob',
  });
  let checking!: Promise<boolean>;
  await act(async () => {
    mockAccountId = 'bob';
    mockAuthChange('SIGNED_IN', { user: { id: 'bob' } });
    checking = result.current.checkPendingPurchase();
  });
  expect(mockSdkAccount).toBe('alice');
  await act(async () => {
    store.resolve({
      customerInfo: { entitlements: { active: {} } },
      transaction: { transactionIdentifier: 'alice-txn' },
    });
    await buying;
    await checking;
  });
  expect(mockSdkAccount).toBe('bob');
  expect(result.current.pendingPurchase?.accountId).toBe('bob');
  expect((await readPendingPurchase('alice'))?.transactionId).toBe('alice-txn');
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
});

it.each(['storage', 'auth'])(
  'releases a checkout after a post-reservation %s read fails before SDK invocation',
  async (failure) => {
    const { result } = renderHook(useRevenueCat, { wrapper });
    await act(async () => {
      await result.current.checkPendingPurchase();
    });
    const write = AsyncStorage.setItem as jest.Mock;
    const realWrite = write.getMockImplementation()!;
    write.mockImplementationOnce(async (...args: unknown[]) => {
      await realWrite(...args);
      if (failure === 'storage')
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
          new Error('Read failed'),
        );
      else mockAuthFailure = true;
    });
    await act(async () => {
      expect(await result.current.purchase(pkg)).toBe('failed');
    });
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
    expect(await readPendingPurchase('alice')).toBeNull();
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
      transaction: { transactionIdentifier: 'retry-txn' },
    });
    await act(async () => {
      expect(await result.current.purchase(pkg)).toBe('purchased');
    });
    expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
  },
);

it('persists cleanup intent when deletion fails and resumes it after remount without opening the SDK', async () => {
  const first = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await first.result.current.checkPendingPurchase();
  });
  const write = AsyncStorage.setItem as jest.Mock;
  const realWrite = write.getMockImplementation()!;
  write.mockImplementationOnce(async (...args: unknown[]) => {
    await realWrite(...args);
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('Read failed'),
    );
  });
  (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(
    new Error('Remove failed'),
  );
  await act(async () => {
    expect(await first.result.current.purchase(pkg)).toBe('pending');
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('alice')).toMatchObject({
    checkoutPhase: 'cleanup',
  });
  first.unmount();
  const second = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    expect(await second.result.current.checkPendingPurchase()).toBe(true);
  });
  expect(await readPendingPurchase('alice')).toBeNull();
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

it('never cleans a store-started checkout whose SDK result is uncertain', async () => {
  const view = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await view.result.current.checkPendingPurchase();
  });
  (Purchases.purchasePackage as jest.Mock).mockRejectedValue(
    new Error('Connection lost after opening store'),
  );
  await act(async () => {
    expect(await view.result.current.purchase(pkg)).toBe('pending');
  });
  expect(await readPendingPurchase('alice')).toMatchObject({
    checkoutPhase: 'started',
  });
  await act(async () => {
    expect(await view.result.current.checkPendingPurchase()).toBe(false);
  });
  expect(await readPendingPurchase('alice')).not.toBeNull();
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
});

it('cleanup of an unstarted A cannot delete a newer checkout B', async () => {
  const view = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await view.result.current.checkPendingPurchase();
  });
  const newer = {
    accountId: 'alice',
    productId: 'credits_30',
    startedAt: new Date().toISOString(),
    checkoutId: 'newer-b',
    transactionId: 'b-txn',
  };
  const write = AsyncStorage.setItem as jest.Mock;
  const realWrite = write.getMockImplementation()!;
  write.mockImplementationOnce(async (...args: unknown[]) => {
    await realWrite(...args);
    void writePendingPurchase(newer);
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('Post-reservation read failed'),
    );
  });
  await act(async () => {
    expect(await view.result.current.purchase(pkg)).toBe('failed');
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('alice')).toEqual(newer);
  expect(view.result.current.pendingPurchase?.checkoutId).toBe('newer-b');
});

it('recovery waits behind the purchase before deciding a captured reservation is safe to remove', async () => {
  const view = renderHook(useRevenueCat, { wrapper });
  await act(async () => {
    await view.result.current.checkPendingPurchase();
  });
  const reservedRead = deferred<void>(),
    releaseRead = deferred<void>(),
    opened = deferred<void>(),
    store = deferred<any>();
  const write = AsyncStorage.setItem as jest.Mock;
  const realWrite = write.getMockImplementation()!;
  const realRead = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
  write.mockImplementationOnce(async (...args: unknown[]) => {
    await realWrite(...args);
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      async (...readArgs: unknown[]) => {
        reservedRead.resolve();
        await releaseRead.promise;
        return realRead(...readArgs);
      },
    );
  });
  (Purchases.purchasePackage as jest.Mock).mockImplementation(() => {
    opened.resolve();
    return store.promise;
  });
  let buying!: Promise<string>;
  let checking!: Promise<boolean>;
  await act(async () => {
    buying = view.result.current.purchase(pkg);
    await reservedRead.promise;
    checking = view.result.current.checkPendingPurchase();
    releaseRead.resolve();
    await opened.promise;
  });
  expect(await readPendingPurchase('alice')).toMatchObject({
    checkoutPhase: 'started',
  });
  await act(async () => {
    store.resolve({
      customerInfo: { entitlements: { active: {} } },
      transaction: { transactionIdentifier: 'in-flight' },
    });
    await buying;
    expect(await checking).toBe(false);
  });
  expect(await readPendingPurchase('alice')).toMatchObject({
    checkoutPhase: 'started',
    transactionId: 'in-flight',
  });
});
