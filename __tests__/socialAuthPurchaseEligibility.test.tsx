import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  RevenueCatProvider,
  useRevenueCat,
} from '@/providers/RevenueCatProvider';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import { readPendingPurchase } from '@/utils/walletRecovery';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getAppUserID: jest.fn(async () => 'player-a'),
    purchasePackage: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({
      nonSubscriptionTransactions: [],
      entitlements: { active: {} },
    })),
    restorePurchases: jest.fn(),
  },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'cancelled' },
}));
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: {
          user: { id: 'player-a', user_metadata: { age_confirmed: true } },
        },
      })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe() {} } },
      })),
    },
  },
}));
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RevenueCatProvider>{children}</RevenueCatProvider>
);
const pkg = {
  identifier: 'pack',
  product: { identifier: 'credits_30' },
} as any;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'player-a' } },
  });
  await AsyncStorage.clear();
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    enabled: true,
    status: 'revoked',
    can_purchase: false,
  });
  (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
    customerInfo: { entitlements: { active: {} } },
    transaction: { transactionIdentifier: 'transaction-a' },
  });
  (Purchases.restorePurchases as jest.Mock).mockResolvedValue({
    entitlements: { active: {} },
    allPurchasedProductIdentifiers: ['credits_30'],
  });
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
});

it('blocks new checkout on server purchase restrictions despite client age metadata', async () => {
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchase(pkg)).toBe('failed');
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('player-a')).toBeNull();
});

it('fails closed when fresh purchase eligibility cannot be fetched', async () => {
  (invokeAuthenticatedFunction as jest.Mock).mockRejectedValue(
    new Error('offline'),
  );
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchasePackage(pkg)).toBe(false);
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

it('retains a completed provider transaction after an eligible checkout', async () => {
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    enabled: true,
    status: 'eligible',
    can_purchase: true,
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchase(pkg)).toBe('purchased');
  });
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith('eligibility', {
    action: 'status',
  });
  expect(await readPendingPurchase('player-a')).toMatchObject({
    transactionId: 'transaction-a',
  });
});

it('keeps restore available while new purchases are restricted', async () => {
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.restorePurchases()).toBe('restored');
  });
  expect(Purchases.restorePurchases).toHaveBeenCalledTimes(1);
  expect(invokeAuthenticatedFunction).not.toHaveBeenCalled();
});

it('allows a guest to buy after the recovery notice with the same store account', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'player-a', is_anonymous: true } },
  });
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    can_purchase: true,
  });
  const notice = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Continue as guest')?.onPress?.();
    });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchase(pkg)).toBe('purchased');
  });
  expect(notice).toHaveBeenCalledTimes(1);
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
  expect(await readPendingPurchase('player-a')).toMatchObject({
    accountId: 'player-a',
    transactionId: 'transaction-a',
  });
});

it('choosing to secure a guest opens account settings without starting checkout', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'player-a', is_anonymous: true } },
  });
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    can_purchase: true,
  });
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === 'Secure progress')?.onPress?.();
  });
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    expect(await result.current.purchase(pkg)).toBe('cancelled');
  });
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(profile)/settings',
    params: { secure: '1' },
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('player-a')).toBeNull();
});

it('a guest warning cannot authorize checkout after switching to another account', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'player-a', is_anonymous: true } },
  });
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    can_purchase: true,
  });
  const notice = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { result } = renderHook(useRevenueCat, { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  let pending!: ReturnType<typeof result.current.purchase>;
  act(() => {
    pending = result.current.purchase(pkg);
  });
  await waitFor(() => expect(notice).toHaveBeenCalled());
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'player-b' } },
  });
  await act(async () => {
    notice.mock.calls[0][2]
      ?.find((b) => b.text === 'Continue as guest')
      ?.onPress?.();
    expect(await pending).toBe('cancelled');
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('player-b')).toBeNull();
});
