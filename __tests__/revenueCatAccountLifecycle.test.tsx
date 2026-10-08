import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import {
  RevenueCatProvider,
  useRevenueCat,
} from '@/providers/RevenueCatProvider';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-purchases', () => {
  // Set public fixture keys before the importing provider captures build config.
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_lifecycle_fixture';
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_lifecycle_fixture';
  return {
    __esModule: true,
    default: {
      getAppUserID: jest.fn(async () => {
        if (!mockSdkAccount) throw new Error('SDK not configured');
        return mockSdkAccount;
      }),
      configure: jest.fn(({ appUserID }: { appUserID: string }) => {
        mockSdkAccount = appUserID;
      }),
      logIn: jest.fn(async (id: string) => {
        mockSdkAccount = id;
      }),
      setLogLevel: jest.fn(),
      getOfferings: jest.fn(),
      getCustomerInfo: jest.fn(async () => ({
        originalAppUserId: mockSdkAccount,
        entitlements: { active: {} },
        nonSubscriptionTransactions: [],
      })),
    },
    LOG_LEVEL: { DEBUG: 'DEBUG' },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'cancelled' },
  };
});
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: mockUser } })),
      onAuthStateChange: (callback: typeof mockAuthChange) => {
        mockAuthChange = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
jest.mock('@/utils/walletRecovery', () => ({
  readPendingPurchase: jest.fn(async () => null),
}));
jest.mock('@/utils/guestAccount', () => ({ confirmGuestPurchase: jest.fn() }));
jest.mock('@/utils/registration', () => ({ getAccountEligibility: jest.fn() }));

let mockUser: { id: string } | null = null;
let mockSdkAccount: string | null = null;
let mockAuthChange: (
  event: string,
  session: { user: { id: string } } | null,
) => void;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RevenueCatProvider>{children}</RevenueCatProvider>
);
const offering = (id: string) => ({
  current: { identifier: id, availablePackages: [] },
  all: {},
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function auth(id: string | null, event = id ? 'SIGNED_IN' : 'SIGNED_OUT') {
  mockUser = id ? { id } : null;
  mockAuthChange(event, mockUser ? { user: mockUser } : null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockSdkAccount = null;
  (Purchases.getOfferings as jest.Mock)
    .mockReset()
    .mockImplementation(async () => offering(mockSdkAccount!));
});

it('loads offerings and binds SDK after fresh signed-out startup signs in without a pending checkout', async () => {
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(Purchases.configure).not.toHaveBeenCalled();
  await act(async () => auth('new-player'));
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('new-player'),
  );
  expect(Purchases.configure).toHaveBeenCalledWith({
    apiKey: expect.any(String),
    appUserID: 'new-player',
  });
  expect(result.current.customerInfo?.originalAppUserId).toBe('new-player');
  expect(result.current.isLoading).toBe(false);
  const loads = (Purchases.getOfferings as jest.Mock).mock.calls.length;
  await act(async () => auth('new-player', 'TOKEN_REFRESHED'));
  expect(Purchases.getOfferings).toHaveBeenCalledTimes(loads);
});

it('clears the previous account store and loads the new account without remounting', async () => {
  mockUser = { id: 'alice' };
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('alice'),
  );
  const bob = deferred<ReturnType<typeof offering>>();
  (Purchases.getOfferings as jest.Mock).mockImplementationOnce(
    () => bob.promise,
  );
  await act(async () => auth('bob'));
  await waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith('bob'));
  expect(result.current.offerings).toBeNull();
  expect(result.current.customerInfo).toBeNull();
  expect(result.current.isLoading).toBe(true);
  await act(async () => bob.resolve(offering('bob')));
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('bob'),
  );
  expect(result.current.customerInfo?.originalAppUserId).toBe('bob');
});

it('a delayed prior-account load cannot publish data or finish the current account loading state', async () => {
  mockUser = { id: 'alice' };
  const alice = deferred<ReturnType<typeof offering>>();
  const bob = deferred<ReturnType<typeof offering>>();
  (Purchases.getOfferings as jest.Mock)
    .mockImplementationOnce(() => alice.promise)
    .mockImplementationOnce(() => bob.promise);
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(1));
  await act(async () => auth('bob'));
  await act(async () => alice.resolve(offering('alice')));
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(2));
  expect(result.current.offerings).toBeNull();
  expect(result.current.customerInfo).toBeNull();
  expect(result.current.isLoading).toBe(true);
  await act(async () => bob.resolve(offering('bob')));
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('bob'),
  );
  expect(result.current.isLoading).toBe(false);
});

it('sign-out fences a delayed store result and clears catalog, customer and loading state', async () => {
  mockUser = { id: 'alice' };
  const alice = deferred<ReturnType<typeof offering>>();
  (Purchases.getOfferings as jest.Mock).mockImplementationOnce(
    () => alice.promise,
  );
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(1));
  await act(async () => auth(null));
  await act(async () => alice.resolve(offering('alice')));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.offerings).toBeNull();
  expect(result.current.customerInfo).toBeNull();
  expect(result.current.error).toBeNull();
});

it('an old account load failure cannot publish an error or stop the next account loading', async () => {
  mockUser = { id: 'alice' };
  const alice = deferred<ReturnType<typeof offering>>();
  const bob = deferred<ReturnType<typeof offering>>();
  (Purchases.getOfferings as jest.Mock)
    .mockImplementationOnce(() => alice.promise)
    .mockImplementationOnce(() => bob.promise);
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(1));
  await act(async () => auth('bob'));
  await act(async () => alice.reject(new Error('Alice store request failed')));
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(2));
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(true);
  await act(async () => bob.resolve(offering('bob')));
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('bob'),
  );
});

it('sign-out and back into the same account cannot reuse an obsolete in-flight catalog', async () => {
  mockUser = { id: 'alice' };
  const old = deferred<ReturnType<typeof offering>>();
  (Purchases.getOfferings as jest.Mock).mockImplementationOnce(
    () => old.promise,
  );
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalledTimes(1));
  await act(async () => {
    auth(null);
    auth('alice');
  });
  await act(async () => old.resolve(offering('obsolete-alice')));
  await waitFor(() =>
    expect(result.current.offerings?.current?.identifier).toBe('alice'),
  );
  expect(Purchases.getOfferings).toHaveBeenCalledTimes(2);
});
