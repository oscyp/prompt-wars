import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MoveType } from '@/utils/battles';
import {
  readComposerSnapshot,
  type ComposerDraftSnapshot,
} from '@/utils/promptComposer';
import {
  readComposerStep,
  restoreComposerStep,
  type ComposerStep,
} from '@/utils/promptComposerFlow';

export interface DraftScope {
  accountId: string;
  battleId: string;
  round: number;
}
export interface BattleDraft {
  text: string;
  move: MoveType | null;
  editMode: boolean;
  selectedSuggestion: string | null;
  composer?: ComposerDraftSnapshot;
  composerStep?: ComposerStep;
}
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
export function createBattleDraftStore(storage: Storage) {
  const pending = new Map<string, Promise<void>>();
  const key = (s: DraftScope) =>
    `battle-draft:v1:${encodeURIComponent(s.accountId)}:${encodeURIComponent(s.battleId)}:${s.round}`;
  function enqueue(s: DraftScope, work: (key: string) => Promise<void>) {
    const k = key(s);
    const next = (pending.get(k) ?? Promise.resolve())
      .catch(() => {})
      .then(() => work(k));
    pending.set(k, next);
    void next
      .finally(() => {
        if (pending.get(k) === next) pending.delete(k);
      })
      .catch(() => {});
    return next;
  }
  return {
    async read(scope: DraftScope): Promise<BattleDraft | null> {
      await pending.get(key(scope));
      const raw = await storage.getItem(key(scope));
      if (!raw) return null;
      const value = JSON.parse(raw);
      if ([1, 2, 3, 4, 5].includes(value.version) && value.deleted === true) {
        await storage.removeItem(key(scope));
        return null;
      }
      if (
        ![1, 2, 3, 4, 5].includes(value.version) ||
        typeof value.text !== 'string' ||
        typeof value.editMode !== 'boolean' ||
        ![null, 'attack', 'defense', 'finisher'].includes(value.move)
      )
        return null;
      const composer = readComposerSnapshot(
        value.composer,
        value.text,
        value.move,
        value.version,
      );
      const savedStep = readComposerStep(value.composerStep);
      const composerStep = composer
        ? value.version < 5 &&
          composer.mode === 'write' &&
          savedStep !== 'review'
          ? 'write'
          : restoreComposerStep(composer, savedStep)
        : savedStep;
      return {
        text: value.text,
        move: value.move,
        editMode: composer ? composer.mode === 'write' : value.editMode,
        selectedSuggestion:
          typeof value.selectedSuggestion === 'string'
            ? value.selectedSuggestion
            : null,
        ...(composer ? { composer } : {}),
        ...(composerStep ? { composerStep } : {}),
      };
    },
    save: (scope: DraftScope, draft: BattleDraft) => {
      const composerStep = readComposerStep(draft.composerStep);
      return enqueue(scope, (k) =>
        storage.setItem(
          k,
          JSON.stringify({
            version: 5,
            text: draft.text,
            move: draft.move,
            editMode: draft.editMode,
            selectedSuggestion: draft.selectedSuggestion,
            ...(draft.composer ? { composer: draft.composer } : {}),
            ...(composerStep ? { composerStep } : {}),
          }),
        ),
      );
    },
    clear: (scope: DraftScope) =>
      enqueue(scope, async (k) => {
        try {
          await storage.removeItem(k);
        } catch (error) {
          // Preserve delete intent across process restart when removal alone fails.
          // This marker contains no prompt text and read retries physical removal.
          await storage
            .setItem(k, JSON.stringify({ version: 5, deleted: true }))
            .catch(() => {});
          throw error;
        }
      }),
    flush: async (scope: DraftScope) => {
      await pending.get(key(scope));
    },
  };
}
export const battleDrafts = createBattleDraftStore(AsyncStorage);
