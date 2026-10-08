import {
  composerCanSubmit,
  composerFragmentValid,
  type ComposerSnapshot,
} from '@/utils/promptComposer';

export type ComposerStep =
  | 'faceoff'
  | 'action'
  | 'intent'
  | 'approach'
  | 'write'
  | 'review';

/** Local presentation metadata is optional and never changes a prompt. */
export function readComposerStep(value: unknown): ComposerStep | undefined {
  return value === 'faceoff' ||
    value === 'action' ||
    value === 'intent' ||
    value === 'approach' ||
    value === 'write' ||
    value === 'review'
    ? value
    : undefined;
}

/** Selecting a card leaves this stage unchanged; Next uses this guard. */
export function composerCanAdvanceAction(state: ComposerSnapshot): boolean {
  return (
    state.mode === 'build' &&
    !state.detached &&
    Boolean(state.moveType) &&
    Boolean(state.actionId) &&
    composerFragmentValid(state.actionText, 'action')
  );
}

/** A carried custom intention must be explicitly reconfirmed. */
export function composerCanAdvanceIntent(state: ComposerSnapshot): boolean {
  return (
    composerCanAdvanceAction(state) &&
    composerFragmentValid(state.intentText, 'intent') &&
    Boolean(state.intentId) &&
    !state.intentNeedsConfirmation
  );
}

/** Both authoring paths share the exact final text and explicit type guard. */
export function composerCanReview(state: ComposerSnapshot): boolean {
  return (
    Boolean(state.moveType) &&
    composerCanSubmit(state) &&
    (state.mode === 'write' ||
      (composerCanAdvanceIntent(state) && Boolean(state.approachId)))
  );
}

export function isComposerStepValid(
  step: ComposerStep,
  state: ComposerSnapshot,
): boolean {
  switch (step) {
    case 'faceoff':
      return true;
    case 'action':
      return state.mode === 'build';
    case 'intent':
      return composerCanAdvanceAction(state);
    case 'approach':
      return composerCanAdvanceIntent(state);
    case 'write':
      return state.mode === 'write';
    case 'review':
      return composerCanReview(state);
  }
}

function editingStep(state: ComposerSnapshot): ComposerStep {
  if (state.mode === 'write') return 'write';
  return composerCanAdvanceIntent(state)
    ? 'approach'
    : composerCanAdvanceAction(state)
      ? 'intent'
      : 'action';
}

/** Restore presentation only after the canonical semantic draft is restored. */
export function restoreComposerStep(
  state: ComposerSnapshot,
  savedStep?: unknown,
): ComposerStep {
  const step = readComposerStep(savedStep);
  if (step && isComposerStepValid(step, state)) return step;
  if (!step && !state.finalText && !state.actionText && !state.moveType)
    return 'faceoff';
  return composerCanReview(state) ? 'review' : editingStep(state);
}

/** Parent changes or invalidation retains the current view whenever it remains usable. */
export function normalizeComposerStep(
  step: ComposerStep,
  state: ComposerSnapshot,
): ComposerStep {
  return isComposerStepValid(step, state) ? step : editingStep(state);
}

/** The route applies any required mode change alongside this local target. */
export function composerBackStep(
  step: ComposerStep,
  state: ComposerSnapshot,
): ComposerStep | null {
  switch (step) {
    case 'faceoff':
      return null;
    case 'action':
    case 'write':
      return 'faceoff';
    case 'intent':
      return 'action';
    case 'approach':
      return 'intent';
    case 'review':
      return state.mode === 'write' ? 'write' : 'approach';
  }
}

/** Next is explicit: selecting cards never invokes this navigation. */
export function composerNextStep(
  step: ComposerStep,
  state: ComposerSnapshot,
): ComposerStep | null {
  switch (step) {
    case 'faceoff':
      return state.mode === 'write' ? 'write' : 'action';
    case 'action':
      return composerCanAdvanceAction(state) ? 'intent' : null;
    case 'intent':
      return composerCanAdvanceIntent(state) ? 'approach' : null;
    case 'approach':
    case 'write':
      return composerCanReview(state) ? 'review' : null;
    case 'review':
      return null;
  }
}
