import type { ComposerSnapshot, ComposerState } from '@/utils/promptComposer';

export type ComposerDraftRecoveryKey =
  | 'recoveredManualBuffer'
  | 'legacyBuilderBuffer';
export interface ComposerDraftRecovery {
  key: ComposerDraftRecoveryKey;
  text: string;
  moveType: ComposerSnapshot['moveType'];
  authoringOrigin: ComposerSnapshot['authoringOrigin'];
}
const RECOVERY_KEYS: ComposerDraftRecoveryKey[] = [
  'recoveredManualBuffer',
  'legacyBuilderBuffer',
];

/** Migration archives are explicit choices in freestyle, never hidden builder inputs. */
export function composerDraftRecoveries(
  state: ComposerSnapshot,
): ComposerDraftRecovery[] {
  if (state.mode !== 'write') return [];
  const seen = new Set([JSON.stringify([state.finalText, state.moveType])]);
  return RECOVERY_KEYS.flatMap((key) => {
    const buffer = state[key];
    if (!buffer?.finalText.trim()) return [];
    const identity = JSON.stringify([buffer.finalText, buffer.moveType]);
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [
      {
        key,
        text: buffer.finalText,
        moveType: buffer.moveType,
        authoringOrigin: buffer.authoringOrigin,
      },
    ];
  });
}

/** Swap, rather than discard, so every explicit recovery can itself be reversed. */
export function restoreComposerDraftRecovery(
  state: ComposerState,
  key: ComposerDraftRecoveryKey,
): ComposerState {
  const choice = composerDraftRecoveries(state).find(
    (item) => item.key === key,
  );
  if (!choice) return state;
  const restored = {
    finalText: choice.text,
    moveType: choice.moveType,
    authoringOrigin: choice.authoringOrigin,
  };
  return {
    ...state,
    ...restored,
    manualBuffer: restored,
    [key]: {
      finalText: state.finalText,
      moveType: state.moveType,
      authoringOrigin: state.authoringOrigin,
    },
    mode: 'write',
    pending: false,
    detached: true,
    revision: state.revision + 1,
    replacement: null,
    undo: null,
  };
}
