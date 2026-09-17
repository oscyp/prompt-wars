import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBattleAttention } from '@/hooks/useBattleAttention';
const mockQuery = jest.fn();
let mockAccount = 'first';
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: mockAccount } }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/home' }));
jest.mock('@/utils/battleAttention', () => ({
  readBattleResults: async () => ({}),
  subscribeBattleResultRead: () => () => {},
  battleAttentionCount: (rows: unknown[]) => rows.length,
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        or: () => q,
        order: () => q,
        range: mockQuery,
      };
      return q;
    },
    channel: () => {
      const c = { on: () => c, subscribe: () => c };
      return c;
    },
    removeChannel: jest.fn(),
  },
}));
test('switching accounts clears the old badge before the new read resolves, including a failed refresh', async () => {
  mockQuery.mockResolvedValueOnce({ data: [{ id: 'first-battle' }] });
  let reject!: (reason: Error) => void;
  const pending = new Promise((_, r) => {
    reject = r;
  });
  mockQuery.mockReturnValueOnce(pending);
  const view = renderHook(() => useBattleAttention());
  await waitFor(() => expect(view.result.current).toBe(1));
  mockAccount = 'second';
  view.rerender({});
  expect(view.result.current).toBeUndefined();
  await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(2));
  await act(async () => reject(new Error('Offline')));
  expect(view.result.current).toBeUndefined();
});
