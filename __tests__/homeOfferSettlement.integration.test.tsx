import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';
import HomeFirstTimeOffer from '@/components/HomeFirstTimeOffer';
import {
  readPendingPurchase,
  writePendingPurchase,
} from '@/utils/walletRecovery';
import type { FirstTimeOffer } from '@/utils/dailyMeta';

let mockGranted = false;
let mockAuthFault: 'null' | 'throw' | null = null;
let mockAccountId = 'alice';
let mockAuthChange: any;
const mockPackage = {
  identifier: 'offer',
  product: { identifier: 'ftuo_starter_legend', priceString: '$1.99' },
};
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('react-native-purchases', () => {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'test';
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'test';
  return {
    __esModule: true,
    default: {
      getAppUserID: jest.fn(async () => mockAccountId),
      getOfferings: jest.fn(async () => ({
        current: { availablePackages: [mockPackage] },
        all: {},
      })),
      getCustomerInfo: jest.fn(async () => ({
        nonSubscriptionTransactions: [],
        entitlements: { active: {} },
      })),
      purchasePackage: jest.fn(),
    },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'cancelled' },
  };
});
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => {
        const fault = mockAuthFault;
        mockAuthFault = null;
        if (fault === 'throw') throw new Error('auth unavailable');
        return {
          data: { user: fault === 'null' ? null : { id: mockAccountId } },
        };
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
        gt: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: mockGranted
            ? { id: 'purchase', revenuecat_transaction_id: 'txn' }
            : null,
          error: null,
        }),
        then: (resolve: any) =>
          Promise.resolve({
            data: mockGranted ? [{ id: 'grant' }] : [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
  },
}));
const offer: FirstTimeOffer = {
  eligible: true,
  reason: 'active',
  expires_at: '2099-01-01',
  offer: {
    slug: 'starter',
    title: 'Starter',
    description: 'Credits',
    product_id: 'ftuo_starter_legend',
    credits: 10,
    exclusive_cosmetic_slug: null,
    price_usd: 2,
    reference_price_usd: 4,
  },
};
const pending = {
  accountId: 'alice',
  productId: 'ftuo_starter_legend',
  startedAt: '2026-09-13T10:00:00Z',
  transactionId: 'txn',
  checkoutId: 'checkout',
};
const screen = (settled: () => Promise<void>, state = offer) => (
  <RevenueCatProvider>
    <HomeFirstTimeOffer
      key={mockAccountId}
      state={state}
      onSettled={settled}
      onDismiss={jest.fn()}
    />
  </RevenueCatProvider>
);
beforeEach(async () => {
  mockGranted = false;
  mockAuthFault = null;
  mockAccountId = 'alice';
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
afterEach(() => jest.restoreAllMocks());

test('foreground verification in the real provider refreshes visible Home and never reopens the stale offer', async () => {
  let foreground: (state: AppStateStatus) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      foreground = callback;
      return { remove() {} };
    });
  await writePendingPurchase(pending);
  let finishRefresh!: () => void;
  const settled = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const view = render(screen(settled));
  await waitFor(() => expect(view.getByText('Check again')).toBeTruthy());
  expect(settled).not.toHaveBeenCalled();
  await act(async () => {
    mockGranted = true;
    foreground('active');
  });
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  expect(await readPendingPurchase('alice')).toBeNull();
  expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
  await act(async () => finishRefresh());
  view.rerender(screen(settled)); // Server props can still be stale after refresh.
  expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  await act(async () => {
    foreground('active');
  });
  expect(settled).toHaveBeenCalledTimes(1);
});

test('cold pending recovery publishes verified fulfillment without a Home check tap', async () => {
  await writePendingPurchase(pending);
  mockGranted = true;
  const settled = jest.fn(async () => {});
  const view = render(screen(settled));
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(await readPendingPurchase('alice')).toBeNull();
});

test('cold unstarted cleanup emits no grant and leaves an eligible offer available', async () => {
  await writePendingPurchase({
    ...pending,
    transactionId: undefined,
    checkoutPhase: 'cleanup',
  } as any);
  const settled = jest.fn(async () => {});
  const view = render(screen(settled));
  await waitFor(async () =>
    expect(await readPendingPurchase('alice')).toBeNull(),
  );
  expect(settled).not.toHaveBeenCalled();
  expect(
    view.getByLabelText('Claim one-time offer').props.accessibilityState
      .disabled,
  ).toBe(false);
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

test('a canceled SDK purchase leaves the offer eligible and never emits fulfillment', async () => {
  (Purchases.purchasePackage as jest.Mock).mockRejectedValueOnce({
    userCancelled: true,
  });
  const settled = jest.fn(async () => {});
  const view = render(screen(settled));
  await waitFor(() => expect(view.getByText('$1.99')).toBeTruthy());
  await act(async () =>
    fireEvent.press(view.getByLabelText('Claim one-time offer')),
  );
  expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  expect(await readPendingPurchase('alice')).toBeNull();
  expect(
    view.getByLabelText('Claim one-time offer').props.accessibilityState
      .disabled,
  ).toBe(false);
});

test('verified account A event cannot hide account B offer', async () => {
  await writePendingPurchase(pending);
  mockGranted = true;
  const settled = jest.fn(async () => {});
  const view = render(screen(settled));
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  await act(async () => {
    mockAccountId = 'bob';
    mockAuthChange('SIGNED_IN', { user: { id: 'bob' } });
  });
  await act(async () => view.rerender(screen(settled)));
  expect(view.getByLabelText('Claim one-time offer')).toBeTruthy();
  expect(settled).toHaveBeenCalledTimes(1);
});

test.each(['null', 'throw'] as const)(
  'verified settlement still reaches Home if the next auth read returns %s after durable removal',
  async (fault) => {
    await writePendingPurchase(pending);
    const settled = jest.fn(async () => {});
    const view = render(screen(settled, { ...offer, expires_at: undefined }));
    await waitFor(() => expect(view.getByText('Check again')).toBeTruthy());
    const remove = (
      AsyncStorage.removeItem as jest.Mock
    ).getMockImplementation()!;
    (AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(
      async (key) => {
        await remove(key);
        mockAuthFault = fault;
      },
    );
    mockGranted = true;
    await act(async () => fireEvent.press(view.getByText('Check again')));
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(await readPendingPurchase('alice')).toBeNull();
    expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
    view.rerender(screen(settled, { ...offer, expires_at: undefined }));
    expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  },
);

test('an account switch during durable settlement cannot publish the old account event to Home', async () => {
  await writePendingPurchase(pending);
  const settled = jest.fn(async () => {});
  const view = render(screen(settled));
  await waitFor(() => expect(view.getByText('Check again')).toBeTruthy());
  const remove = (
    AsyncStorage.removeItem as jest.Mock
  ).getMockImplementation()!;
  (AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(async (key) => {
    await remove(key);
    mockAccountId = 'bob';
    mockAuthChange('SIGNED_IN', { user: { id: 'bob' } });
  });
  mockGranted = true;
  await act(async () => fireEvent.press(view.getByText('Check again')));
  await act(async () => view.rerender(screen(settled)));
  expect(await readPendingPurchase('alice')).toBeNull();
  expect(settled).not.toHaveBeenCalled();
  expect(
    view.getByLabelText('Claim one-time offer').props.accessibilityState
      .disabled,
  ).toBe(false);
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
