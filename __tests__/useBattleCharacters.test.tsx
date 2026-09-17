import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { invokeFunctionResult } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
jest.mock('@/utils/supabase', () => ({ invokeFunctionResult: jest.fn() }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: jest.fn() }));
const invoke = invokeFunctionResult as jest.Mock;
const auth = useAuth as jest.Mock;
const side = (name: string, url: string) => ({
  name,
  archetype: 'mystic',
  signature_color: '#123456',
  portrait_url: url,
  fighter_url: null,
  cosmetics: null,
});
beforeEach(() => {
  invoke.mockReset();
  auth.mockReturnValue({ user: { id: 'account-a' } });
});
it('signing refresh changes assets without reading mutable character rows', async () => {
  invoke.mockResolvedValue({
    data: {
      player_one: side('Frozen', 'first'),
      player_two: side('Rival', 'second'),
    },
    error: null,
  });
  const { result } = renderHook(() =>
    useBattleCharacters('snapshot-refresh', { player_one_character_id: 'c1' }),
  );
  await waitFor(() => expect(result.current.p1?.name).toBe('Frozen'));
  invoke.mockResolvedValue({
    data: {
      player_one: side('Frozen', 'renewed'),
      player_two: side('Rival', 'second'),
    },
    error: null,
  });
  act(() => result.current.refreshPortraits());
  await waitFor(() => expect(result.current.p1?.portraitUrl).toBe('renewed'));
  expect(result.current.p1?.name).toBe('Frozen');
});
it('late response and cached asset from another account/battle cannot bleed across', async () => {
  invoke.mockResolvedValueOnce({
    data: { player_one: side('First battle', 'secret'), player_two: null },
    error: null,
  });
  const { result, rerender } = renderHook<
    ReturnType<typeof useBattleCharacters>,
    { id: string }
  >(({ id }) => useBattleCharacters(id, null), {
    initialProps: { id: 'cache-first' },
  });
  await waitFor(() => expect(result.current.p1?.name).toBe('First battle'));
  let resolve!: (value: unknown) => void;
  invoke.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  rerender({ id: 'cache-second' });
  expect(result.current.p1).toBeNull();
  auth.mockReturnValue({ user: { id: 'account-b' } });
  invoke.mockResolvedValueOnce({
    data: { player_one: side('Second account', 'own'), player_two: null },
    error: null,
  });
  rerender({ id: 'cache-first' });
  await waitFor(() => expect(result.current.p1?.name).toBe('Second account'));
  await act(async () =>
    resolve({
      data: { player_one: side('Late first account', 'old'), player_two: null },
      error: null,
    }),
  );
  expect(result.current.p1?.name).toBe('Second account');
});
