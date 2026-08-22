import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCredits } from '@/hooks/useCredits';
import { getWalletBalance } from '@/utils/monetization';

jest.mock('@/utils/monetization', () => ({
  getWalletBalance: jest.fn(),
}));

const mockedGetWalletBalance = getWalletBalance as jest.MockedFunction<
  typeof getWalletBalance
>;

function balance(credits: number) {
  return {
    credits_balance: credits,
    is_subscriber: false,
    monthly_video_allowance_remaining: 0,
    priority_queue: false,
    cosmetic_unlocks: [],
  };
}

describe('useCredits', () => {
  beforeEach(() => {
    mockedGetWalletBalance.mockReset();
  });

  it('loads the balance on mount', async () => {
    mockedGetWalletBalance.mockResolvedValue(balance(12));
    const { result } = renderHook(() => useCredits());
    await waitFor(() => expect(result.current.credits).toBe(12));
    expect(result.current.loading).toBe(false);
  });

  it('defaults to 0 when there is no wallet', async () => {
    mockedGetWalletBalance.mockResolvedValue(null);
    const { result } = renderHook(() => useCredits());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.credits).toBe(0);
  });

  it('re-reads the balance on refresh()', async () => {
    mockedGetWalletBalance.mockResolvedValue(balance(5));
    const { result } = renderHook(() => useCredits());
    await waitFor(() => expect(result.current.credits).toBe(5));

    mockedGetWalletBalance.mockResolvedValue(balance(3));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.credits).toBe(3);
  });
});
