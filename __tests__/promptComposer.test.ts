import {
  createComposerState,
  composerReducer,
  composerCanSubmit,
  composerHintsContext,
  composerDraftSnapshot,
  readComposerSnapshot,
  type BuilderChange,
} from '@/utils/promptComposer';

const action: BuilderChange = {
  type: 'action',
  text: 'I pull the cable across their path',
  id: 'a1',
  moveType: 'attack',
};
const intent: BuilderChange = {
  type: 'intent',
  text: 'to interrupt their charge',
  id: 'i1',
};
const approach: BuilderChange = {
  type: 'approach',
  text: 'by tightening it as they reach the wet floor.',
  id: 'p1',
};
const change = (
  state: ReturnType<typeof createComposerState>,
  value: BuilderChange,
) => composerReducer(state, { type: 'change', change: value });
const built = () =>
  change(change(change(createComposerState(), action), intent), approach);

it('requires all three decisions and composes their visible fragments without rewriting', () => {
  let state = change(createComposerState(), action);
  state = change(state, intent);
  expect(composerCanSubmit(state)).toBe(false);
  state = change(state, approach);
  expect(state.finalText).toBe(
    'I pull the cable across their path to interrupt their charge by tightening it as they reach the wet floor.',
  );
  expect(composerCanSubmit(state)).toBe(true);
  expect(state.authoringOrigin).toBe('builder');
});

it('restores the complete old action branch and atomic type when returning to its exact parent', () => {
  const original = built();
  let next = change(original, {
    ...action,
    id: 'a2',
    text: 'I brace against the support',
    moveType: 'defense',
  });
  expect(next.intentText).toBe('');
  expect(next.approachText).toBe('');
  expect(composerCanSubmit(next)).toBe(false);
  next = change(next, {
    ...intent,
    id: 'i2',
    text: 'to stay beyond the cable',
  });
  next = change(next, {
    ...approach,
    id: 'p2',
    text: 'by keeping both feet on dry ground.',
  });
  next = change(next, action);
  expect(next.moveType).toBe('attack');
  expect(next.intentId).toBe('i1');
  expect(next.approachId).toBe('p1');
  expect(next.finalText).toBe(original.finalText);
  expect(composerCanSubmit(next)).toBe(true);
});

it('restores approach separately for each exact intention', () => {
  const original = built();
  let next = change(original, {
    ...intent,
    id: 'i2',
    text: 'to force them toward the support',
  });
  expect(next.approachText).toBe('');
  next = change(next, {
    ...approach,
    id: 'p2',
    text: 'by drawing the cable from the side.',
  });
  next = change(next, intent);
  expect(next.approachText).toBe(approach.text);
  expect(next.finalText).toBe(original.finalText);
});

it('preserves custom descendants but requires explicit confirmation after changing their parent', () => {
  let state = change(
    change(change(createComposerState(), action), { ...intent, id: null }),
    { ...approach, id: null },
  );
  state = change(state, {
    ...action,
    id: 'a2',
    text: 'I guide the cable around the support',
  });
  expect(state.intentText).toBe(intent.text);
  expect(state.approachText).toBe(approach.text);
  expect(state.intentNeedsConfirmation).toBe(true);
  expect(state.approachNeedsConfirmation).toBe(true);
  expect(composerCanSubmit(state)).toBe(false);
  state = composerReducer(state, { type: 'confirm-fragment', field: 'intent' });
  expect(composerCanSubmit(state)).toBe(false);
  state = composerReducer(state, {
    type: 'confirm-fragment',
    field: 'approach',
  });
  expect(composerCanSubmit(state)).toBe(true);
  expect(state.authoringOrigin).toBe('mixed');
});

it('does not store intermediate keystrokes as visited branches', () => {
  let state = change(built(), {
    ...action,
    id: null,
    text: 'I pull another cable',
  });
  for (let i = 0; i < 100; i++)
    state = change(state, {
      ...action,
      id: null,
      text: `I pull another cable ${i}`,
    });
  expect(Object.keys(state.branches)).toHaveLength(1);
});

it('keeps independent manual and builder buffers and types through repeated mode changes', () => {
  const original = built();
  let state = composerReducer(original, { type: 'mode', mode: 'write' });
  expect(state.finalText).toBe(original.finalText);
  state = composerReducer(state, {
    type: 'edit',
    text: 'I wait behind the support until the cable drops.',
  });
  state = composerReducer(state, { type: 'move-type', moveType: 'defense' });
  state = composerReducer(state, { type: 'mode', mode: 'build' });
  expect(state.finalText).toBe(original.finalText);
  expect(state.moveType).toBe('attack');
  state = change(state, {
    ...approach,
    text: 'by lifting it as their foot lands.',
  });
  state = composerReducer(state, { type: 'mode', mode: 'write' });
  expect(state.finalText).toBe(
    'I wait behind the support until the cable drops.',
  );
  expect(state.moveType).toBe('defense');
});

it('never substitutes a stale complete preview while the active builder is incomplete', () => {
  const original = built();
  const state = change(original, {
    ...action,
    id: 'a2',
    text: 'I duck beneath the swinging cable',
  });
  expect(state.finalText).toBe('I duck beneath the swinging cable');
  expect(composerCanSubmit(state)).toBe(false);
});

it('only applies asynchronous hints to their exact current parent without changing the chosen text', () => {
  let state = change(createComposerState(), { ...action, id: null });
  const contextKey = composerHintsContext(state, 'intent');
  const hints = [
    {
      id: 'generated',
      text: 'to divert their charge',
      approachHints: [{ id: 'p', text: 'by pulling from behind the support' }],
    },
  ];
  state = composerReducer(state, {
    type: 'hints',
    target: 'intent',
    contextKey,
    hints,
  });
  expect(state.intentHints).toEqual(hints);
  expect(state.intentText).toBe('');
  const next = change(state, {
    ...action,
    id: null,
    text: 'I brace against the support',
  });
  expect(
    composerReducer(next, {
      type: 'hints',
      target: 'intent',
      contextKey,
      hints,
    }),
  ).toBe(next);
});

it('persists visited branches and separate manual text without recursively storing state', () => {
  let state = change(built(), {
    ...action,
    id: 'other',
    text: 'I duck under the cable',
  });
  state = composerReducer(state, { type: 'mode', mode: 'write' });
  state = composerReducer(state, {
    type: 'edit',
    text: 'My own complete move remains on the manual route.',
  });
  const snapshot = composerDraftSnapshot(state);
  const restored = readComposerSnapshot(
    JSON.parse(JSON.stringify(snapshot)),
    state.finalText,
  )!;
  state = composerReducer(createComposerState(), {
    type: 'restore',
    snapshot: restored,
  });
  state = composerReducer(state, { type: 'mode', mode: 'build' });
  state = change(state, action);
  expect(state.approachId).toBe('p1');
  expect(composerCanSubmit(state)).toBe(true);
  state = composerReducer(state, { type: 'mode', mode: 'write' });
  expect(state.finalText).toBe(
    'My own complete move remains on the manual route.',
  );
});

it('invalidates old-situation suggestions and branches without losing prose', () => {
  const original = composerReducer(built(), {
    type: 'context',
    contextKey: 'round1',
  });
  const state = composerReducer(original, {
    type: 'context',
    contextKey: 'round2',
  });
  expect(state.actionText).toBe(action.text);
  expect(state.intentText).toBe(intent.text);
  expect(state.approachText).toBe(approach.text);
  expect(state.actionId).toBeNull();
  expect(state.branches).toEqual({});
  expect(composerCanSubmit(state)).toBe(false);
});

it('tracks all three fragment origins and does not count a tab switch as editing', () => {
  let state = change(
    change(change(createComposerState(), { ...action, id: null }), {
      ...intent,
      id: null,
    }),
    { ...approach, id: null },
  );
  expect(state.authoringOrigin).toBe('manual');
  state = change(state, approach);
  expect(state.authoringOrigin).toBe('mixed');
  const write = composerReducer(built(), { type: 'mode', mode: 'write' });
  expect(write.authoringOrigin).toBe('builder');
});

it.each([19, 801])(
  'rejects a manual final prompt of %i characters',
  (length) => {
    const state = composerReducer(createComposerState('write'), {
      type: 'edit',
      text: 'x'.repeat(length),
    });
    expect(composerCanSubmit(state)).toBe(false);
  },
);

it('clears the old preview for a new type and restores the previous full branch on return', () => {
  const original = built();
  let state = composerReducer(original, {
    type: 'move-type',
    moveType: 'defense',
  });
  expect(state.moveType).toBe('defense');
  expect(state.actionText).toBe('');
  expect(state.intentText).toBe('');
  expect(state.approachText).toBe('');
  expect(state.finalText).toBe('');
  expect(composerCanSubmit(state)).toBe(false);
  expect(state.revision).toBeGreaterThan(original.revision);
  state = composerReducer(state, { type: 'move-type', moveType: 'attack' });
  expect(state.actionId).toBe('a1');
  expect(state.intentId).toBe('i1');
  expect(state.approachId).toBe('p1');
  expect(state.finalText).toBe(original.finalText);
  expect(composerCanSubmit(state)).toBe(true);
});

it('keeps paid child options with their parent across action, intention and type changes and restart', () => {
  const actionHints = [
    {
      id: 'paid-i',
      text: 'to force a careful retreat',
      approachHints: [{ id: 'paid-p', text: 'by drawing the cable slowly' }],
    },
  ];
  const paidApproaches = [
    { id: 'paid-p2', text: 'by shifting the pull sideways' },
  ];
  let state = built();
  state = composerReducer(state, {
    type: 'hints',
    target: 'intent',
    contextKey: composerHintsContext(state, 'intent'),
    hints: actionHints,
  });
  state = composerReducer(state, {
    type: 'hints',
    target: 'approach',
    contextKey: composerHintsContext(state, 'approach'),
    hints: paidApproaches,
  });
  state = change(state, {
    ...intent,
    id: 'i2',
    text: 'to direct them behind the support',
  });
  state = change(state, intent);
  expect(state.approachHints).toEqual(paidApproaches);
  state = change(state, {
    ...action,
    id: 'a2',
    text: 'I brace against the support',
  });
  state = change(state, action);
  expect(state.intentHints).toEqual(actionHints);
  expect(state.approachHints).toEqual(paidApproaches);
  state = composerReducer(state, { type: 'move-type', moveType: 'finisher' });
  const snapshot = readComposerSnapshot(
    JSON.parse(JSON.stringify(composerDraftSnapshot(state))),
    state.finalText,
    state.moveType,
    5,
  )!;
  state = composerReducer(createComposerState(), { type: 'restore', snapshot });
  state = composerReducer(state, { type: 'move-type', moveType: 'attack' });
  expect(state.actionId).toBe('a1');
  expect(state.intentHints).toEqual(actionHints);
  expect(state.approachHints).toEqual(paidApproaches);
  expect(composerCanSubmit(state)).toBe(true);
});

it('keeps unselected purchased hints when revisiting their action or intention', () => {
  const intentions = [
    { id: 'paid-intent', text: 'to guide them away', approachHints: [] },
  ];
  let state = change(createComposerState(), action);
  state = composerReducer(state, {
    type: 'hints',
    target: 'intent',
    contextKey: composerHintsContext(state, 'intent'),
    hints: intentions,
  });
  state = change(state, {
    ...action,
    id: 'other',
    text: 'I brace against the support',
  });
  state = change(state, action);
  expect(state.intentHints).toEqual(intentions);
  state = change(state, intent);
  const approaches = [
    { id: 'paid-approach', text: 'by waiting for the cable to tighten' },
  ];
  state = composerReducer(state, {
    type: 'hints',
    target: 'approach',
    contextKey: composerHintsContext(state, 'approach'),
    hints: approaches,
  });
  state = change(state, {
    ...intent,
    id: 'other-intent',
    text: 'to move them away from the support',
  });
  state = change(state, intent);
  expect(state.approachHints).toEqual(approaches);
});
it('a fresh manual draft never implicitly selects a builder move type', () => {
  let state = composerReducer(createComposerState('write'), {
    type: 'edit',
    text: 'I wait for the cable to drop then duck below it.',
  });
  state = composerReducer(state, { type: 'move-type', moveType: 'defense' });
  state = composerReducer(state, { type: 'mode', mode: 'build' });
  expect(state.moveType).toBeNull();
  expect(state.finalText).toBe('');
  state = composerReducer(state, { type: 'mode', mode: 'write' });
  expect(state.moveType).toBe('defense');
  expect(state.finalText).toBe(
    'I wait for the cable to drop then duck below it.',
  );
});
