import AsyncStorage from '@react-native-async-storage/async-storage';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import { listPortraitHistory, renderLook } from '@/utils/characters';
import { EditError } from '@/utils/editErrors';
import {
  checkPortraitOperation,
  dismissPortraitOperation,
  readPortraitOperation,
  startPortraitOperation,
} from '@/utils/portraitOperations';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

const invoke = invokeAuthenticatedFunction as jest.Mock;
const from = supabase.from as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;
const sign = jest.fn();
const tables: Record<string, { data: unknown; error: unknown }> = {};
const filters: [string, string, unknown][] = [];
const success = {
  ok: true,
  data: {
    job_id: 'job',
    portrait_id: 'portrait',
    image_path: 'fighter.png',
    avatar_portrait_id: 'avatar',
    avatar_image_path: 'avatar.png',
    credits_spent: 2,
  },
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  for (const key of Object.keys(tables)) delete tables[key];
  filters.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null });
  invoke.mockResolvedValue(success);
  sign.mockResolvedValue({
    data: { signedUrl: 'https://signed/image' },
    error: null,
  });
  (supabase.storage.from as jest.Mock).mockReturnValue({
    createSignedUrl: sign,
  });
  from.mockImplementation((table: string) => {
    const query: any = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (field: string, value: unknown) => {
        filters.push([table, field, value]);
        return query;
      },
      neq: () => query,
      like: () => query,
      in: () => query,
      maybeSingle: () =>
        Promise.resolve(tables[table] ?? { data: null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(tables[table] ?? { data: [], error: null }).then(
          resolve,
        ),
    };
    return query;
  });
});

it('durably records account, fighter, mode and stable key before the first paid dispatch', async () => {
  invoke.mockImplementation(async (_name, body) => {
    expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
      accountId: 'alice',
      characterId: 'fighter',
      mode: 'random',
      requestKey: body.idempotency_key,
      status: 'pending',
    });
    return success;
  });
  const outcome = await startPortraitOperation('alice', 'fighter', 'random');
  expect(outcome.operation.status).toBe('succeeded');
  expect(outcome.result?.portraitId).toBe('portrait');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(await readPortraitOperation('bob', 'fighter')).toBeNull();
});

it('does not dispatch if the durable reservation cannot be written', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('disk full'),
  );
  await expect(
    startPortraitOperation('alice', 'fighter', 'render'),
  ).rejects.toThrow('disk full');
  expect(invoke).not.toHaveBeenCalled();
});

it('retains a dropped response and repeated status checks never dispatch generation', async () => {
  invoke.mockRejectedValueOnce(new Error('network lost'));
  const initial = await startPortraitOperation('alice', 'fighter', 'render');
  expect(initial.operation.status).toBe('pending');
  const checked = await checkPortraitOperation(initial.operation);
  expect(checked.operation.status).toBe('pending');
  expect(await dismissPortraitOperation(checked.operation)).toBe(false);
  await checkPortraitOperation(checked.operation);
  await expect(
    startPortraitOperation('alice', 'fighter', 'random'),
  ).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect((await readPortraitOperation('alice', 'fighter'))?.requestKey).toBe(
    initial.operation.requestKey,
  );
});

it('resolves a lost response from its exact audit key without generation', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  tables.character_edits = {
    data: {
      after: {
        portrait_id: 'recovered',
        avatar_portrait_id: 'avatar',
        mode: 'render',
      },
      credits_spent: 2,
    },
    error: null,
  };
  tables.character_portraits = {
    data: {
      id: 'recovered',
      image_path: 'result.png',
      moderation_status: 'approved',
    },
    error: null,
  };
  const checked = await checkPortraitOperation(operation);
  expect(checked.operation).toMatchObject({
    status: 'succeeded',
    portraitId: 'recovered',
    creditsSpent: 2,
  });
  expect(checked.result?.portraitId).toBe('recovered');
  expect(filters).toContainEqual([
    'character_edits',
    'idempotency_key',
    `render_alice_fighter_${operation.requestKey}`,
  ]);
  expect(filters).toContainEqual(['character_edits', 'profile_id', 'alice']);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('recovers the fighter while its avatar is still running before the audit exists', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  const base = `render_alice_fighter_${operation.requestKey}`;
  tables.portrait_jobs = {
    data: [
      {
        id: 'fighter-job',
        status: 'succeeded',
        result_portrait_id: 'recovered',
        idempotency_key: `${base}:fighter`,
        seed: 's',
      },
      {
        id: 'avatar-job',
        status: 'running',
        idempotency_key: `${base}:avatar`,
      },
    ],
    error: null,
  };
  tables.character_portraits = {
    data: {
      id: 'recovered',
      image_path: 'result.png',
      moderation_status: 'approved',
    },
    error: null,
  };
  const checked = await checkPortraitOperation(operation);
  expect(checked.operation).toMatchObject({
    status: 'pending',
    jobId: 'fighter-job',
    portraitId: 'recovered',
    avatarJobId: 'avatar-job',
    avatarPending: true,
  });
  expect(checked.result).toBeNull();
  expect(await dismissPortraitOperation(checked.operation)).toBe(false);
  tables.character_edits = {
    data: {
      after: {
        portrait_id: 'recovered',
        avatar_portrait_id: 'avatar',
        mode: 'render',
      },
      credits_spent: 2,
    },
    error: null,
  };
  const published = await checkPortraitOperation(checked.operation);
  expect(published.operation.status).toBe('succeeded');
  expect(published.result?.portraitId).toBe('recovered');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('retains result IDs before a URL failure, then retries media without a second charge', async () => {
  sign.mockImplementation(async () => {
    expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
      jobId: 'job',
      portraitId: 'portrait',
      avatarPortraitId: 'avatar',
      status: 'succeeded',
    });
    return { data: null, error: { message: 'signing offline' } };
  });
  const initial = await startPortraitOperation('alice', 'fighter', 'render');
  expect(initial.operation.status).toBe('succeeded');
  expect(initial.result).toBeNull();
  sign.mockResolvedValue({
    data: { signedUrl: 'https://signed/recovered' },
    error: null,
  });
  tables.character_portraits = {
    data: { image_path: 'fighter.png', moderation_status: 'approved' },
    error: null,
  };
  const checked = await checkPortraitOperation(initial.operation);
  expect(checked.result?.imageUrl).toBe('https://signed/recovered');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('fences a different active account before generation or status reads', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  getUser.mockResolvedValue({ data: { user: { id: 'bob' } }, error: null });
  const calls = from.mock.calls.length;
  await expect(checkPortraitOperation(operation)).rejects.toThrow();
  await expect(
    startPortraitOperation('alice', 'different', 'render'),
  ).rejects.toThrow();
  expect(from).toHaveBeenCalledTimes(calls);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('serializes concurrent reservations so rapid presses only dispatch once', async () => {
  const outcomes = await Promise.allSettled([
    startPortraitOperation('alice', 'fighter', 'render'),
    startPortraitOperation('alice', 'fighter', 'random'),
  ]);
  expect(
    outcomes.filter((outcome) => outcome.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('a status retrieval error retains the pending durable identity', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  tables.character_edits = { data: null, error: { message: 'offline' } };
  await expect(checkPortraitOperation(operation)).rejects.toThrow('offline');
  expect(await readPortraitOperation('alice', 'fighter')).toEqual(operation);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('the render helper preserves a caller request key and exposes raw references before signing', async () => {
  const onReferences = jest.fn();
  sign.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(
    renderLook({
      characterId: 'fighter',
      requestKey: 'stable-key',
      onReferences,
    }),
  ).rejects.toThrow();
  expect(invoke).toHaveBeenCalledWith(
    'regenerate-portrait',
    expect.objectContaining({ idempotency_key: 'stable-key' }),
  );
  expect(onReferences).toHaveBeenCalledWith(
    expect.objectContaining({
      jobId: 'job',
      portraitId: 'portrait',
      avatarPortraitId: 'avatar',
    }),
  );
});

it('history retrieval failures are errors, while signing failures preserve retryable IDs', async () => {
  tables.character_portraits = {
    data: null,
    error: { message: 'history offline' },
  };
  await expect(listPortraitHistory('fighter')).rejects.toThrow(
    'history offline',
  );
  tables.character_portraits = {
    data: [{ id: 'old', image_path: 'old.png', created_at: 'then' }],
    error: null,
  };
  sign.mockResolvedValue({ data: null, error: { message: 'signing offline' } });
  expect(await listPortraitHistory('fighter')).toEqual([
    expect.objectContaining({
      portraitId: 'old',
      imageUrl: null,
      createdAt: 'then',
    }),
  ]);
});

it('a confirmed failed fighter can be acknowledged without a retry or refund claim', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  tables.portrait_jobs = {
    data: [
      {
        id: 'failed-job',
        status: 'failed',
        error_message: 'Provider failed',
        idempotency_key: `render_alice_fighter_${operation.requestKey}:fighter`,
      },
    ],
    error: null,
  };
  const checked = await checkPortraitOperation(operation);
  expect(checked.operation).toMatchObject({
    status: 'failed',
    error: 'Provider failed',
  });
  expect(await dismissPortraitOperation(checked.operation)).toBe(true);
  expect(await readPortraitOperation('alice', 'fighter')).toBeNull();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('does not mistake another request sharing a LIKE prefix for this operation', async () => {
  invoke.mockRejectedValueOnce(new Error('timeout'));
  const { operation } = await startPortraitOperation(
    'alice',
    'fighter',
    'render',
  );
  tables.portrait_jobs = {
    data: [
      {
        id: 'other-job',
        status: 'succeeded',
        result_portrait_id: 'other-image',
        idempotency_key: `render_alice_fighter_${operation.requestKey}-other:fighter`,
      },
    ],
    error: null,
  };
  const checked = await checkPortraitOperation(operation);
  expect(checked.operation.status).toBe('pending');
  expect(checked.operation.portraitId).toBeUndefined();
  expect(sign).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('a delayed old status read cannot replace a newer operation after acknowledgement', async () => {
  const first = await startPortraitOperation('alice', 'fighter', 'render');
  let release!: (value: unknown) => void;
  const readFinished = new Promise((resolve) => {
    release = resolve;
  });
  const originalFrom = from.getMockImplementation()!;
  from.mockImplementation((table) => {
    const query = originalFrom(table);
    if (table === 'character_edits') query.maybeSingle = () => readFinished;
    return query;
  });
  const staleCheck = checkPortraitOperation(first.operation);
  // Let the check capture the old durable identity before replacing it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await dismissPortraitOperation(first.operation)).toBe(true);
  const second = await startPortraitOperation('alice', 'fighter', 'random');
  release({
    data: { after: { portrait_id: 'old-result' }, credits_spent: 2 },
    error: null,
  });
  await expect(staleCheck).rejects.toThrow('different render');
  expect((await readPortraitOperation('alice', 'fighter'))?.requestKey).toBe(
    second.operation.requestKey,
  );
});

it('stores an async job reference before waiting and retains it after timeout', async () => {
  jest.useFakeTimers();
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  (supabase as any).channel = jest.fn(() => channel);
  (supabase as any).removeChannel = jest.fn();
  invoke.mockResolvedValueOnce({ ok: true, data: { job_id: 'async-job' } });
  try {
    const starting = startPortraitOperation('alice', 'fighter', 'render');
    await jest.advanceTimersByTimeAsync(0);
    expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
      jobId: 'async-job',
      status: 'pending',
    });
    await jest.advanceTimersByTimeAsync(120_000);
    const outcome = await starting;
    expect(outcome.operation).toMatchObject({
      jobId: 'async-job',
      status: 'pending',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('keeps only raw references in durable storage, never expiring signed URLs', async () => {
  await startPortraitOperation('alice', 'fighter', 'render', {
    previousFighterId: 'old-fighter',
    previousAvatarId: 'old-avatar',
  });
  const saved = await readPortraitOperation('alice', 'fighter');
  expect(saved).toMatchObject({
    portraitId: 'portrait',
    previousFighterId: 'old-fighter',
    previousAvatarId: 'old-avatar',
  });
  expect(saved).not.toHaveProperty('imageUrl');
  expect(saved).not.toHaveProperty('avatarImageUrl');
});

it('an async fighter success records result IDs but waits for authoritative publication before settling', async () => {
  jest.useFakeTimers();
  let receive!: (payload: unknown) => void;
  const channel: { on: jest.Mock; subscribe: jest.Mock } = {
    on: jest.fn((_event, _filter, handler) => {
      receive = handler;
      return channel;
    }),
    subscribe: jest.fn(() => channel),
  };
  (supabase as any).channel = jest.fn(() => channel);
  (supabase as any).removeChannel = jest.fn();
  invoke.mockResolvedValueOnce({ ok: true, data: { job_id: 'async-job' } });
  tables.character_portraits = {
    data: { image_path: 'result.png', moderation_status: 'approved' },
    error: null,
  };
  try {
    const starting = startPortraitOperation('alice', 'fighter', 'random');
    await jest.advanceTimersByTimeAsync(0);
    receive({
      new: {
        id: 'async-job',
        status: 'succeeded',
        result_portrait_id: 'async-portrait',
        seed: 's',
      },
    });
    await jest.advanceTimersByTimeAsync(0);
    const outcome = await starting;
    expect(outcome.operation).toMatchObject({
      status: 'pending',
      jobId: 'async-job',
      portraitId: 'async-portrait',
    });
    expect(outcome.result).toBeNull();
    expect(await dismissPortraitOperation(outcome.operation)).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('a full fighter response with an explicitly running avatar keeps the operation pending', async () => {
  invoke.mockResolvedValueOnce({
    ok: true,
    data: {
      job_id: 'fighter-job',
      portrait_id: 'fighter-image',
      image_path: 'fighter.png',
      avatar_pending: true,
      avatar_job_id: 'avatar-job',
      avatar_portrait_id: null,
    },
  });
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  expect(outcome.operation).toMatchObject({
    status: 'pending',
    portraitId: 'fighter-image',
    avatarJobId: 'avatar-job',
  });
  expect(outcome.result).toBeNull();
  expect(await dismissPortraitOperation(outcome.operation)).toBe(false);
});

it.each(['battle_locked', 'insufficient_credits'])(
  'a definite %s EditError is durably failed and can be acknowledged',
  async (code) => {
    invoke.mockRejectedValueOnce(new EditError(code, 'Request refused'));
    const outcome = await startPortraitOperation('alice', 'fighter', 'render');
    expect(outcome.operation).toMatchObject({
      status: 'failed',
      error: 'Request refused',
    });
    expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
      status: 'failed',
    });
    const checked = await checkPortraitOperation(outcome.operation);
    expect(checked.operation).toMatchObject({
      status: 'failed',
      error: 'Request refused',
    });
    expect(await dismissPortraitOperation(checked.operation)).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);

it('pre-charge moderation rejection is terminal when its HTTP 422 provenance is preserved', async () => {
  invoke.mockRejectedValueOnce(
    Object.assign(new EditError('moderation_rejected', 'Prompt rejected'), {
      status: 422,
    }),
  );
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  expect(outcome.operation.status).toBe('failed');
  expect(await dismissPortraitOperation(outcome.operation)).toBe(true);
});

it.each([
  ['battle_locked', 409],
  ['insufficient_credits', 402],
  ['moderation_rejected', 422],
])(
  'recognizes the non-2xx function error body for %s',
  async (code, status) => {
    invoke.mockRejectedValueOnce(
      Object.assign(new Error('Request refused'), {
        status,
        body: { ok: false, error: { code, message: 'Request refused' } },
      }),
    );
    const outcome = await startPortraitOperation('alice', 'fighter', 'render');
    expect(outcome.operation.status).toBe('failed');
    expect(await dismissPortraitOperation(outcome.operation)).toBe(true);
  },
);

it.each([
  ['network loss', new Error('network lost')],
  ['timeout', new EditError('timeout', 'Timed out')],
  [
    'moderation without provenance',
    new EditError('moderation_rejected', 'Rejection without charge provenance'),
  ],
  [
    'provider moderation refusal',
    Object.assign(
      new EditError('moderation_rejected', 'Provider safety refused'),
      { status: 502 },
    ),
  ],
  [
    'HTTP 500',
    Object.assign(new Error('Internal failure'), {
      status: 500,
      body: { error: { code: 'insufficient_credits' } },
    }),
  ],
])(
  'keeps ambiguous %s pending and never assumes a refund',
  async (_label, error) => {
    invoke.mockRejectedValueOnce(error);
    const outcome = await startPortraitOperation('alice', 'fighter', 'render');
    expect(outcome.operation.status).toBe('pending');
    expect(await dismissPortraitOperation(outcome.operation)).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);

it('marks a proven account change before dispatch as failed without invoking generation', async () => {
  getUser.mockResolvedValueOnce({
    data: { user: { id: 'alice' } },
    error: null,
  });
  getUser.mockResolvedValueOnce({ data: { user: { id: 'bob' } }, error: null });
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  expect(outcome.operation.status).toBe('failed');
  expect(await dismissPortraitOperation(outcome.operation)).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  ['battle_locked', 'dismiss'],
  ['insufficient_credits', 'check'],
])(
  'recovers a lost terminal write for %s through %s without another charge',
  async (code, recovery) => {
    const write = AsyncStorage.setItem as jest.Mock;
    const originalWrite = write.getMockImplementation()!;
    write
      .mockImplementationOnce(originalWrite)
      .mockRejectedValueOnce(new Error('temporary storage outage'));
    invoke.mockRejectedValueOnce(new EditError(code, 'Request refused'));
    const outcome = await startPortraitOperation('alice', 'fighter', 'render');
    expect(outcome.operation.status).toBe('failed');
    const key = `prompt-wars:paid-portrait:v1:alice:fighter`;
    expect(JSON.parse((await AsyncStorage.getItem(key))!).status).toBe(
      'pending',
    );
    if (recovery === 'check') {
      const checked = await checkPortraitOperation(outcome.operation);
      expect(checked.operation).toMatchObject({
        status: 'failed',
        requestKey: outcome.operation.requestKey,
        error: 'Request refused',
      });
      expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
        status: 'failed',
      });
    }
    expect(await dismissPortraitOperation(outcome.operation)).toBe(true);
    expect(await readPortraitOperation('alice', 'fighter')).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);

it('does not acknowledge until the known terminal proof can be persisted', async () => {
  const write = AsyncStorage.setItem as jest.Mock;
  const originalWrite = write.getMockImplementation()!;
  write
    .mockImplementationOnce(originalWrite)
    .mockRejectedValueOnce(new Error('disk unavailable'))
    .mockRejectedValueOnce(new Error('disk still unavailable'));
  invoke.mockRejectedValueOnce(
    new EditError('battle_locked', 'Request refused'),
  );
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  await expect(dismissPortraitOperation(outcome.operation)).rejects.toThrow(
    'disk still unavailable',
  );
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(await dismissPortraitOperation(outcome.operation)).toBe(true);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('a buffered rejection never overwrites authoritative success for the same request', async () => {
  const write = AsyncStorage.setItem as jest.Mock;
  const originalWrite = write.getMockImplementation()!;
  write
    .mockImplementationOnce(originalWrite)
    .mockRejectedValueOnce(new Error('disk unavailable'));
  invoke.mockRejectedValueOnce(
    new EditError('battle_locked', 'Request refused'),
  );
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  await AsyncStorage.setItem(
    'prompt-wars:paid-portrait:v1:alice:fighter',
    JSON.stringify({
      ...outcome.operation,
      status: 'succeeded',
      portraitId: 'authoritative-image',
      error: undefined,
    }),
  );
  const restored = await readPortraitOperation('alice', 'fighter');
  expect(restored).toMatchObject({
    status: 'succeeded',
    portraitId: 'authoritative-image',
  });
  expect(restored?.error).toBeUndefined();
  expect(await dismissPortraitOperation(outcome.operation)).toBe(false);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('a buffered success survives unavailable storage and hydrates without generating again', async () => {
  const write = AsyncStorage.setItem as jest.Mock;
  const originalWrite = write.getMockImplementation()!;
  let unavailable = true;
  write.mockImplementation(async (key, value) => {
    if (unavailable && JSON.parse(value).status === 'succeeded')
      throw new Error('disk unavailable');
    return originalWrite(key, value);
  });
  try {
    const outcome = await startPortraitOperation('alice', 'fighter', 'render');
    expect(outcome.operation.status).toBe('succeeded');
    unavailable = false;
    expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
      status: 'succeeded',
      portraitId: 'portrait',
      avatarPortraitId: 'avatar',
      requestKey: outcome.operation.requestKey,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  } finally {
    write.mockImplementation(originalWrite);
  }
});

it('does not treat a caller-provided failed flag as proof for an ambiguous request', async () => {
  invoke.mockRejectedValueOnce(new Error('network lost'));
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  expect(
    await dismissPortraitOperation({ ...outcome.operation, status: 'failed' }),
  ).toBe(false);
  expect((await readPortraitOperation('alice', 'fighter'))?.status).toBe(
    'pending',
  );
});

it('a buffered terminal write cannot overwrite or acknowledge a different request', async () => {
  const write = AsyncStorage.setItem as jest.Mock;
  const originalWrite = write.getMockImplementation()!;
  write
    .mockImplementationOnce(originalWrite)
    .mockRejectedValueOnce(new Error('disk unavailable'));
  invoke.mockRejectedValueOnce(
    new EditError('battle_locked', 'Request refused'),
  );
  const outcome = await startPortraitOperation('alice', 'fighter', 'render');
  const newer = {
    ...outcome.operation,
    requestKey: 'new-request',
    status: 'pending',
    error: undefined,
  };
  await AsyncStorage.setItem(
    'prompt-wars:paid-portrait:v1:alice:fighter',
    JSON.stringify(newer),
  );
  expect(await readPortraitOperation('bob', 'fighter')).toBeNull();
  expect(await readPortraitOperation('alice', 'fighter')).toMatchObject({
    requestKey: 'new-request',
    status: 'pending',
  });
  expect(await dismissPortraitOperation(outcome.operation)).toBe(false);
  expect(invoke).toHaveBeenCalledTimes(1);
});
