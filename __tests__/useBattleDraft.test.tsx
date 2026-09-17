import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBattleDraft } from '@/hooks/useBattleDraft';
const rows = new Map<string, string>();
beforeEach(() => {
  rows.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key) => rows.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key) => {
    rows.delete(key);
  });
});
const value = {
  text: 'A deliberate prompt that survives a failed submission',
  move: 'attack' as const,
  editMode: true,
  selectedSuggestion: null,
};
it('unmount/remount preserves an unlocked prompt and confirmed lock clears it', async () => {
  const first = renderHook(() => useBattleDraft('account', 'battle', 1));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => first.result.current.save(value));
  first.unmount(); // A failed submission never clears the local draft.
  const second = renderHook(() => useBattleDraft('account', 'battle', 1));
  await waitFor(() => expect(second.result.current.draft).toEqual(value));
  await act(async () => second.result.current.clear());
  await act(async () => second.result.current.save(value)); // late editor effect after lock
  second.unmount();
  const third = renderHook(() => useBattleDraft('account', 'battle', 1));
  await waitFor(() => expect(third.result.current.ready).toBe(true));
  expect(third.result.current.draft).toBeNull();
});
it('explicit discard permits a new draft and failed saves remain retryable', async () => {
  const { result } = renderHook(() => useBattleDraft('account', 'battle', 1));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => result.current.save(value));
  await act(async () => result.current.clear(false));
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('Disk full'),
  );
  await act(async () => result.current.save({ ...value, text: 'New draft' }));
  expect(result.current.error).toContain('not saved');
  await act(async () => result.current.flush());
  expect(result.current.error).toBeNull();
  expect(Array.from(rows.values())[0]).toContain('New draft');
});

it.each([true, false])(
  'Retry repeats a failed deletion (terminal=%s) and remount cannot resurrect it',
  async (terminal) => {
    const first = renderHook(() =>
      useBattleDraft('delete-account', 'delete-battle', 1),
    );
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(async () => first.result.current.save(value));
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(
      new Error('Disk unavailable'),
    );
    await act(async () => first.result.current.clear(terminal));
    expect(first.result.current.error).toContain('remove');
    await act(async () => first.result.current.retry());
    await waitFor(() => expect(first.result.current.error).toBeNull());
    expect(rows.size).toBe(0);
    first.unmount();
    const second = renderHook(() =>
      useBattleDraft('delete-account', 'delete-battle', 1),
    );
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft).toBeNull();
  },
);

it('switching move and authoring mode keeps writing across restoration', async () => {
  const first = renderHook(() => useBattleDraft('writer', 'battle', 2));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => first.result.current.save(value));
  const switched = { ...value, move: 'defense' as const, editMode: false };
  await act(async () => first.result.current.save(switched));
  await act(async () => first.result.current.flush());
  first.unmount();
  const restored = renderHook(() => useBattleDraft('writer', 'battle', 2));
  await waitFor(() => expect(restored.result.current.draft).toEqual(switched));
});
