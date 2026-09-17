import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DraftKey,
  DraftSection,
  DraftValues,
} from '@/hooks/useCharacterEditDraft';

export type CharacterEditMode = 'guided' | 'prompt';
export interface CharacterEditDraftScope {
  accountId: string;
  characterId: string;
}
export interface CharacterEditDraft {
  values: DraftValues;
  baseline: DraftValues;
  /** Successful writes that the character subscription has not observed yet. */
  acknowledged: Partial<
    Record<DraftKey, { value: string | null; previous: (string | null)[] }>
  >;
  activeMode: CharacterEditMode;
  writtenText: string;
  section: DraftSection;
  scrollPositions: Record<DraftSection, number>;
  expandedGroups: Record<string, boolean>;
}

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
const fields: DraftKey[] = [
  'name',
  'archetype',
  'battleCry',
  'signatureColor',
  'artStyle',
  'portraitPromptRaw',
  'palette',
  'vibe',
  'silhouette',
  'era',
  'expression',
  'signatureItemId',
];
const sections: DraftSection[] = ['identity', 'look', 'gear'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isValue = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Allowlist local editing data: never serialize a character row or media URLs. */
function draftValues(value: unknown): DraftValues {
  if (!isRecord(value)) throw new Error('Invalid character draft values');
  const result: DraftValues = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (!isValue(value[key]))
        throw new Error('Invalid character draft field');
      result[key] = value[key];
    }
  }
  return result;
}

function snapshot(value: unknown): CharacterEditDraft {
  if (
    !isRecord(value) ||
    !['guided', 'prompt'].includes(String(value.activeMode)) ||
    typeof value.writtenText !== 'string' ||
    !sections.includes(value.section as DraftSection)
  ) {
    throw new Error('Invalid character draft');
  }
  const acknowledged: CharacterEditDraft['acknowledged'] = {};
  if (isRecord(value.acknowledged)) {
    for (const key of fields) {
      const item = value.acknowledged[key];
      if (
        isRecord(item) &&
        isValue(item.value) &&
        Array.isArray(item.previous) &&
        item.previous.every(isValue)
      ) {
        acknowledged[key] = { value: item.value, previous: [...item.previous] };
      }
    }
  }
  const scrollPositions = { identity: 0, look: 0, gear: 0 };
  if (isRecord(value.scrollPositions)) {
    for (const section of sections) {
      const position = value.scrollPositions[section];
      if (
        typeof position === 'number' &&
        Number.isFinite(position) &&
        position >= 0
      )
        scrollPositions[section] = position;
    }
  }
  const expandedGroups: Record<string, boolean> = {};
  if (isRecord(value.expandedGroups)) {
    for (const [key, expanded] of Object.entries(value.expandedGroups)) {
      if (/^[a-zA-Z0-9_-]+$/.test(key) && typeof expanded === 'boolean')
        expandedGroups[key] = expanded;
    }
  }
  return {
    values: draftValues(value.values),
    baseline: draftValues(value.baseline),
    acknowledged,
    activeMode: value.activeMode as CharacterEditMode,
    writtenText: value.writtenText,
    section: value.section as DraftSection,
    scrollPositions,
    expandedGroups,
  };
}

export function createCharacterEditDraftStore(storage: Storage) {
  const pending = new Map<string, Promise<unknown>>();
  const key = (scope: CharacterEditDraftScope) =>
    `character-edit-draft:v1:${encodeURIComponent(scope.accountId)}:${encodeURIComponent(scope.characterId)}`;
  function enqueue<T>(
    scope: CharacterEditDraftScope,
    work: (key: string) => Promise<T>,
  ): Promise<T> {
    const storageKey = key(scope);
    const next = (pending.get(storageKey) ?? Promise.resolve())
      .catch(() => {})
      .then(() => work(storageKey));
    pending.set(storageKey, next);
    void next
      .finally(() => {
        if (pending.get(storageKey) === next) pending.delete(storageKey);
      })
      .catch(() => {});
    return next;
  }
  return {
    read: (
      scope: CharacterEditDraftScope,
    ): Promise<CharacterEditDraft | null> =>
      enqueue(scope, async (storageKey) => {
        const raw = await storage.getItem(storageKey);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value) || value.version !== 1)
          throw new Error('Unsupported character draft');
        if (value.deleted === true) {
          await storage.removeItem(storageKey).catch(() => {});
          return null;
        }
        return snapshot(value);
      }),
    save: (scope: CharacterEditDraftScope, draft: CharacterEditDraft) => {
      // Capture before entering the queue, so later mutations cannot alter an older write.
      const raw = JSON.stringify({ version: 1, ...snapshot(draft) });
      return enqueue(scope, (storageKey) => storage.setItem(storageKey, raw));
    },
    clear: (scope: CharacterEditDraftScope) =>
      enqueue(scope, async (storageKey) => {
        try {
          await storage.removeItem(storageKey);
        } catch (error) {
          // If removal fails, persist deletion intent without retaining any written text.
          await storage
            .setItem(storageKey, JSON.stringify({ version: 1, deleted: true }))
            .catch(() => {});
          throw error;
        }
      }),
    flush: async (scope: CharacterEditDraftScope) => {
      await pending.get(key(scope));
    },
  };
}

export const characterEditDrafts = createCharacterEditDraftStore(AsyncStorage);
