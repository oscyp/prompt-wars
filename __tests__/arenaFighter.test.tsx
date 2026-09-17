import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useArenaFighter } from '@/hooks/useArenaFighter';
const mockCharacter = jest.fn();
const mockPortrait = jest.fn();
jest.mock('@/utils/profileData', () => ({
  fetchActiveCharacter: (...a: unknown[]) => mockCharacter(...a),
  fetchSignatureItemName: async () => null,
}));
jest.mock('@/utils/characters', () => ({
  loadPortraitRef: (...a: unknown[]) => mockPortrait(...a),
}));
const row = {
  id: 'fighter-a',
  name: 'Mira',
  portrait_id: 'art-a',
  avatar_portrait_id: 'avatar-a',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockCharacter.mockResolvedValue(row);
  mockPortrait.mockImplementation(async (id) => ({ url: `signed-${id}` }));
});
test('retains known artwork after a failed refresh and retries signing without replacing identity', async () => {
  const { result } = renderHook(() => useArenaFighter('a'));
  await act(async () => result.current.refresh());
  expect(result.current.fighter?.renderUri).toBe('signed-art-a');
  mockPortrait.mockResolvedValue({url:null,appearanceVersion:null,snapshot:null});
  await act(async () => result.current.refresh());
  expect(result.current.fighter?.renderUri).toBe('signed-art-a');
  expect(result.current.error).toBe(true);
  mockCharacter.mockResolvedValue(null);
  await act(async () => result.current.refresh());
  expect(result.current.fighter?.character.name).toBe('Mira');
});
test('a new account never sees the former fighter, including a late completion', async () => {
  let resolve: (v: unknown) => void;
  mockCharacter.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { result, rerender } = renderHook<
    ReturnType<typeof useArenaFighter>,
    { id: string }
  >(({ id }) => useArenaFighter(id), { initialProps: { id: 'a' } });
  let pending: Promise<void>;
  act(() => {
    pending = result.current.refresh();
  });
  rerender({ id: 'b' });
  expect(result.current.fighter).toBeNull();
  await act(async () => {
    resolve!(row);
    await pending;
  });
  expect(result.current.fighter).toBeNull();
  mockCharacter.mockResolvedValue({ ...row, id: 'fighter-b', name: 'B' });
  await act(async () => result.current.refresh());
  await waitFor(() => expect(result.current.fighter?.character.name).toBe('B'));
});
