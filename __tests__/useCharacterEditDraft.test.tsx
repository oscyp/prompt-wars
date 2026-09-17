import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { useCharacterEditDraft } from '@/hooks/useCharacterEditDraft';
import type { EditPricing } from '@/utils/editCooldowns';

const character = {
  name: 'Original',
  archetype: 'strategist',
  battle_cry: 'Ready',
  signature_color: '#3B82F6',
  art_style: 'painterly',
  portrait_prompt_raw: null,
  palette_key: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'calm',
  signature_item_id: 'item-1',
};
const pricing: EditPricing = { prices: {}, cooldownMs: {} };
const options = { accountId: 'account', characterId: 'fighter' };
const rows = new Map<string, string>();
let background: ((state: AppStateStatus) => void) | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  rows.clear();
  (AsyncStorage.getItem as jest.Mock)
    .mockReset()
    .mockImplementation(async (key) => rows.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock)
    .mockReset()
    .mockImplementation(async (key, value) => {
      rows.set(key, value);
    });
  (AsyncStorage.removeItem as jest.Mock)
    .mockReset()
    .mockImplementation(async (key) => {
      rows.delete(key);
    });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      background = listener;
      return { remove: jest.fn() };
    });
});
afterEach(() => jest.restoreAllMocks());

it('preserves written text while switching modes and only submits the active description', () => {
  const { result } = renderHook(() =>
    useCharacterEditDraft(character, pricing),
  );
  expect(result.current.activeMode).toBe('guided');
  act(() => result.current.setMode('prompt'));
  act(() =>
    result.current.stage('portraitPromptRaw', 'A knight made of glass'),
  );
  act(() => result.current.setMode('guided'));
  expect(result.current.writtenText).toBe('A knight made of glass');
  expect(result.current.lookPayload).toBeNull();
  act(() => result.current.setMode('prompt'));
  expect(result.current.lookPayload).toEqual({
    portraitPromptRaw: 'A knight made of glass',
  });
});

it('restores fields, inactive writing, section, expansion and scroll after unmount', async () => {
  const first = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() => {
    first.result.current.stage('name', 'Local name');
    first.result.current.setMode('prompt');
    first.result.current.stage('portraitPromptRaw', 'A knight made of glass');
    first.result.current.setMode('guided');
    first.result.current.setSection('gear');
    first.result.current.setScrollPosition('look', 240);
    first.result.current.setExpandedGroup('traits', false);
  });
  await act(async () => first.result.current.flush());
  first.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.restored).toBe(true);
  expect(restored.result.current.values.name).toBe('Local name');
  expect(restored.result.current.writtenText).toBe('A knight made of glass');
  expect(restored.result.current.activeMode).toBe('guided');
  expect(restored.result.current.section).toBe('gear');
  expect(restored.result.current.scrollPositions.look).toBe(240);
  expect(restored.result.current.expandedGroups.traits).toBe(false);
});

it('serializes a slow save before discard so deletion cannot resurrect a draft', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  const writing = deferred<void>();
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(
    async (key, value) => {
      await writing.promise;
      rows.set(key, value);
    },
  );
  act(() => view.result.current.stage('name', 'Discard me'));
  let discarded!: Promise<void>;
  act(() => {
    discarded = view.result.current.discard();
  });
  await act(async () => {
    writing.resolve();
    await discarded;
  });
  await act(async () => view.result.current.flush());
  view.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.restored).toBe(false);
  expect(restored.result.current.values).toEqual({});
  expect(rows.size).toBe(0);
});

it('isolates accounts and fences an old account hydration after a scope switch', async () => {
  const firstRead = deferred<string | null>();
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
    () => firstRead.promise,
  );
  const view = renderHook(
    ({ accountId }: { accountId: string }) =>
      useCharacterEditDraft(character, pricing, undefined, {
        accountId,
        characterId: 'fighter',
      }),
    { initialProps: { accountId: 'old' } },
  );
  view.rerender({ accountId: 'new' });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'New account draft'));
  await act(async () => view.result.current.flush());
  await act(async () => firstRead.resolve(null));
  expect(view.result.current.values.name).toBe('New account draft');
  view.rerender({ accountId: 'old' });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  expect(view.result.current.values).toEqual({});
  view.rerender({ accountId: 'new' });
  await waitFor(() =>
    expect(view.result.current.values.name).toBe('New account draft'),
  );
});

it('retains unsaved changes after disk errors and retries on background flush', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('Disk full'),
  );
  act(() => view.result.current.stage('name', 'Do not lose me'));
  await waitFor(() =>
    expect(view.result.current.persistenceError).toBeTruthy(),
  );
  expect(view.result.current.values.name).toBe('Do not lose me');
  await act(async () => {
    background?.('background');
  });
  await waitFor(() => expect(view.result.current.persistenceError).toBeNull());
  view.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() =>
    expect(restored.result.current.values.name).toBe('Do not lose me'),
  );
});

it('keeps restore failures visible and retries hydration before accepting edits', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
    new Error('Unavailable'),
  );
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() =>
    expect(view.result.current.persistenceError).toBeTruthy(),
  );
  expect(view.result.current.ready).toBe(false);
  act(() => view.result.current.stage('name', 'Unsafe edit'));
  expect(view.result.current.values).toEqual({});
  await act(async () => view.result.current.flush());
  expect(view.result.current.ready).toBe(true);
  expect(view.result.current.persistenceError).toBeNull();
});

it('reconciles untouched remote fields and requires explicit choices for overlapping edits', () => {
  const view = renderHook(
    ({ saved }: { saved: typeof character }) =>
      useCharacterEditDraft(saved, pricing),
    { initialProps: { saved: character } },
  );
  act(() => view.result.current.stage('name', 'Local'));
  view.rerender({ saved: { ...character, name: 'Remote', era: 'far_future' } });
  expect(view.result.current.values).toEqual({ name: 'Local' });
  expect(view.result.current.conflicts).toEqual([
    { key: 'name', label: 'Name', saved: 'Remote', draft: 'Local' },
  ]);
  act(() => view.result.current.resolveConflict('name', 'draft'));
  expect(view.result.current.conflicts).toEqual([]);
  expect(view.result.current.identityPayload).toEqual({ name: 'Local' });
  act(() => view.result.current.stage('era', 'ancient'));
  view.rerender({ saved: { ...character, name: 'Remote', era: 'modern' } });
  expect(view.result.current.conflicts.map((conflict) => conflict.key)).toEqual(
    ['era'],
  );
  act(() => view.result.current.resolveConflict('era', 'saved'));
  expect(view.result.current.values.era).toBeUndefined();
  expect(view.result.current.conflicts).toEqual([]);
});

it('restores conflicts against a newer remote character', async () => {
  const first = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() => first.result.current.stage('name', 'Local'));
  await act(async () => first.result.current.flush());
  first.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(
      { ...character, name: 'Remote' },
      pricing,
      undefined,
      options,
    ),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.conflicts).toEqual([
    { key: 'name', label: 'Name', saved: 'Remote', draft: 'Local' },
  ]);
});

it('acknowledges only submitted fields while preserving newer edits and ignoring stale props', async () => {
  const view = renderHook(
    ({ saved }: { saved: typeof character }) =>
      useCharacterEditDraft(saved, pricing, undefined, options),
    { initialProps: { saved: character } },
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => {
    view.result.current.stage('name', 'Submitted');
    view.result.current.stage('era', 'far_future');
    view.result.current.setMode('prompt');
    view.result.current.stage(
      'portraitPromptRaw',
      'Keep this unused description',
    );
    view.result.current.setMode('guided');
  });
  const submitted = { ...view.result.current.values };
  act(() => view.result.current.stage('name', 'Newer edit'));
  await act(async () => view.result.current.acknowledge(['name'], submitted));
  expect(view.result.current.values.name).toBe('Newer edit');
  expect(view.result.current.values.era).toBe('far_future');
  expect(view.result.current.conflicts).toEqual([]);
  expect(view.result.current.writtenText).toBe('Keep this unused description');
  view.rerender({ saved: { ...character } });
  expect(view.result.current.conflicts).toEqual([]);
  view.rerender({ saved: { ...character, name: 'Submitted' } });
  expect(view.result.current.conflicts).toEqual([]);
  await act(async () =>
    view.result.current.acknowledge(['name'], { name: 'Newer edit' }),
  );
  expect(view.result.current.values.name).toBeUndefined();
  expect(view.result.current.values.era).toBe('far_future');
  expect(view.result.current.dirty).toBe(true);
});

it('does not lose edits made while acknowledgement is still writing to storage', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Submitted'));
  await act(async () => view.result.current.flush());
  const writing = deferred<void>();
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(
    async (key, value) => {
      await writing.promise;
      rows.set(key, value);
    },
  );
  let acknowledging!: Promise<void>;
  act(() => {
    acknowledging = view.result.current.acknowledge(['name'], {
      name: 'Submitted',
    });
  });
  act(() => view.result.current.stage('name', 'Typed while saving'));
  await act(async () => {
    writing.resolve();
    await acknowledging;
    await view.result.current.flush();
  });
  expect(view.result.current.values.name).toBe('Typed while saving');
  view.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.values.name).toBe('Typed while saving');
  expect(restored.result.current.conflicts).toEqual([]);
});

it('fences old callbacks and old write failures from a new fighter', async () => {
  const view = renderHook(
    ({ characterId }: { characterId: string }) =>
      useCharacterEditDraft(character, pricing, undefined, {
        accountId: 'account',
        characterId,
      }),
    { initialProps: { characterId: 'first' } },
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  const oldDraft = view.result.current;
  const writing = deferred<void>();
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async () => {
    await writing.promise;
    throw new Error('Old storage failed');
  });
  act(() => oldDraft.stage('name', 'First fighter draft'));
  view.rerender({ characterId: 'second' });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Second fighter draft'));
  await act(async () => {
    oldDraft.stage('name', 'Stale callback');
    await oldDraft.acknowledge(['name'], { name: 'First fighter draft' });
    await oldDraft.discard();
    writing.resolve();
    await view.result.current.flush();
  });
  expect(view.result.current.values.name).toBe('Second fighter draft');
  expect(view.result.current.persistenceError).toBeNull();
});

it('does not overwrite stored data when hydration fails or a malformed draft is present', async () => {
  const key = 'character-edit-draft:v1:account:fighter';
  rows.set(key, '{not valid JSON');
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() =>
    expect(view.result.current.persistenceError).toBeTruthy(),
  );
  act(() => {
    view.result.current.stage('name', 'Cannot replace stored text');
    view.result.current.setMode('prompt');
  });
  await act(async () => {
    await expect(view.result.current.flush()).rejects.toThrow();
  });
  expect(rows.get(key)).toBe('{not valid JSON');
  expect(view.result.current.ready).toBe(false);
});

it('keeps a failed discard retryable and a tombstone prevents restoration after restart', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Discarded text'));
  await act(async () => view.result.current.flush());
  (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(
    new Error('Cannot delete'),
  );
  await act(async () => {
    await expect(view.result.current.discard()).rejects.toThrow(
      'Cannot delete',
    );
  });
  expect(view.result.current.persistenceError).toContain('remove');
  expect([...rows.values()].join()).not.toContain('Discarded text');
  view.unmount();
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.restored).toBe(false);
  expect(restored.result.current.values).toEqual({});
});

it('allows new edits after discarding and isolates another account with the same fighter id', async () => {
  const first = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  const other = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, {
      ...options,
      accountId: 'other',
    }),
  );
  await waitFor(() =>
    expect(first.result.current.ready && other.result.current.ready).toBe(true),
  );
  act(() => {
    first.result.current.stage('name', 'First account');
    other.result.current.stage('name', 'Other account');
  });
  await act(async () => {
    await first.result.current.discard();
    await other.result.current.flush();
  });
  act(() => first.result.current.stage('name', 'Started over'));
  await act(async () => first.result.current.flush());
  expect(other.result.current.values.name).toBe('Other account');
  expect(
    [...rows.values()].some((value) => value.includes('Started over')),
  ).toBe(true);
  expect(
    [...rows.values()].some((value) => value.includes('Other account')),
  ).toBe(true);
});

it('persists remote reconciliation after a local save has already finished', async () => {
  const view = renderHook(
    ({ saved }: { saved: typeof character }) =>
      useCharacterEditDraft(saved, pricing, undefined, options),
    { initialProps: { saved: character } },
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Remote eventually matches'));
  await act(async () => view.result.current.flush());
  view.rerender({ saved: { ...character, name: 'Remote eventually matches' } });
  await act(async () => view.result.current.flush());
  expect(view.result.current.values.name).toBeUndefined();
  view.unmount();
  // A subsequent remote change must not revive an edit that was already reconciled.
  const restored = renderHook(() =>
    useCharacterEditDraft(
      { ...character, name: 'Later name' },
      pricing,
      undefined,
      options,
    ),
  );
  await waitFor(() => expect(restored.result.current.ready).toBe(true));
  expect(restored.result.current.values.name).toBeUndefined();
  expect(restored.result.current.conflicts).toEqual([]);
});

it('can explicitly discard a malformed draft without first restoring it', async () => {
  rows.set('character-edit-draft:v1:account:fighter', '{not valid JSON');
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() =>
    expect(view.result.current.persistenceError).toBeTruthy(),
  );
  await act(async () => view.result.current.discard());
  expect(view.result.current.ready).toBe(true);
  expect(view.result.current.persistenceError).toBeNull();
  expect(rows.size).toBe(0);
  act(() => view.result.current.stage('name', 'New draft'));
  await act(async () => view.result.current.flush());
  expect(view.result.current.values.name).toBe('New draft');
});

it('does not restore an in-flight read over an explicit discard', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Before discard'));
  await act(async () => view.result.current.flush());
  view.unmount();
  const reading = deferred<string | null>();
  const raw = [...rows.values()][0];
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
    () => reading.promise,
  );
  const restored = renderHook(() =>
    useCharacterEditDraft(character, pricing, undefined, options),
  );
  let deleting!: Promise<void>;
  act(() => {
    deleting = restored.result.current.discard();
  });
  expect(restored.result.current.values).toEqual({});
  await act(async () => {
    reading.resolve(raw);
    await deleting;
  });
  expect(restored.result.current.values).toEqual({});
  expect(restored.result.current.restored).toBe(false);
  expect(rows.size).toBe(0);
});

it('persists only editable fields instead of character media URLs or server-owned data', async () => {
  const view = renderHook(() =>
    useCharacterEditDraft(
      {
        ...character,
        portrait_url: 'https://media.example/secret',
        wallet_balance: 2000,
      },
      pricing,
      undefined,
      options,
    ),
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  act(() => view.result.current.stage('name', 'Local'));
  await act(async () => view.result.current.flush());
  const stored = [...rows.values()].join();
  expect(stored).not.toContain('https://media.example/secret');
  expect(stored).not.toContain('wallet_balance');
  expect(stored).toContain('Local');
});
