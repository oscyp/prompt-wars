import { createBattleDraftStore } from '@/utils/battleDrafts';
import type { ComposerStep } from '@/utils/promptComposerFlow';
import {
  composerCanSubmit,
  composerReducer,
  composerSnapshot,
  composerDraftSnapshot,
  createComposerState,
} from '@/utils/promptComposer';

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

test('v5 preserves all three fields, type, and manual buffer across restart', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  let composer = composerReducer(createComposerState(), {
    type: 'change',
    change: {
      type: 'action',
      text: 'I brace the bridge',
      id: 'a',
      moveType: 'defense',
    },
  });
  composer = composerReducer(composer, {
    type: 'change',
    change: { type: 'intent', text: 'to help everyone cross', id: 'i' },
  });
  composer = composerReducer(composer, {
    type: 'change',
    change: {
      type: 'approach',
      text: 'by supporting the loose plank with my shield.',
      id: 'p',
    },
  });
  await store.save(scope, {
    ...draft,
    text: composer.finalText,
    composer: composerDraftSnapshot(composer),
    composerStep: 'approach',
  });
  expect(JSON.parse([...disk.rows.values()][0]).version).toBe(5);
  const restored = (await createBattleDraftStore(disk).read(scope))!;
  expect(restored.composer).toEqual(composerSnapshot(composer));
  expect(restored.composerStep).toBe('approach');
  expect(composerCanSubmit(restored.composer!)).toBe(true);
});

test('legacy complete composer migrates to full-text writing without inventing approach', async () => {
  const disk = storage();
  disk.rows.set(
    'battle-draft:v1:a:b:1',
    JSON.stringify({
      version: 3,
      ...draft,
      text: 'I brace the bridge so everyone can cross safely.',
      composerStep: 'intent',
      composer: {
        mode: 'build',
        moveType: 'defense',
        authoringOrigin: 'builder',
        actionOrigin: 'builder',
        finalText: 'stale',
        actionText: 'I brace the bridge',
        intentText: 'so everyone can cross safely.',
        actionId: 'a',
        intentId: 'i',
        intentSource: 'suggestion',
        detached: false,
        pending: false,
        contextKey: null,
      },
    }),
  );
  const restored = (await createBattleDraftStore(disk).read(scope))!;
  expect(restored.composer).toMatchObject({
    mode: 'write',
    moveType: 'defense',
    finalText: 'I brace the bridge so everyone can cross safely.',
    approachText: '',
    pending: false,
  });
  expect(restored.editMode).toBe(true);
  expect(restored.composerStep).toBe('write');
  expect(composerCanSubmit(restored.composer!)).toBe(true);
});

test('legacy incomplete builder preserves prose but resumes the earliest missing stage', async () => {
  const disk = storage();
  disk.rows.set(
    'battle-draft:v1:a:b:1',
    JSON.stringify({
      version: 3,
      ...draft,
      composerStep: 'review',
      composer: {
        mode: 'build',
        moveType: 'defense',
        actionText: 'I brace the bridge',
        intentText: '',
        actionId: 'a',
        intentId: null,
        intentSource: null,
        detached: false,
        pending: true,
        contextKey: null,
      },
    }),
  );
  const restored = (await createBattleDraftStore(disk).read(scope))!;
  expect(restored.text).toBe(draft.text);
  expect(restored.composer?.approachText).toBe('');
  expect(restored.composerStep).toBe('intent');
  expect(composerCanSubmit(restored.composer!)).toBe(false);
});

test('corrupt structured state leaves the canonical prompt and type intact', async () => {
  const disk = storage();
  disk.rows.set(
    'battle-draft:v1:a:b:1',
    JSON.stringify({ version: 4, ...draft, composer: { broken: true } }),
  );
  expect(await createBattleDraftStore(disk).read(scope)).toEqual(draft);
});

test('restored composer always takes canonical text from enclosing draft', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  await store.save(scope, draft);
  const key = [...disk.rows.keys()][0];
  disk.rows.set(
    key,
    JSON.stringify({
      version: 2,
      ...draft,
      composer: {
        mode: 'write',
        finalText: 'stale duplicate',
        actionText: '',
        intentText: '',
        actionId: null,
        intentId: null,
        intentSource: null,
        detached: true,
        pending: false,
        contextKey: null,
      },
    }),
  );
  expect((await store.read(scope))?.composer?.finalText).toBe(draft.text);
});

test.each([
  'faceoff',
  'action',
  'intent',
  'approach',
  'write',
  'review',
] as const)(
  'v5 retains the %s composer view after parking and restarting',
  async (composerStep) => {
    const disk = storage();
    await createBattleDraftStore(disk).save(scope, {
      ...draft,
      composerStep,
    });
    const saved = JSON.parse([...disk.rows.values()][0]);
    expect(saved.version).toBe(5);
    expect([...disk.rows.keys()][0]).toBe('battle-draft:v1:a:b:1');
    expect(await createBattleDraftStore(disk).read(scope)).toEqual({
      ...draft,
      composerStep,
    });
  },
);

test.each([null, 0, {}, 'choose', 'review-next'])(
  'ignores invalid composer view %p without losing the scoped draft',
  async (composerStep) => {
    const disk = storage();
    const store = createBattleDraftStore(disk);
    await store.save(scope, draft);
    const key = [...disk.rows.keys()][0];
    disk.rows.set(key, JSON.stringify({ version: 3, ...draft, composerStep }));
    expect(await store.read(scope)).toEqual(draft);
  },
);

test.each([1, 2, 3, 4, 5])(
  'version %i without composer view still restores canonical text and move',
  async (version) => {
    const disk = storage();
    const store = createBattleDraftStore(disk);
    await store.save(scope, draft);
    const key = [...disk.rows.keys()][0];
    disk.rows.set(key, JSON.stringify({ version, ...draft }));
    expect(await store.read(scope)).toEqual(draft);
  },
);

test('does not serialize invalid or unrelated local presentation fields', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  await store.save(scope, {
    ...draft,
    composerStep: 'unknown' as ComposerStep,
    temporaryView: 'purchase',
  } as typeof draft & { composerStep: ComposerStep });
  const saved = JSON.parse([...disk.rows.values()][0]);
  expect(saved).toEqual({ version: 5, ...draft });
});

test('the latest queued view survives restart alongside its matching text and move', async () => {
  const disk = storage();
  const store = createBattleDraftStore(disk);
  await Promise.all([
    store.save(scope, { ...draft, composerStep: 'action' }),
    store.save(scope, {
      ...draft,
      text: 'I change the cable angle to stop their momentum.',
      move: 'attack',
      composerStep: 'review',
    }),
  ]);
  expect(await createBattleDraftStore(disk).read(scope)).toEqual({
    ...draft,
    text: 'I change the cable angle to stop their momentum.',
    move: 'attack',
    composerStep: 'review',
  });
});

test.each(['action', 'intent', 'approach'] as const)(
  'v4 custom %s resumes as exact manual text while retaining the prior manual buffer',
  async (customField) => {
    const disk = storage();
    let state = createComposerState();
    for (const choice of [
      {
        type: 'action' as const,
        id: 'a',
        text: 'I pull the cable',
        moveType: 'attack' as const,
      },
      { type: 'intent' as const, id: 'i', text: 'to stop their charge' },
      {
        type: 'approach' as const,
        id: 'p',
        text: 'by pulling as they step forward.',
      },
    ])
      state = composerReducer(state, {
        type: 'change',
        change: {
          ...choice,
          id: choice.type === customField ? null : choice.id,
        },
      });
    state = {
      ...state,
      manualBuffer: {
        finalText: 'My earlier manual idea should stay recoverable.',
        moveType: 'defense',
        authoringOrigin: 'manual',
      },
    };
    disk.rows.set(
      'battle-draft:v1:a:b:1',
      JSON.stringify({
        version: 4,
        text: state.finalText,
        move: state.moveType,
        editMode: false,
        selectedSuggestion: null,
        composer: composerDraftSnapshot(state),
        composerStep: 'approach',
      }),
    );
    const restored = (await createBattleDraftStore(disk).read(scope))!;
    expect(restored.composerStep).toBe('write');
    expect(restored.composer).toMatchObject({
      mode: 'write',
      finalText:
        'I pull the cable to stop their charge by pulling as they step forward.',
      moveType: 'attack',
      recoveredManualBuffer: {
        finalText: 'My earlier manual idea should stay recoverable.',
        moveType: 'defense',
      },
    });
    const builder = composerReducer(
      { ...restored.composer!, replacement: null, undo: null },
      { type: 'mode', mode: 'build' },
    );
    expect(composerCanSubmit(builder)).toBe(false);
    expect(builder.actionText).toBe('');
    const manual = composerReducer(builder, { type: 'mode', mode: 'write' });
    expect(manual.finalText).toBe(state.finalText);
    expect(manual.moveType).toBe('attack');
  },
);

test('v4 freestyle keeps its current text and archives a hidden custom builder before returning to selection-only build', async () => {
  const disk = storage();
  let state = composerReducer(createComposerState(), {
    type: 'change',
    change: {
      type: 'action',
      id: null,
      text: 'I hold the cable steady',
      moveType: 'defense',
    },
  });
  const builderText = state.finalText;
  state = composerReducer(state, { type: 'mode', mode: 'write' });
  state = composerReducer(state, {
    type: 'edit',
    text: 'My independent manual plan remains untouched.',
  });
  state = composerReducer(state, { type: 'move-type', moveType: 'finisher' });
  disk.rows.set(
    'battle-draft:v1:a:b:1',
    JSON.stringify({
      version: 4,
      text: state.finalText,
      move: state.moveType,
      editMode: true,
      selectedSuggestion: null,
      composer: composerDraftSnapshot(state),
      composerStep: 'write',
    }),
  );
  const restored = (await createBattleDraftStore(disk).read(scope))!;
  expect(restored.composer).toMatchObject({
    mode: 'write',
    finalText: 'My independent manual plan remains untouched.',
    moveType: 'finisher',
    legacyBuilderBuffer: { finalText: builderText, moveType: 'defense' },
  });
  const builder = composerReducer(
    { ...restored.composer!, replacement: null, undo: null },
    { type: 'mode', mode: 'build' },
  );
  expect(builder.actionText).toBe('');
  expect(builder.moveType).toBe('defense');
  const manual = composerReducer(builder, { type: 'mode', mode: 'write' });
  expect(manual.finalText).toBe(state.finalText);
  expect(manual.moveType).toBe('finisher');
});
