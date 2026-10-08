import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import WalletScreen from '@/app/(profile)/wallet';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import {
  getCinematicCapabilities,
  getWalletBalanceResult,
} from '@/utils/monetization';

jest.mock('@/providers/RevenueCatProvider', () => ({
  useRevenueCat: jest.fn(),
}));
jest.mock('@/utils/monetization', () => ({
  getWalletBalanceResult: jest.fn(),
  getCinematicCapabilities: jest.fn(),
}));
jest.mock('@/utils/walletRecovery', () => ({
  readWalletLedger: jest.fn(async () => []),
}));
jest.mock('@/utils/creditUses', () => ({
  ...jest.requireActual('@/utils/creditUses'),
  fetchCreditPrices: jest.fn(async () => null),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));

const packageFor = (identifier: string, priceString: string) => ({
  identifier,
  product: { identifier, priceString },
});
const monthly = packageFor('promptwars_plus_monthly:monthly', '45,99 zł');
const annual = packageFor('promptwars_plus_annual:annual', '279,99 zł');
const purchase = jest.fn(async () => 'cancelled');

beforeEach(() => {
  jest.clearAllMocks();
  (getCinematicCapabilities as jest.Mock).mockResolvedValue({
    enabled: false,
    plus_duration_seconds: 20,
  });
  (getWalletBalanceResult as jest.Mock).mockResolvedValue({
    ok: true,
    balance: { credits_balance: 12, is_subscriber: false },
  });
  (useRevenueCat as jest.Mock).mockReturnValue({
    offerings: { current: { availablePackages: [annual, monthly] } },
    pendingPurchase: null,
    checkPendingPurchase: jest.fn(async () => true),
    customerInfo: null,
    purchase,
    restorePurchases: jest.fn(async () => 'nothing'),
    isLoading: false,
  });
});

it('advertises longer cinematics on the purchase surface only when the server enables them', async () => {
  const disabled = render(<WalletScreen />);
  await disabled.findByText('Recent Transactions');
  expect(disabled.queryByText(/Longer, 20-second cinematics/)).toBeNull();
  disabled.unmount();
  (getCinematicCapabilities as jest.Mock).mockResolvedValue({
    enabled: true,
    plus_duration_seconds: 20,
  });
  const enabled = render(<WalletScreen />);
  await enabled.findByText(/Longer, 20-second cinematics/);
});

it('shows the enabled longer cinematic benefit to active subscribers', async () => {
  (getWalletBalanceResult as jest.Mock).mockResolvedValue({
    ok: true,
    balance: {
      credits_balance: 12,
      is_subscriber: true,
      monthly_video_allowance_remaining: 4,
    },
  });
  (getCinematicCapabilities as jest.Mock).mockResolvedValue({
    enabled: true,
    plus_duration_seconds: 20,
  });
  const view = render(<WalletScreen />);
  await view.findByText('Longer, 20-second cinematics');
});

it('offers both Android plans at store prices and purchases the full selected identifier', async () => {
  const view = render(<WalletScreen />);
  const monthlyButton = await view.findByRole('button', {
    name: 'Subscribe to Prompt Wars+ for 45,99 zł a month',
  });
  const annualButton = view.getByRole('button', {
    name: 'Subscribe to Prompt Wars+ for 279,99 zł a year',
  });
  expect(monthlyButton).toBeEnabled();
  expect(annualButton).toBeEnabled();
  view.getByText(/Renews automatically at 279,99 zł\/year/);
  view.getByText(/Renews automatically at 45,99 zł\/month/);
  await act(async () => fireEvent.press(annualButton));
  expect(purchase).toHaveBeenLastCalledWith(annual);
  await act(async () => fireEvent.press(monthlyButton));
  expect(purchase).toHaveBeenLastCalledWith(monthly);
});

it.each([
  ['promptwars_plus_monthly', '45,99 zł', 'month'],
  ['promptwars_plus_annual', '279,99 zł', 'year'],
  ['promptwars_plus_monthly:monthly-standard', '45,99 zł', 'month'],
])(
  'keeps a single-plan offering purchasable: %s',
  async (id, price, period) => {
    const pkg = packageFor(id, price);
    (useRevenueCat as jest.Mock).mockReturnValue({
      ...(useRevenueCat as jest.Mock)(),
      offerings: { current: { availablePackages: [pkg] } },
    });
    const view = render(<WalletScreen />);
    const button = await view.findByRole('button', {
      name: `Subscribe to Prompt Wars+ for ${price} a ${period}`,
    });
    await act(async () => fireEvent.press(button));
    expect(purchase).toHaveBeenCalledWith(pkg);
    expect(
      view.getAllByRole('button', { name: /Subscribe to Prompt Wars\+/ }),
    ).toHaveLength(1);
  },
);

it('does not offer unknown products or malformed base-plan suffixes as Plus', async () => {
  const ids = [
    'promptwars_plus_lifetime',
    'promptwars_plus_monthly_fake',
    'promptwars_plus_monthly:',
    'promptwars_plus_monthly:monthly:offer',
    'promptwars_plus_annual:Annual',
    'promptwars_plus_annual:-annual',
    'credits_30:monthly',
  ];
  (useRevenueCat as jest.Mock).mockReturnValue({
    ...(useRevenueCat as jest.Mock)(),
    offerings: {
      current: {
        availablePackages: ids.map((id) => packageFor(id, 'BAD PRICE')),
      },
    },
  });
  const view = render(<WalletScreen />);
  expect(
    await view.findByRole('button', {
      name: 'Subscribe to Prompt Wars+, unavailable right now',
    }),
  ).toBeDisabled();
  expect(view.queryByText(/BAD PRICE/)).toBeNull();
});

it('prevents either subscription checkout while another purchase is pending', async () => {
  (useRevenueCat as jest.Mock).mockReturnValue({
    ...(useRevenueCat as jest.Mock)(),
    pendingPurchase: { productId: 'credits_30', transactionId: 'pending' },
  });
  const view = render(<WalletScreen />);
  await view.findByText('Recent Transactions');
  const buttons = view.getAllByRole('button', {
    name: /Subscribe to Prompt Wars\+/,
  });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button).toBeDisabled();
    fireEvent.press(button);
  }
  expect(purchase).not.toHaveBeenCalled();
});
