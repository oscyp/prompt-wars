import { createBattleDraftStore } from '@/utils/battleDrafts';

const scope = { accountId: 'a', battleId: 'b', round: 1 };
const draft = {
  text: 'My saved prompt',
  move: 'defense' as const,
  editMode: true,
  selectedSuggestion: null,
};
function storage() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: async (key: string) => {
      rows.delete(key);
    },
  };
}
test('restores text, move and editor mode only for the authenticated account and round', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  await store.save(scope, draft);
  expect(await createBattleDraftStore(disk).read(scope)).toEqual(draft);
  expect(await store.read({ ...scope, accountId: 'other' })).toBeNull();
  expect(await store.read({ ...scope, round: 2 })).toBeNull();
});
test('serializes writes so a slow older write cannot overwrite a newer edit or discard', async () => {
  const disk = storage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const store = createBattleDraftStore({
    ...disk,
    setItem: async (key, value) => {
      if (first) {
        first = false;
        await gate;
      }
      await disk.setItem(key, value);
    },
  });
  const old = store.save(scope, draft);
  const newer = store.save(scope, { ...draft, text: 'New version' });
  release();
  await Promise.all([old, newer]);
  expect((await store.read(scope))?.text).toBe('New version');
  const pending = store.save(scope, draft);
  const clear = store.clear(scope);
  await Promise.all([pending, clear]);
  expect(await store.read(scope)).toBeNull();
});
test('reports storage failure and allows later save to recover', async () => {
  const disk = storage();
  let fail = true;
  const store = createBattleDraftStore({
    ...disk,
    setItem: async (key, value) => {
      if (fail) throw new Error('Disk full');
      await disk.setItem(key, value);
    },
  });
  await expect(store.save(scope, draft)).rejects.toThrow('Disk full');
  fail = false;
  await store.save(scope, draft);
  expect(await store.read(scope)).toEqual(draft);
});

test('failed physical removal records delete intent across a process restart', async () => {
  const disk = storage();
  const store = createBattleDraftStore({
    ...disk,
    removeItem: async () => {
      throw new Error('Unavailable');
    },
  });
  await store.save(scope, draft);
  await expect(store.clear(scope)).rejects.toThrow('Unavailable');
  expect(Array.from(disk.rows.values()).join()).not.toContain(draft.text);
  expect(await createBattleDraftStore(disk).read(scope)).toBeNull();
  expect(disk.rows.size).toBe(0);
});

test('same account can park two battles without draft crossover', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  const otherBattle = { ...scope, battleId: 'second-battle' };
  await Promise.all([
    store.save(scope, draft),
    store.save(otherBattle, {
      ...draft,
      text: 'Second battle writing',
      move: 'finisher',
      editMode: false,
    }),
  ]);
  await store.clear(scope);
  const restarted = createBattleDraftStore(disk);
  expect(await restarted.read(scope)).toBeNull();
  expect(await restarted.read(otherBattle)).toMatchObject({
    text: 'Second battle writing',
    move: 'finisher',
    editMode: false,
  });
});
