import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MoveType } from '@/utils/battles';

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
      if (value.version === 1 && value.deleted === true) {
        await storage.removeItem(key(scope));
        return null;
      }
      if (
        value.version !== 1 ||
        typeof value.text !== 'string' ||
        typeof value.editMode !== 'boolean' ||
        ![null, 'attack', 'defense', 'finisher'].includes(value.move)
      )
        return null;
      return {
        text: value.text,
        move: value.move,
        editMode: value.editMode,
        selectedSuggestion:
          typeof value.selectedSuggestion === 'string'
            ? value.selectedSuggestion
            : null,
      };
    },
    save: (scope: DraftScope, draft: BattleDraft) =>
      enqueue(scope, (k) =>
        storage.setItem(k, JSON.stringify({ version: 1, ...draft })),
      ),
    clear: (scope: DraftScope) =>
      enqueue(scope, async (k) => {
        try {
          await storage.removeItem(k);
        } catch (error) {
          // Preserve delete intent across process restart when removal alone fails.
          // This marker contains no prompt text and read retries physical removal.
          await storage
            .setItem(k, JSON.stringify({ version: 1, deleted: true }))
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
