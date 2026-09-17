import { AccessibilityInfo, Modal, type View } from 'react-native';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeFirstTimeOffer from '@/components/HomeFirstTimeOffer';
import type { FirstTimeOffer } from '@/utils/dailyMeta';
const mockPurchase = jest.fn();
const mockCheck = jest.fn();
let mockFulfilled: { productId: string; checkoutId: string } | null = null;
let mockPending: { productId: string } | null = null;
const mockPackage = {
  identifier: 'offer',
  offeringIdentifier: 'default',
  product: {
    identifier: 'ftuo_starter_legend',
    priceString: '9,99 zł',
    currencyCode: 'PLN',
  },
};
jest.mock('@/providers/RevenueCatProvider', () => ({
  useRevenueCat: () => ({
    offerings: { current: { availablePackages: [mockPackage] }, all: {} },
    purchasePackage: mockPurchase,
    checkPendingPurchase: mockCheck,
    pendingPurchase: mockPending,
    fulfilledPurchase: mockFulfilled,
  }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
const offer: FirstTimeOffer = {
  eligible: true,
  reason: 'active',
  expires_at: '2099-01-01',
  offer: {
    slug: 'starter',
    title: 'Starter offer',
    description: 'Credits and cosmetic',
    product_id: 'ftuo_starter_legend',
    credits: 10,
    exclusive_cosmetic_slug: null,
    price_usd: 2,
    reference_price_usd: 4,
  },
};
beforeEach(() => {
  jest.clearAllMocks();
  mockPending = null;
  mockFulfilled = null;
});
test('pending purchase disables a second purchase; Check again only verifies and refreshes after the grant', async () => {
  mockPending = { productId: 'ftuo_starter_legend' };
  mockCheck.mockResolvedValueOnce(false).mockImplementationOnce(async () => {
    mockPending = null;
    mockFulfilled = {
      productId: 'ftuo_starter_legend',
      checkoutId: 'verified',
    };
    return true;
  });
  const settled = jest.fn(async () => {});
  const view = render(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  fireEvent.press(view.getByLabelText('Claim one-time offer'));
  expect(mockPurchase).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(view.getByText('Check again')));
  expect(mockCheck).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(view.getByText('Check again')));
  view.rerender(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  expect(mockCheck).toHaveBeenCalledTimes(2);
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(settled).toHaveBeenCalledTimes(1);
  expect(view.queryByText('Check again')).toBeNull();
});
test('an expired server offer without metadata still exposes the existing transaction check after relaunch', async () => {
  mockPending = { productId: 'ftuo_starter_legend' };
  mockCheck.mockImplementationOnce(async () => {
    mockPending = null;
    mockFulfilled = { productId: 'ftuo_starter_legend', checkoutId: 'cold' };
    return true;
  });
  const settled = jest.fn(async () => {});
  const view = render(
    <HomeFirstTimeOffer
      state={{ eligible: false, reason: 'expired' }}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  expect(
    view.getByText(/one-time offer purchase is still processing/),
  ).toBeTruthy();
  await act(async () => fireEvent.press(view.getByText('Check again')));
  expect(mockPurchase).not.toHaveBeenCalled();
  view.rerender(
    <HomeFirstTimeOffer
      state={{ eligible: false, reason: 'expired' }}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  expect(settled).toHaveBeenCalledTimes(1);
});
test('SDK completion alone keeps the offer awaiting verification and does not dismiss it', async () => {
  mockPurchase.mockResolvedValue(true);
  mockCheck.mockResolvedValue(false);
  const settled = jest.fn(async () => {});
  const dismiss = jest.fn();
  const view = render(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={dismiss}
    />,
  );
  expect(view.getByText('9,99 zł')).toBeTruthy();
  await act(async () =>
    fireEvent.press(view.getByLabelText('Claim one-time offer')),
  );
  expect(mockPurchase).toHaveBeenCalledWith(mockPackage);
  expect(mockCheck).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  expect(dismiss).not.toHaveBeenCalled();
});

test('provider-originated verification hides stale eligible offer and refreshes once without another purchase', async () => {
  mockPending = { productId: 'ftuo_starter_legend' };
  const settled = jest.fn(async () => {});
  const view = render(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  mockPending = null;
  mockFulfilled = {
    productId: 'ftuo_starter_legend',
    checkoutId: 'foreground',
  };
  view.rerender(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  expect(view.queryByLabelText('Claim one-time offer')).toBeNull();
  view.rerender(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  expect(settled).toHaveBeenCalledTimes(1);
  expect(mockPurchase).not.toHaveBeenCalled();
});

test('cleanup or cancellation without fulfillment preserves an eligible offer', async () => {
  mockPending = { productId: 'ftuo_starter_legend' };
  mockCheck.mockResolvedValue(true);
  const settled = jest.fn(async () => {});
  const view = render(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  await act(async () => fireEvent.press(view.getByText('Check again')));
  mockPending = null;
  view.rerender(
    <HomeFirstTimeOffer
      state={offer}
      onSettled={settled}
      onDismiss={jest.fn()}
    />,
  );
  expect(settled).not.toHaveBeenCalled();
  expect(
    view.getByLabelText('Claim one-time offer').props.accessibilityState
      .disabled,
  ).toBe(false);
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('returns focus after dismissal even when the offer row disappears', () => {
  const focus = jest
    .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const shared = {
    onSettled: async () => {},
    onDismiss: () => {},
    returnFocusRef: { current: 42 as unknown as View },
  };
  const view = render(<HomeFirstTimeOffer {...shared} state={offer} />);
  const modal = view.UNSAFE_getByType(Modal);
  act(() => modal.props.onShow());
  focus.mockClear();
  view.rerender(<HomeFirstTimeOffer {...shared} state={null} />);
  expect(view.queryByText('Starter offer')).toBeNull();
  act(() => modal.props.onDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(42);
  expect(mockPurchase).not.toHaveBeenCalled();
  focus.mockRestore();
});
