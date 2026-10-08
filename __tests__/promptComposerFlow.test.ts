import {
  composerReducer,
  createComposerState,
  type ComposerSnapshot,
} from '@/utils/promptComposer';
import {
  composerBackStep,
  composerNextStep,
  composerCanAdvanceAction,
  composerCanAdvanceIntent,
  composerCanReview,
  isComposerStepValid,
  normalizeComposerStep,
  restoreComposerStep,
  type ComposerStep,
} from '@/utils/promptComposerFlow';

const action: ComposerSnapshot = {
  ...createComposerState(),
  moveType: 'defense',
  actionText: 'I stretch the cable between the supports',
  actionId: 'cable-defense',
  actionOrigin: 'builder',
  pending: true,
};
const complete: ComposerSnapshot = {
  ...action,
  finalText:
    'I stretch the cable between the supports to slow their charge by pulling from behind cover.',
  approachText: 'by pulling from behind cover.',
  approachId: 'cover',
  approachSource: 'suggestion',
  intentText: 'to slow their charge',
  intentId: 'slow-charge',
  intentSource: 'suggestion',
  authoringOrigin: 'builder',
  pending: false,
};
const manual: ComposerSnapshot = {
  ...createComposerState('write'),
  moveType: 'finisher',
  finalText: 'I bring the dangling cable down to end their charge.',
  detached: true,
  authoringOrigin: 'manual',
};

it('requires an explicit type and a current action before entering intention', () => {
  expect(composerCanAdvanceAction(action)).toBe(true);
  expect(composerCanAdvanceAction({ ...action, actionText: '  ' })).toBe(false);
  expect(composerCanAdvanceAction({ ...action, moveType: null })).toBe(false);
  expect(composerCanAdvanceAction({ ...action, detached: true })).toBe(false);
  expect(composerCanAdvanceAction({ ...action, mode: 'write' })).toBe(false);
});

it('does not send a stale complete preview after an incomplete action change', () => {
  const state = composerReducer(
    { ...complete, replacement: null, undo: null },
    {
      type: 'change',
      change: {
        type: 'action',
        moveType: 'attack',
        text: 'I swing the cable toward their legs',
        id: 'cable-attack',
      },
    },
  );
  expect(state.finalText).toBe('I swing the cable toward their legs');
  expect(composerCanReview(state)).toBe(false);
  expect(restoreComposerStep(state, 'review')).toBe('intent');
});

it.each([
  [19, false],
  [20, true],
  [800, true],
  [801, false],
])(
  'review enforces the final %i-character prompt boundary',
  (length, ready) => {
    expect(
      composerCanReview({ ...manual, finalText: 'a'.repeat(length) }),
    ).toBe(ready);
  },
);

it('requires a type even for a complete manual prompt', () => {
  expect(composerCanReview(manual)).toBe(true);
  expect(composerCanReview({ ...manual, moveType: null })).toBe(false);
});

it.each([
  ['action', complete, 'action'],
  ['intent', complete, 'intent'],
  ['approach', complete, 'approach'],
  ['review', complete, 'review'],
  ['write', manual, 'write'],
  ['review', manual, 'review'],
] as const)(
  'keeps a valid parked %s view instead of jumping to review',
  (saved, state, want) => {
    expect(restoreComposerStep(state, saved)).toBe(want);
  },
);

it.each([
  [complete, undefined, 'review'],
  [complete, 'choose', 'review'],
  [action, undefined, 'intent'],
  [action, 'review', 'intent'],
  [createComposerState(), undefined, 'faceoff'],
  [createComposerState('write'), undefined, 'faceoff'],
  [{ ...manual, finalText: 'A short idea' }, 'review', 'write'],
  [{ ...action, moveType: null }, 'intent', 'action'],
  [{ ...complete, mode: 'write' }, 'intent', 'review'],
  [{ ...action, detached: true }, 'intent', 'action'],
] as const)(
  'restores a usable view for missing or incompatible metadata %#',
  (state, saved, want) => {
    expect(restoreComposerStep(state, saved)).toBe(want);
  },
);

it('does not advance when an action or intention is selected', () => {
  expect(normalizeComposerStep('action', action)).toBe('action');
  expect(normalizeComposerStep('intent', complete)).toBe('intent');
});

it.each([
  ['review', action, 'intent'],
  ['intent', createComposerState(), 'action'],
  ['review', { ...manual, finalText: 'Too short' }, 'write'],
  ['intent', { ...action, detached: true }, 'action'],
  ['write', complete, 'approach'],
  ['action', manual, 'write'],
] as const)(
  'moves an invalid %s view to the earliest usable editing view %#',
  (step, state, want) => {
    expect(normalizeComposerStep(step, state)).toBe(want);
  },
);

it.each([
  ['faceoff', complete, null],
  ['action', complete, 'faceoff'],
  ['intent', complete, 'action'],
  ['approach', complete, 'intent'],
  ['write', manual, 'faceoff'],
  ['review', complete, 'approach'],
  ['review', manual, 'write'],
] as const)(
  'Back from %s has a local target without changing the prompt %#',
  (step, state, want) => {
    const before = { ...state };
    expect(composerBackStep(step, state)).toBe(want);
    expect(state).toEqual(before);
  },
);

it.each([
  ['action', complete, true],
  ['action', manual, false],
  ['intent', action, true],
  ['intent', manual, false],
  ['approach', action, false],
  ['approach', complete, true],
  ['write', manual, true],
  ['write', complete, false],
  ['review', action, false],
  ['review', complete, true],
] as [ComposerStep, ComposerSnapshot, boolean][])(
  'checks the mode and prerequisites for %s %#',
  (step, state, valid) => {
    expect(isComposerStepValid(step, state)).toBe(valid);
  },
);

it('requires confirmation and a valid intention before approaching and never skips the third decision', () => {
  const intention = {
    ...action,
    intentText: 'to slow their charge',
    intentSource: 'suggestion' as const,
    intentId: 'selected-intent',
  };
  expect(composerCanAdvanceIntent(action)).toBe(false);
  expect(composerCanAdvanceIntent(intention)).toBe(true);
  expect(
    composerCanAdvanceIntent({ ...intention, intentNeedsConfirmation: true }),
  ).toBe(false);
  expect(restoreComposerStep(intention, 'review')).toBe('approach');
  expect(composerCanReview(intention)).toBe(false);
});

it('starts fresh rounds at face-off without choosing a move type', () => {
  for (const mode of ['build', 'write'] as const) {
    const state = createComposerState(mode);
    expect(restoreComposerStep(state)).toBe('faceoff');
    expect(state.moveType).toBeNull();
    expect(composerNextStep('faceoff', state)).toBe(
      mode === 'build' ? 'action' : 'write',
    );
    expect(normalizeComposerStep('faceoff', state)).toBe('faceoff');
  }
});
it('advances only after an explicit complete choice while navigation leaves state untouched', () => {
  const empty = createComposerState();
  expect(composerNextStep('action', empty)).toBeNull();
  expect(composerNextStep('action', action)).toBe('intent');
  expect(composerNextStep('intent', action)).toBeNull();
  expect(composerNextStep('intent', complete)).toBe('approach');
  expect(composerNextStep('approach', complete)).toBe('review');
  expect(composerNextStep('write', manual)).toBe('review');
  expect(composerNextStep('review', complete)).toBeNull();
});

it('never reviews legacy custom fragments through the selection-only builder', () => {
  expect(
    composerCanAdvanceAction({
      ...action,
      actionId: null,
      actionOrigin: 'manual',
    }),
  ).toBe(false);
  expect(
    composerCanAdvanceIntent({
      ...complete,
      intentId: null,
      intentSource: 'custom',
    }),
  ).toBe(false);
  expect(
    composerCanReview({
      ...complete,
      approachId: null,
      approachSource: 'custom',
    }),
  ).toBe(false);
});
