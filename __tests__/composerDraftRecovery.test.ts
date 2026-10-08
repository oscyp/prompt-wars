import { composerReducer, createComposerState } from '@/utils/promptComposer';
import {
  composerDraftRecoveries,
  restoreComposerDraftRecovery,
} from '@/utils/composerDraftRecovery';

function manualState() {
  let state = createComposerState('write');
  state = composerReducer(state, {
    type: 'edit',
    text: 'My current independent manual plan stays available.',
  });
  return composerReducer(state, { type: 'move-type', moveType: 'finisher' });
}

test('offers both migrated drafts with exact text and type without parsing their prose', () => {
  const state = {
    ...manualState(),
    recoveredManualBuffer: {
      finalText: '  An earlier manual plan with preserved spacing.\n',
      moveType: 'defense' as const,
      authoringOrigin: 'manual' as const,
    },
    legacyBuilderBuffer: {
      finalText: 'My previous action and an unfinished purpose',
      moveType: 'attack' as const,
      authoringOrigin: 'mixed' as const,
    },
  };
  expect(composerDraftRecoveries(state)).toEqual([
    {
      key: 'recoveredManualBuffer',
      text: '  An earlier manual plan with preserved spacing.\n',
      moveType: 'defense',
      authoringOrigin: 'manual',
    },
    {
      key: 'legacyBuilderBuffer',
      text: 'My previous action and an unfinished purpose',
      moveType: 'attack',
      authoringOrigin: 'mixed',
    },
  ]);
});

test('hides blank, current-identical and duplicate saved drafts, but retains a distinct type', () => {
  const current = manualState();
  expect(
    composerDraftRecoveries({
      ...current,
      recoveredManualBuffer: { ...current.manualBuffer!, finalText: ' \n ' },
      legacyBuilderBuffer: current.manualBuffer,
    }),
  ).toEqual([]);
  const buffer = {
    finalText: 'A saved plan',
    moveType: 'attack' as const,
    authoringOrigin: 'manual' as const,
  };
  expect(
    composerDraftRecoveries({
      ...current,
      recoveredManualBuffer: buffer,
      legacyBuilderBuffer: buffer,
    }),
  ).toHaveLength(1);
  expect(
    composerDraftRecoveries({
      ...current,
      recoveredManualBuffer: { ...current.manualBuffer!, moveType: 'defense' },
    }),
  ).toHaveLength(1);
});

test.each(['recoveredManualBuffer', 'legacyBuilderBuffer'] as const)(
  'restoring %s preserves the displaced current version and the separate builder',
  (key) => {
    const original = manualState();
    const saved = {
      finalText: '  Saved exact prose is editable without reconstruction.\n',
      moveType: 'defense' as const,
      authoringOrigin: 'mixed' as const,
    };
    const state = {
      ...original,
      [key]: saved,
      builderBuffer: {
        finalText: 'My separate chosen action to mark the route by waiting.',
        moveType: 'attack' as const,
        authoringOrigin: 'builder' as const,
        pending: false,
      },
    };
    const restored = restoreComposerDraftRecovery(state, key);
    expect(restored).toMatchObject({
      mode: 'write',
      finalText: saved.finalText,
      moveType: 'defense',
      manualBuffer: saved,
      pending: false,
      detached: true,
    });
    expect(restored[key]).toEqual({
      finalText: original.finalText,
      moveType: 'finisher',
      authoringOrigin: 'manual',
    });
    expect(restored.builderBuffer).toBe(state.builderBuffer);
    expect(restored.branches).toBe(state.branches);
    expect(restored.revision).toBeGreaterThan(state.revision);
    expect(state[key]).toBe(saved);
    const back = restoreComposerDraftRecovery(restored, key);
    expect(back.finalText).toBe(original.finalText);
    expect(back.moveType).toBe('finisher');
    expect(back[key]).toEqual(saved);
  },
);

test('restoring one migrated version never overwrites the other archive', () => {
  const state = {
    ...manualState(),
    recoveredManualBuffer: {
      finalText: 'An earlier manual plan',
      moveType: null,
      authoringOrigin: 'manual' as const,
    },
    legacyBuilderBuffer: {
      finalText: 'A different earlier builder plan',
      moveType: 'attack' as const,
      authoringOrigin: 'builder' as const,
    },
  };
  const restored = restoreComposerDraftRecovery(state, 'recoveredManualBuffer');
  expect(restored.moveType).toBeNull();
  expect(restored.legacyBuilderBuffer).toBe(state.legacyBuilderBuffer);
  expect(
    composerDraftRecoveries(restored).map((choice) => choice.text),
  ).toEqual([
    'My current independent manual plan stays available.',
    'A different earlier builder plan',
  ]);
});

test('builder screens and unavailable saved buffers cannot replace the current prompt', () => {
  const builder = {
    ...createComposerState(),
    recoveredManualBuffer: {
      finalText: 'A saved draft remains available',
      moveType: 'attack' as const,
      authoringOrigin: 'manual' as const,
    },
  };
  expect(composerDraftRecoveries(builder)).toEqual([]);
  expect(restoreComposerDraftRecovery(builder, 'recoveredManualBuffer')).toBe(
    builder,
  );
  const manual = manualState();
  expect(restoreComposerDraftRecovery(manual, 'legacyBuilderBuffer')).toBe(
    manual,
  );
});
