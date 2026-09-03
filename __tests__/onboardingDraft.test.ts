import AsyncStorage from '@react-native-async-storage/async-storage';
import { BALANCED_STATS } from '@/utils/statAllocation';
import {
  DRAFT_STORAGE_VERSION,
  INITIAL_DRAFT,
  clearDraft,
  draftStorageKey,
  loadDraft,
  saveDraft,
  toPersistedDraft,
  type Draft,
} from '@/utils/onboardingDraft';

const setItem = AsyncStorage.setItem as jest.Mock;
const getItem = AsyncStorage.getItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

const USER = 'user-1';

const DRAFT: Draft = {
  ...INITIAL_DRAFT,
  name: 'Kestrel',
  archetype: 'mystic',
  path: 'prompt',
  prompt: 'A cyberpunk monk with a brass kettle',
  characterId: 'char-1',
  portrait: {
    jobId: 'job-1',
    portraitId: 'portrait-1',
    imageUrl: 'https://signed.example/portrait.png?token=abc',
    seed: '42',
    status: 'succeeded',
    freeRendersLeft: 2,
    avatarImageUrl: 'https://signed.example/avatar.png?token=def',
  },
};

beforeEach(() => {
  setItem.mockClear();
  getItem.mockReset();
  getItem.mockResolvedValue(null);
  removeItem.mockClear();
});

describe('toPersistedDraft', () => {
  it('drops signed image URLs but keeps the portrait id', () => {
    const persisted = toPersistedDraft(DRAFT);
    expect(persisted.portrait?.portraitId).toBe('portrait-1');
    expect(persisted.portrait?.imageUrl).toBe('');
    expect(persisted.portrait?.avatarImageUrl).toBeNull();
    expect(persisted.characterId).toBe('char-1');
  });

  it('is a no-op without a portrait', () => {
    expect(toPersistedDraft(INITIAL_DRAFT)).toBe(INITIAL_DRAFT);
  });
});

describe('saveDraft / loadDraft', () => {
  it('is on version 2: the stats step renumbered every later step', () => {
    expect(DRAFT_STORAGE_VERSION).toBe(2);
  });

  it('writes a versioned envelope under a per-user key', async () => {
    await saveDraft(USER, 4, DRAFT);
    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, raw] = setItem.mock.calls[0];
    expect(key).toBe(draftStorageKey(USER));
    const envelope = JSON.parse(raw);
    expect(envelope.version).toBe(DRAFT_STORAGE_VERSION);
    expect(envelope.step).toBe(4);
    expect(envelope.draft.name).toBe('Kestrel');
    expect(envelope.draft.portrait.imageUrl).toBe('');
    expect(raw).not.toContain('token=abc');
  });

  it('round-trips through storage and fills in newer defaults', async () => {
    await saveDraft(USER, 6, DRAFT);
    const raw = setItem.mock.calls[0][1] as string;
    // Simulate a draft written before `itemSkipped` and `stats` existed.
    const stored = JSON.parse(raw);
    delete stored.draft.itemSkipped;
    delete stored.draft.stats;
    getItem.mockResolvedValue(JSON.stringify(stored));

    const saved = await loadDraft(USER);
    expect(saved).not.toBeNull();
    expect(saved?.step).toBe(6);
    expect(saved?.draft.name).toBe('Kestrel');
    expect(saved?.draft.itemSkipped).toBe(false);
    expect(saved?.draft.stats).toEqual(BALANCED_STATS);
    expect(saved?.draft.portrait?.portraitId).toBe('portrait-1');
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadDraft(USER)).toBeNull();
  });

  it('discards and removes a draft written by another version', async () => {
    getItem.mockResolvedValue(
      JSON.stringify({
        version: DRAFT_STORAGE_VERSION + 1,
        savedAt: new Date().toISOString(),
        step: 3,
        draft: { ...INITIAL_DRAFT, name: 'Old' },
      }),
    );
    expect(await loadDraft(USER)).toBeNull();
    expect(removeItem).toHaveBeenCalledWith(draftStorageKey(USER));
  });

  it('survives corrupt storage', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getItem.mockResolvedValue('{not json');
    expect(await loadDraft(USER)).toBeNull();
    getItem.mockResolvedValue(JSON.stringify({ version: 1 }));
    expect(await loadDraft(USER)).toBeNull();
    warn.mockRestore();
  });

  it('never throws when storage fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(saveDraft(USER, 1, DRAFT)).resolves.toBeUndefined();
    getItem.mockRejectedValueOnce(new Error('io'));
    await expect(loadDraft(USER)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('clearDraft', () => {
  it('removes the per-user key', async () => {
    await clearDraft(USER);
    expect(removeItem).toHaveBeenCalledWith(draftStorageKey(USER));
  });

  it('keys drafts by user so accounts do not share one', () => {
    expect(draftStorageKey('a')).not.toBe(draftStorageKey('b'));
  });
});
