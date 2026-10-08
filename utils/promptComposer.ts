import type { MoveType } from '@/utils/battles';
import { validatePromptText } from '@/utils/promptSelection';

export type AuthoringOrigin = 'builder' | 'manual' | 'mixed' | 'unknown';
export type AuthoringMode = 'build' | 'write';
export type FragmentSource = 'custom' | 'suggestion' | null;
export interface ApproachHint {
  id: string;
  text: string;
}
export interface IntentHint extends ApproachHint {
  approachHints?: ApproachHint[];
}
interface ApproachSelection {
  approachHints?: ApproachHint[];
  approachText: string;
  approachId: string | null;
  approachSource: FragmentSource;
  approachNeedsConfirmation: boolean;
}
interface ActionBranch extends ApproachSelection {
  intentHints?: IntentHint[];
  intentText: string;
  intentId: string | null;
  intentSource: FragmentSource;
  intentNeedsConfirmation: boolean;
  intentBranches: Record<string, ApproachSelection>;
}
interface TypeSelection extends ActionBranch {
  actionText: string;
  actionId: string | null;
  actionOrigin: 'builder' | 'manual' | 'unknown';
}
interface TextBuffer {
  finalText: string;
  moveType: MoveType | null;
  authoringOrigin: AuthoringOrigin;
}
interface BuilderBuffer extends TextBuffer {
  pending: boolean;
}
export interface ComposerSnapshot extends ActionBranch {
  compositionVersion: 3;
  mode: AuthoringMode;
  moveType: MoveType | null;
  authoringOrigin: AuthoringOrigin;
  actionOrigin: 'builder' | 'manual' | 'unknown';
  finalText: string;
  actionText: string;
  actionId: string | null;
  detached: boolean;
  pending: boolean;
  contextKey: string | null;
  intentHints?: IntentHint[];
  approachHints?: ApproachHint[];
  branches: Record<string, ActionBranch>;
  manualBuffer: TextBuffer | null;
  recoveredManualBuffer: TextBuffer | null;
  legacyBuilderBuffer: TextBuffer | null;
  builderResetRequired: boolean;
  typeSelections: Partial<Record<MoveType, TypeSelection>>;
  builderBuffer: BuilderBuffer | null;
  revision: number;
}
/** Deprecated undo is read only for compatibility; navigation owns revisiting. */
export interface ComposerDraftSnapshot extends ComposerSnapshot {
  undo?: ComposerSnapshot | null;
}
export type BuilderChange = {
  type: 'action' | 'intent' | 'approach';
  moveType?: MoveType;
  text: string;
  id: string | null;
  intentHints?: IntentHint[];
  approachHints?: ApproachHint[];
};
export interface ComposerState extends ComposerSnapshot {
  replacement: BuilderChange | null;
  undo: ComposerSnapshot | null;
}
export type ComposerEvent =
  | { type: 'mode'; mode: AuthoringMode }
  | { type: 'edit'; text: string }
  | { type: 'move-type'; moveType: MoveType | null }
  | { type: 'change'; change: BuilderChange }
  | { type: 'context'; contextKey: string }
  | { type: 'restore'; snapshot: ComposerDraftSnapshot }
  | { type: 'confirm-fragment'; field: 'intent' | 'approach' }
  | {
      type: 'hints';
      target: 'intent' | 'approach';
      contextKey: string;
      hints: IntentHint[];
    }
  | { type: 'confirm' | 'cancel' | 'undo' };

const emptyApproach = (): ApproachSelection => ({
  approachHints: [],
  approachText: '',
  approachId: null,
  approachSource: null,
  approachNeedsConfirmation: false,
});
const emptyBranch = (): ActionBranch => ({
  ...emptyApproach(),
  intentHints: [],
  intentText: '',
  intentId: null,
  intentSource: null,
  intentNeedsConfirmation: false,
  intentBranches: {},
});
export function createComposerState(
  mode: AuthoringMode = 'build',
): ComposerState {
  return {
    ...emptyBranch(),
    compositionVersion: 3,
    mode,
    moveType: null,
    authoringOrigin: 'unknown',
    actionOrigin: 'unknown',
    finalText: '',
    actionText: '',
    actionId: null,
    detached: mode === 'write',
    pending: mode === 'build',
    contextKey: null,
    intentHints: [],
    approachHints: [],
    branches: {},
    manualBuffer: null,
    recoveredManualBuffer: null,
    legacyBuilderBuffer: null,
    builderResetRequired: false,
    typeSelections: {},
    builderBuffer: null,
    revision: 0,
    replacement: null,
    undo: null,
  };
}
export function composerSnapshot(state: ComposerState): ComposerSnapshot {
  const { replacement: _replacement, undo: _undo, ...snapshot } = state;
  return snapshot;
}
export function composerDraftSnapshot(
  state: ComposerState,
): ComposerDraftSnapshot {
  return composerSnapshot(state);
}
export function composePrompt(
  action: string,
  intent: string,
  approach = '',
): string {
  return [action, intent, approach]
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ');
}
export function composerFragmentValid(
  text: string,
  field: 'action' | 'intent' | 'approach',
): boolean {
  const length = text.trim().length;
  return length >= 5 && length <= (field === 'intent' ? 180 : 240);
}
function sourceOrigin(
  source: FragmentSource,
): 'builder' | 'manual' | 'unknown' {
  return source === 'suggestion'
    ? 'builder'
    : source === 'custom'
      ? 'manual'
      : 'unknown';
}
function refreshBuilder(state: ComposerState): ComposerState {
  const origins = [
    state.actionOrigin,
    sourceOrigin(state.intentSource),
    sourceOrigin(state.approachSource),
  ];
  return {
    ...state,
    finalText: composePrompt(
      state.actionText,
      state.intentText,
      state.approachText,
    ),
    pending:
      !composerFragmentValid(state.actionText, 'action') ||
      !composerFragmentValid(state.intentText, 'intent') ||
      !composerFragmentValid(state.approachText, 'approach') ||
      state.intentNeedsConfirmation ||
      state.approachNeedsConfirmation,
    detached: false,
    authoringOrigin: origins.includes('unknown')
      ? 'unknown'
      : origins.every((origin) => origin === origins[0])
        ? origins[0]
        : 'mixed',
  };
}
function approachSelection(state: ApproachSelection): ApproachSelection {
  return {
    approachHints: state.approachHints,
    approachText: state.approachText,
    approachId: state.approachId,
    approachSource: state.approachSource,
    approachNeedsConfirmation: state.approachNeedsConfirmation,
  };
}
function branchSelection(state: ActionBranch): ActionBranch {
  return {
    ...approachSelection(state),
    intentHints: state.intentHints,
    intentText: state.intentText,
    intentId: state.intentId,
    intentSource: state.intentSource,
    intentNeedsConfirmation: state.intentNeedsConfirmation,
    intentBranches: state.intentBranches,
  };
}
function typeSelection(state: ComposerState): TypeSelection {
  return {
    ...branchSelection(state),
    actionText: state.actionText,
    actionId: state.actionId,
    actionOrigin: state.actionOrigin,
  };
}
function rememberType(state: ComposerState): ComposerState['typeSelections'] {
  return state.moveType
    ? { ...state.typeSelections, [state.moveType]: typeSelection(state) }
    : state.typeSelections;
}
function emptyType(): TypeSelection {
  return {
    ...emptyBranch(),
    actionText: '',
    actionId: null,
    actionOrigin: 'unknown',
  };
}
function actionKey(
  state: Pick<
    ComposerSnapshot,
    'contextKey' | 'moveType' | 'actionId' | 'actionText'
  >,
): string {
  return JSON.stringify([
    state.contextKey,
    state.moveType,
    state.actionId,
    state.actionText.trim(),
  ]);
}
function intentKey(
  state: Pick<ComposerSnapshot, 'intentId' | 'intentText'>,
): string {
  return JSON.stringify([state.intentId, state.intentText.trim()]);
}
/** Includes scope and exact visible parents; delayed results cannot cross branches. */
export function composerHintsContext(
  state: ComposerSnapshot,
  target: 'intent' | 'approach',
): string {
  return JSON.stringify([
    state.contextKey,
    state.moveType,
    target,
    state.actionText.trim(),
    ...(target === 'approach' ? [state.intentText.trim()] : []),
  ]);
}
function rememberAction(state: ComposerState): Record<string, ActionBranch> {
  // Only a visited child makes a parent worth restoring. Carried fragments and
  // typing intermediate action characters must not grow the draft indefinitely.
  if (
    !state.actionText.trim() ||
    ((!state.intentText.trim() || state.intentNeedsConfirmation) &&
      !state.intentHints?.length)
  )
    return state.branches;
  return { ...state.branches, [actionKey(state)]: branchSelection(state) };
}
function carriedApproach(state: ApproachSelection): ApproachSelection {
  return state.approachSource === 'custom' && state.approachText.trim()
    ? { ...approachSelection(state), approachNeedsConfirmation: true }
    : emptyApproach();
}
function switchMode(state: ComposerState, mode: AuthoringMode): ComposerState {
  if (state.mode === mode) return state;
  if (mode === 'write') {
    const manual = state.manualBuffer ?? {
      finalText: state.finalText,
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
    };
    return {
      ...state,
      mode,
      builderBuffer: {
        finalText: state.finalText,
        moveType: state.moveType,
        authoringOrigin: state.authoringOrigin,
        pending: state.pending,
      },
      ...manual,
      manualBuffer: manual,
      detached: true,
      pending: false,
    };
  }
  const builder = state.builderBuffer ?? {
    finalText: composePrompt(
      state.actionText,
      state.intentText,
      state.approachText,
    ),
    moveType: state.actionText ? state.moveType : null,
    authoringOrigin: 'unknown' as const,
    pending: true,
  };
  return refreshBuilder({
    ...state,
    mode,
    manualBuffer: {
      finalText: state.finalText,
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
    },
    ...builder,
    builderBuffer: null,
    ...(state.builderResetRequired ? emptyType() : {}),
    builderResetRequired: false,
    detached: false,
  });
}
function applyChange(
  current: ComposerState,
  change: BuilderChange,
): ComposerState {
  const state = switchMode(current, 'build');
  let next = {
    ...state,
    revision: current.revision + 1,
    replacement: null,
    undo: null,
  };
  if (change.type === 'action') {
    const moveType = change.moveType ?? state.moveType;
    const changed =
      moveType !== state.moveType ||
      change.id !== state.actionId ||
      change.text.trim() !== state.actionText.trim();
    const branches = changed ? rememberAction(state) : state.branches;
    const parent = {
      ...state,
      moveType,
      actionId: change.id,
      actionText: change.text,
    };
    const restored = changed ? branches[actionKey(parent)] : undefined;
    const child =
      restored ??
      (changed
        ? {
            ...emptyBranch(),
            ...carriedApproach(state),
            ...(state.intentSource === 'custom' && state.intentText.trim()
              ? {
                  intentText: state.intentText,
                  intentSource: 'custom' as const,
                  intentNeedsConfirmation: true,
                }
              : {}),
          }
        : branchSelection(state));
    const intentHints =
      restored?.intentHints ??
      change.intentHints ??
      (changed ? [] : state.intentHints);
    next = {
      ...next,
      ...child,
      branches,
      typeSelections:
        moveType !== state.moveType
          ? rememberType(state)
          : state.typeSelections,
      moveType,
      actionText: change.text,
      actionId: change.id,
      actionOrigin: change.id ? 'builder' : 'manual',
      intentHints,
      approachHints:
        restored?.approachHints ??
        intentHints?.find(
          (hint) =>
            hint.id === child.intentId && hint.text === child.intentText,
        )?.approachHints ??
        [],
    };
  } else if (change.type === 'intent') {
    const changed =
      change.id !== state.intentId ||
      change.text.trim() !== state.intentText.trim();
    const intentBranches =
      changed &&
      state.intentText.trim() &&
      ((state.approachText.trim() && !state.approachNeedsConfirmation) ||
        state.approachHints?.length)
        ? {
            ...state.intentBranches,
            [intentKey(state)]: approachSelection(state),
          }
        : state.intentBranches;
    const key = intentKey({ intentId: change.id, intentText: change.text });
    const restoredApproach = changed ? intentBranches[key] : undefined;
    const approach = changed
      ? (restoredApproach ?? carriedApproach(state))
      : approachSelection(state);
    next = {
      ...next,
      ...approach,
      intentBranches,
      intentText: change.text,
      intentId: change.id,
      intentSource: change.id ? 'suggestion' : 'custom',
      intentNeedsConfirmation: false,
      approachHints:
        restoredApproach?.approachHints ??
        (!changed ? state.approachHints : undefined) ??
        change.approachHints ??
        state.intentHints?.find(
          (hint) => hint.id === change.id && hint.text === change.text,
        )?.approachHints ??
        [],
    };
  } else {
    next = {
      ...next,
      approachText: change.text,
      approachId: change.id,
      approachSource: change.id ? 'suggestion' : 'custom',
      approachNeedsConfirmation: false,
    };
  }
  return refreshBuilder(next);
}
export function composerReducer(
  state: ComposerState,
  event: ComposerEvent,
): ComposerState {
  switch (event.type) {
    case 'restore':
      return {
        ...createComposerState(),
        ...event.snapshot,
        revision: state.revision + 1,
        replacement: null,
        undo: null,
      };
    case 'mode': {
      const next = switchMode(state, event.mode);
      return next === state ? state : { ...next, revision: state.revision + 1 };
    }
    case 'edit': {
      const next = switchMode(state, 'write');
      const authoringOrigin =
        next.authoringOrigin === 'builder' || next.authoringOrigin === 'mixed'
          ? 'mixed'
          : 'manual';
      return {
        ...next,
        finalText: event.text,
        authoringOrigin,
        manualBuffer: {
          finalText: event.text,
          moveType: next.moveType,
          authoringOrigin,
        },
        pending: false,
        detached: true,
        revision: state.revision + 1,
      };
    }
    case 'move-type': {
      if (state.moveType === event.moveType) return state;
      if (state.mode === 'write')
        return {
          ...state,
          moveType: event.moveType,
          revision: state.revision + 1,
          manualBuffer: {
            finalText: state.finalText,
            moveType: event.moveType,
            authoringOrigin: state.authoringOrigin,
          },
        };
      const typeSelections = rememberType(state);
      return refreshBuilder({
        ...state,
        ...(event.moveType
          ? (typeSelections[event.moveType] ?? emptyType())
          : emptyType()),
        branches: rememberAction(state),
        typeSelections,
        moveType: event.moveType,
        revision: state.revision + 1,
      });
    }
    case 'change':
      return applyChange(state, event.change);
    case 'confirm-fragment':
      return state.mode !== 'build'
        ? state
        : refreshBuilder({
            ...state,
            ...(event.field === 'intent'
              ? { intentNeedsConfirmation: false }
              : { approachNeedsConfirmation: false }),
            revision: state.revision + 1,
          });
    case 'hints':
      if (
        state.mode !== 'build' ||
        composerHintsContext(state, event.target) !== event.contextKey
      )
        return state;
      return event.target === 'intent'
        ? { ...state, intentHints: event.hints }
        : {
            ...state,
            approachHints: event.hints.map(({ id, text }) => ({ id, text })),
          };
    case 'context': {
      if (state.contextKey === event.contextKey) return state;
      if (state.contextKey === null)
        return { ...state, contextKey: event.contextKey };
      const next = {
        ...state,
        contextKey: event.contextKey,
        branches: {},
        typeSelections: {},
        intentBranches: {},
        actionId: null,
        intentId: null,
        approachId: null,
        intentHints: [],
        approachHints: [],
        intentNeedsConfirmation: Boolean(state.intentText.trim()),
        approachNeedsConfirmation: Boolean(state.approachText.trim()),
        revision: state.revision + 1,
      };
      return state.mode === 'build' ? refreshBuilder(next) : next;
    }
    case 'confirm':
    case 'cancel':
    case 'undo':
      return state;
  }
}
export function composerCanSubmit(state: ComposerSnapshot): boolean {
  if (state.pending || validatePromptText(state.finalText)) return false;
  if (state.mode === 'write') return true;
  return (
    !state.detached &&
    !state.intentNeedsConfirmation &&
    !state.approachNeedsConfirmation &&
    composerFragmentValid(state.actionText, 'action') &&
    composerFragmentValid(state.intentText, 'intent') &&
    composerFragmentValid(state.approachText, 'approach') &&
    state.finalText ===
      composePrompt(state.actionText, state.intentText, state.approachText)
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const readMove = (
  value: unknown,
  fallback: MoveType | null = null,
): MoveType | null =>
  value === 'attack' || value === 'defense' || value === 'finisher'
    ? value
    : value === null
      ? null
      : fallback;
const readOrigin = (value: unknown): AuthoringOrigin =>
  value === 'builder' || value === 'manual' || value === 'mixed'
    ? value
    : 'unknown';
const readSource = (value: unknown): FragmentSource =>
  value === 'custom' || value === 'suggestion' ? value : null;
const readId = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
function readHints(value: unknown): IntentHint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    const hint = record(item);
    return hint && typeof hint.id === 'string' && typeof hint.text === 'string'
      ? [
          {
            id: hint.id,
            text: hint.text,
            ...(Array.isArray(hint.approachHints)
              ? {
                  approachHints: hint.approachHints
                    .slice(0, 3)
                    .flatMap((child) => {
                      const entry = record(child);
                      return entry &&
                        typeof entry.id === 'string' &&
                        typeof entry.text === 'string'
                        ? [{ id: entry.id, text: entry.text }]
                        : [];
                    }),
                }
              : {}),
          },
        ]
      : [];
  });
}
function readApproach(value: unknown): ApproachSelection {
  const data = record(value) ?? {};
  return {
    approachHints: readHints(data.approachHints).map(({ id, text }) => ({
      id,
      text,
    })),
    approachText:
      typeof data.approachText === 'string' ? data.approachText : '',
    approachId: readId(data.approachId),
    approachSource: readSource(data.approachSource),
    approachNeedsConfirmation: data.approachNeedsConfirmation === true,
  };
}
function readBranch(value: unknown): ActionBranch {
  const data = record(value) ?? {};
  const intentBranches: Record<string, ApproachSelection> = {};
  for (const [key, child] of Object.entries(
    record(data.intentBranches) ?? {},
  )) {
    if (record(child))
      Object.defineProperty(intentBranches, key, {
        value: readApproach(child),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return {
    ...readApproach(data),
    intentHints: readHints(data.intentHints),
    intentText: typeof data.intentText === 'string' ? data.intentText : '',
    intentId: readId(data.intentId),
    intentSource: readSource(data.intentSource),
    intentNeedsConfirmation: data.intentNeedsConfirmation === true,
    intentBranches,
  };
}
function readTextBuffer(value: unknown): TextBuffer | null {
  const data = record(value);
  return data && typeof data.finalText === 'string'
    ? {
        finalText: data.finalText,
        moveType: readMove(data.moveType),
        authoringOrigin: readOrigin(data.authoringOrigin),
      }
    : null;
}
/** Read only allowlisted state. Legacy prose is kept exactly, never parsed into an approach. */
export function readComposerSnapshot(
  value: unknown,
  text: string,
  legacyMoveType: MoveType | null = null,
  draftVersion = 5,
): ComposerDraftSnapshot | null {
  const data = record(value);
  if (
    !data ||
    !['build', 'write'].includes(String(data.mode)) ||
    typeof data.actionText !== 'string' ||
    typeof data.intentText !== 'string' ||
    typeof data.detached !== 'boolean' ||
    typeof data.pending !== 'boolean' ||
    ![data.actionId, data.intentId, data.contextKey].every(
      (item) => item === null || typeof item === 'string',
    )
  )
    return null;
  const branches: Record<string, ActionBranch> = {};
  if (draftVersion >= 4)
    for (const [key, branch] of Object.entries(record(data.branches) ?? {})) {
      if (record(branch))
        Object.defineProperty(branches, key, {
          value: readBranch(branch),
          enumerable: true,
          configurable: true,
          writable: true,
        });
    }
  const oldComplete =
    (draftVersion < 4 || data.compositionVersion !== 3) &&
    !data.pending &&
    Boolean(text.trim());
  const customBuilder =
    draftVersion < 5 &&
    ((data.actionText.trim() &&
      (data.actionOrigin === 'manual' || !data.actionId)) ||
      (data.intentText.trim() &&
        (data.intentSource === 'custom' || !data.intentId)) ||
      (typeof data.approachText === 'string' &&
        data.approachText.trim() &&
        (data.approachSource === 'custom' || !data.approachId)));
  const mode: AuthoringMode =
    oldComplete || customBuilder ? 'write' : (data.mode as AuthoringMode);
  const builderData = record(data.builderBuffer);
  const builderText = readTextBuffer(builderData);
  const typeSelections: ComposerState['typeSelections'] = {};
  for (const move of ['attack', 'defense', 'finisher'] as const) {
    const selection = record(record(data.typeSelections)?.[move]);
    if (selection && typeof selection.actionText === 'string')
      typeSelections[move] = {
        ...readBranch(selection),
        actionText: selection.actionText,
        actionId: readId(selection.actionId),
        actionOrigin:
          selection.actionOrigin === 'builder' ||
          selection.actionOrigin === 'manual'
            ? selection.actionOrigin
            : 'unknown',
      };
  }
  const state: ComposerState = {
    ...createComposerState(mode),
    ...readBranch(data),
    mode,
    moveType: readMove(data.moveType, legacyMoveType),
    authoringOrigin: readOrigin(data.authoringOrigin),
    actionOrigin:
      data.actionOrigin === 'builder' || data.actionOrigin === 'manual'
        ? data.actionOrigin
        : 'unknown',
    finalText: text,
    actionText: data.actionText,
    actionId: readId(data.actionId),
    detached: mode === 'write',
    pending: mode === 'write' ? false : data.pending,
    contextKey:
      typeof data.contextKey === 'string'
        ? data.contextKey.replace(/^(\d+):(attack|defense|finisher):/, '$1:')
        : null,
    intentHints: readHints(data.intentHints),
    approachHints: readHints(data.approachHints),
    branches,
    manualBuffer: readTextBuffer(data.manualBuffer),
    recoveredManualBuffer: readTextBuffer(data.recoveredManualBuffer),
    legacyBuilderBuffer: readTextBuffer(data.legacyBuilderBuffer),
    builderResetRequired: data.builderResetRequired === true,
    typeSelections,
    builderBuffer: builderText
      ? { ...builderText, pending: builderData?.pending === true }
      : null,
    revision:
      typeof data.revision === 'number' && Number.isSafeInteger(data.revision)
        ? data.revision
        : 0,
  };
  if (oldComplete) {
    state.manualBuffer = {
      finalText: text,
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
    };
    state.builderBuffer = {
      finalText: composePrompt(state.actionText, state.intentText),
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
      pending: true,
    };
  }
  if (customBuilder) {
    if (data.mode === 'build') state.recoveredManualBuffer = state.manualBuffer;
    state.manualBuffer = {
      finalText: text,
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
    };
    state.legacyBuilderBuffer =
      data.mode === 'write' && builderText
        ? builderText
        : { ...state.manualBuffer };
    state.builderBuffer = {
      finalText: '',
      moveType: state.legacyBuilderBuffer.moveType,
      authoringOrigin: 'unknown',
      pending: true,
    };
    state.builderResetRequired = true;
  }
  // A corrupt flag may never unlock stale prose. Keep the enclosing text for
  // recovery while normalizing the actual stage from semantic prerequisites.
  if (mode === 'build')
    state.pending =
      refreshBuilder(state).pending ||
      state.finalText !==
        composePrompt(state.actionText, state.intentText, state.approachText);
  return composerSnapshot(state);
}
