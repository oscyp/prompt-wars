import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  generatePortrait,
  readInitialPortraitRecovery,
  reconcileInitialPortrait,
} from '@/utils/characters';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));
let state: string | null;
const input = {
  characterId: 'fighter',
  archetype: 'strategist' as const,
  mode: 'guided' as const,
  freeOnly: true,
};
beforeEach(() => {
  const storage = new Map<string, string>();
  state = 'reserved';
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => storage.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      storage.set(key, value);
    },
  );
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(
    async (key: string) => {
      storage.delete(key);
    },
  );
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: 'owner' } },
    error: null,
  });
  (supabase.from as jest.Mock).mockImplementation(() => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({
        data: state ? { status: state, request_id: 'last-free' } : null,
        error: null,
      }),
    };
    return query;
  });
  (supabase.storage.from as jest.Mock).mockReturnValue({
    createSignedUrl: async () => ({
      data: { signedUrl: 'https://asset.test/portrait' },
      error: null,
    }),
  });
  (invokeAuthenticatedFunction as jest.Mock).mockReset();
});
test('lost response reuses the durable reservation and always requests free-only from editor', async () => {
  (invokeAuthenticatedFunction as jest.Mock).mockRejectedValueOnce(
    new Error('network'),
  );
  await expect(generatePortrait(input)).rejects.toThrow('network');
  const request = (invokeAuthenticatedFunction as jest.Mock).mock.calls[0][1]
    .request_id;
  state = 'succeeded';
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      portrait_id: 'portrait',
      image_path: 'path',
      free_renders_left: 2,
      credits_spent: 0,
    },
  });
  const result = await generatePortrait(input);
  expect(result.imageUrl).toBe('https://asset.test/portrait');
  expect(
    (invokeAuthenticatedFunction as jest.Mock).mock.calls[1][1],
  ).toMatchObject({ request_id: request, free_only: true });
  await generatePortrait(input);
  expect(
    (invokeAuthenticatedFunction as jest.Mock).mock.calls[2][1].request_id,
  ).not.toBe(request);
});
test('a failed refunded reservation starts a new explicit attempt', async () => {
  (invokeAuthenticatedFunction as jest.Mock).mockRejectedValue(
    new Error('provider failed'),
  );
  await expect(generatePortrait(input)).rejects.toThrow();
  const first = (invokeAuthenticatedFunction as jest.Mock).mock.calls[0][1]
    .request_id;
  state = 'failed';
  await expect(generatePortrait(input)).rejects.toThrow();
  expect(
    (invokeAuthenticatedFunction as jest.Mock).mock.calls[1][1].request_id,
  ).not.toBe(first);
});

test('pending recovery is discovered independently of remaining quota and reconciles the same free request', async () => {
  await AsyncStorage.setItem(
    'prompt-wars:initial-portrait:owner:fighter',
    'last-free',
  );
  expect(await readInitialPortraitRecovery('fighter')).toEqual({
    requestId: 'last-free',
    status: 'reserved',
  });
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    ok: true,
    data: { request: { request_id: 'last-free', status: 'failed' } },
  });
  expect(await reconcileInitialPortrait('fighter', 'last-free')).toEqual({
    requestId: 'last-free',
    status: 'failed',
  });
  expect((invokeAuthenticatedFunction as jest.Mock).mock.calls[0]).toEqual([
    'generate-portrait',
    {
      character_id: 'fighter',
      request_id: 'last-free',
      action: 'status',
      free_only: true,
    },
  ]);
  expect(
    await AsyncStorage.getItem('prompt-wars:initial-portrait:owner:fighter'),
  ).toBeNull();
});
test('failed status check never discards the saved initial request', async () => {
  await AsyncStorage.setItem(
    'prompt-wars:initial-portrait:owner:fighter',
    'last-free',
  );
  (invokeAuthenticatedFunction as jest.Mock).mockRejectedValue(
    new Error('offline'),
  );
  await expect(
    reconcileInitialPortrait('fighter', 'last-free'),
  ).rejects.toThrow('offline');
  expect(
    await AsyncStorage.getItem('prompt-wars:initial-portrait:owner:fighter'),
  ).toBe('last-free');
});

const recoveryKey = 'prompt-wars:initial-portrait:owner:fighter';
function mockRequests(rows: { request_id: string; status: string }[]) {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({
        data:
          rows.find(
            (row) =>
              (!filters.request_id || row.request_id === filters.request_id) &&
              (!filters.status || row.status === filters.status),
          ) ?? null,
        error: null,
      }),
    };
    return query;
  });
}
it.each(['succeeded', 'missing'])(
  'active server request wins over %s local identity',
  async (previous) => {
    await AsyncStorage.setItem(recoveryKey, 'old');
    mockRequests([
      ...(previous === 'succeeded'
        ? [{ request_id: 'old', status: 'succeeded' }]
        : []),
      { request_id: 'third-free', status: 'reserved' },
    ]);
    expect(await readInitialPortraitRecovery('fighter')).toEqual({
      requestId: 'third-free',
      status: 'reserved',
    });
    expect(await AsyncStorage.getItem(recoveryKey)).toBe('third-free');
  },
);
it('stale discovery cannot replace a newer local request', async () => {
  await AsyncStorage.setItem(recoveryKey, 'old');
  (supabase.from as jest.Mock).mockImplementation(() => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => {
        await AsyncStorage.setItem(recoveryKey, 'newer');
        return { data: { request_id: 'old', status: 'reserved' }, error: null };
      },
    };
    return query;
  });
  await expect(readInitialPortraitRecovery('fighter')).rejects.toThrow('newer');
  expect(await AsyncStorage.getItem(recoveryKey)).toBe('newer');
});
it('terminal status does not clear a newer local identity', async () => {
  await AsyncStorage.setItem(recoveryKey, 'old');
  (invokeAuthenticatedFunction as jest.Mock).mockImplementation(async () => {
    await AsyncStorage.setItem(recoveryKey, 'newer');
    return {
      ok: true,
      data: { request: { request_id: 'old', status: 'succeeded' } },
    };
  });
  await reconcileInitialPortrait('fighter', 'old');
  expect(await AsyncStorage.getItem(recoveryKey)).toBe('newer');
});
it('a completed generate response does not clear a newer local identity', async () => {
  (invokeAuthenticatedFunction as jest.Mock).mockImplementation(async () => {
    await AsyncStorage.setItem(recoveryKey, 'newer');
    return { ok: true, data: { portrait_id: 'portrait', image_path: 'path' } };
  });
  await generatePortrait(input);
  expect(await AsyncStorage.getItem(recoveryKey)).toBe('newer');
});

it('missing local row with no active work clears only its own identity', async () => {
  await AsyncStorage.setItem(recoveryKey, 'missing');
  mockRequests([]);
  expect(await readInitialPortraitRecovery('fighter')).toBeNull();
  expect(await AsyncStorage.getItem(recoveryKey)).toBeNull();
});
it('a failed authoritative discovery preserves the existing reference', async () => {
  await AsyncStorage.setItem(recoveryKey, 'old');
  (supabase.from as jest.Mock).mockImplementation(() => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: null, error: new Error('offline') }),
    };
    return query;
  });
  await expect(readInitialPortraitRecovery('fighter')).rejects.toThrow(
    'Could not check',
  );
  expect(await AsyncStorage.getItem(recoveryKey)).toBe('old');
});
