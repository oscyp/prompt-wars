import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCinematicInput } from '../_shared/cinematic-inputs.ts';
import { cinematicSource } from './fixtures/cinematic.ts';
import { mp4Fixture, mp4DurationFixture } from './fixtures/mp4.ts';

// Import the actual worker without starting its HTTP listener.
const serve = Deno.serve;
let workerHandler: (req: Request) => Promise<Response>;
Deno.serve = ((handler: any) => {
  workerHandler = handler;
}) as any;
let processVideoJob: any;
try {
  processVideoJob = (await import('../process-video-job/index.ts'))
    .processVideoJob;
} finally {
  Deno.serve = serve;
}

async function withCinematicTestEnvironment<T>(
  run: () => Promise<T>,
): Promise<T> {
  const keys = [
    'ENVIRONMENT',
    'DENO_ENV',
    'DENO_TESTING',
    'OPENAI_API_KEY',
    'PERSPECTIVE_API_KEY',
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  keys.forEach((key) => Deno.env.delete(key));
  Deno.env.set('ENVIRONMENT', 'test');
  try {
    return await run();
  } finally {
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!),
    );
  }
}

type Row = Record<string, any>;
function fixture(overrides: Row = {}) {
  const source = cinematicSource();
  const input = buildCinematicInput(source);
  const job: Row = {
    id: 'job',
    battle_id: 'battle',
    battle_round_id: 'round',
    round_number: 3,
    status: 'queued',
    attempt_count: 0,
    lease_token: 'lease',
    trigger: 'auto_free',
    entitlement_source: 'auto_free',
    credits_charged: 0,
    requester_profile_id: 'one',
    refunded: false,
    ...source.policy,
    ...overrides,
  };
  const tables: Record<string, Row[]> = {
    battles: [{ ...source.battle, status: 'completed' }],
    video_jobs: [job],
    video_job_inputs: [{ video_job_id: 'job', payload: input }],
    battle_rounds: [source.round],
    battle_prompts: [
      {
        id: 'prompt-one',
        battle_id: 'battle',
        round_number: 3,
        profile_id: 'one',
        is_locked: true,
        moderation_status: 'approved',
      },
      {
        id: 'prompt-two',
        battle_id: 'battle',
        round_number: 3,
        profile_id: 'two',
        is_locked: true,
        moderation_status: 'approved',
      },
    ],
    moderation_events: [],
    videos: [],
    video_captions: [],
    character_portraits: [
      {
        id: 'Ash-art',
        image_path: 'Ash/v2.png',
        moderation_status: 'approved',
      },
      {
        id: 'Vex-art',
        image_path: 'Vex/v2.png',
        moderation_status: 'approved',
      },
    ],
    signature_items: [
      { id: 'Ash-item', moderation_status: 'approved' },
      { id: 'Vex-item', moderation_status: 'approved' },
    ],
    push_tokens: [],
  };
  const writes: Array<{ table: string; value: Row; filters: Row }> = [];
  const reads: string[] = [];
  const selects: Array<{ table: string; columns: string }> = [];
  const rpcs: Array<{ name: string; args: Row }> = [];
  const events: string[] = [];
  const uploaded: Uint8Array[] = [];
  const uploadedPaths: Array<{ bucket: string; path: string }> = [];
  let rpcError: string | null = null;
  const db: any = {
    async rpc(name: string, args: Row) {
      rpcs.push({ name, args });
      if (name === 'get_account_eligibility')
        return { data: { can_generate: true }, error: null };
      if (name === 'renew_video_job_lease')
        return { data: job.lease_token === args.p_token, error: null };
      if (name === 'persist_cinematic_input')
        return { data: input, error: null };
      if (name === 'can_send_notification') return { data: false, error: null };
      if (name === rpcError)
        return { data: null, error: { message: 'temporary refund outage' } };
      events.push(name);
      return { data: true, error: null };
    },
    from(table: string) {
      const filters: Row = {};
      let operation = 'read';
      let value: Row;
      const execute = (single: boolean) => {
        const rows = tables[table] ?? [];
        let matched = rows.filter((row) =>
          Object.entries(filters).every(([k, v]) => row[k] === v),
        );
        if (operation === 'read') reads.push(table);
        else {
          if (operation === 'insert' || operation === 'upsert') {
            matched = [
              { id: table === 'videos' ? 'video' : 'caption', ...value },
            ];
            rows.push(...matched);
            tables[table] = rows;
          } else matched.forEach((row) => Object.assign(row, value));
          if (matched.length) {
            writes.push({
              table,
              value: structuredClone(value),
              filters: { ...filters },
            });
            events.push(
              `${table}:${value.status ?? value.cinematic_tier ?? operation}`,
            );
          }
        }
        return { data: single ? (matched[0] ?? null) : matched, error: null };
      };
      const q: any = {
        select: (columns: string) => {
          selects.push({ table, columns });
          return q;
        },
        eq: (key: string, val: any) => {
          filters[key] = val;
          return q;
        },
        update: (val: Row) => {
          operation = 'update';
          value = val;
          return q;
        },
        insert: (val: Row) => {
          operation = 'insert';
          value = val;
          return q;
        },
        upsert: (val: Row) => {
          operation = 'upsert';
          value = val;
          return q;
        },
        single: async () => execute(true),
        maybeSingle: async () => execute(true),
        then: (resolve: any, reject: any) =>
          Promise.resolve(execute(false)).then(resolve, reject),
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://assets.test/${path}` },
          error: null,
        }),
        upload: async (_path: string, blob: Blob) => {
          uploadedPaths.push({ bucket, path: _path });
          uploaded.push(new Uint8Array(await blob.arrayBuffer()));
          events.push('upload');
          return { data: {}, error: null };
        },
      }),
    },
  };
  const submitted: Row[] = [];
  const provider: any = {
    submitVideoGeneration: async (request: Row) => {
      submitted.push(request);
      return {
        providerJobId: 'provider-job',
        providerRequestId: 'provider-job',
        durationSeconds: 15,
        model: 'grok-imagine-video-1.5',
      };
    },
    pollVideoStatus: async () => ({ status: 'processing' }),
  };
  return {
    db,
    provider,
    job,
    input,
    tables,
    writes,
    reads,
    selects,
    rpcs,
    events,
    submitted,
    uploaded,
    uploadedPaths,
    refundError: (name: string | null) => {
      rpcError = name;
    },
    step: () =>
      withCinematicTestEnvironment<Row>(() =>
        processVideoJob(db, provider, structuredClone(job), 'lease'),
      ),
  };
}

const refundCalls = (f: ReturnType<typeof fixture>) =>
  f.rpcs.filter((r) =>
    [
      'grant_credits',
      'restore_free_tier1_reveal',
      'restore_subscription_allowance',
      'finalize_round_upgrade',
    ].includes(r.name),
  );

async function withOutput(
  f: ReturnType<typeof fixture>,
  moderation: string,
  run: () => Promise<void>,
  onModeration?: () => void,
  providerBytes?: Uint8Array<ArrayBuffer>,
) {
  const oldFetch = globalThis.fetch;
  const keys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEYS',
    'XAI_VIDEO_COST_USD_PER_SECOND',
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  Deno.env.set('SUPABASE_URL', 'https://backend.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.delete('SUPABASE_SECRET_KEYS');
  Deno.env.set('XAI_VIDEO_COST_USD_PER_SECOND', '0.1');
  f.provider.pollVideoStatus = async () => ({
    status: 'succeeded',
    videoUrl: 'https://provider.test/clip',
    durationSeconds: 14.7,
  });
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === 'https://provider.test/clip')
      return Promise.resolve(
        new Response(
          providerBytes ??
            (f.job.duration_policy_version === 'cinematics-v3' &&
            f.job.target_duration_seconds === 20
              ? mp4DurationFixture(
                  f.job.execution_stage === 'extension' ? 20 : 15,
                )
              : mp4Fixture()),
        ),
      );
    if (String(url) === 'https://backend.test/functions/v1/moderate-video') {
      assertEquals(
        JSON.parse(String(init?.body)).lease_token,
        'lease',
        'postmoderation receives the owned worker lease',
      );
      assertEquals(
        f.job.status,
        'submitted',
        'Provider completion must not publish before moderation',
      );
      assertEquals(f.tables.videos[0]?.moderation_status, 'pending');
      assertEquals(f.tables.videos[0]?.visibility, 'private');
      f.events.push(`moderation:${moderation}`);
      onModeration?.();
      return Promise.resolve(Response.json({ status: moderation }));
    }
    throw new Error(`Unexpected network call: ${url}`);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!),
    );
  }
}

Deno.test(
  'worker submits the frozen fighter, moves, outcome and 15-second policy',
  async () => {
    const f = fixture();
    // Live edits after input preparation cannot affect the provider request.
    f.tables.battles[0].player_one_character = {
      name: 'Edited',
      archetype: 'trickster',
    };
    const result = await f.step();
    assertEquals(result.status, 'submitted');
    assertEquals(f.submitted[0].targetDurationSeconds, 15);
    assertEquals(f.submitted[0].playerOneCharacterName, 'Ash');
    assertEquals(
      f.submitted[0].playerTwoPrompt,
      'I pull the rope to tilt the bridge.',
    );
    assertEquals(f.submitted[0].winnerId, 'p2');
    assertEquals(f.job.submitted_duration_seconds, 15);
    assertEquals(
      f.selects
        .filter((s) => s.table === 'battle_prompts')
        .map((s) => s.columns),
      ['id,profile_id,moderation_status'],
    );
    assertEquals(refundCalls(f), []);
  },
);

Deno.test(
  'missing required fighter asset retries a queued job without publishing or refunding',
  async () => {
    const f = fixture();
    f.input.fighters.p1.reference = null;
    const result = await f.step();
    assertEquals(result.status, 'retry_queued');
    assertEquals(f.job.status, 'queued');
    assertEquals(f.job.attempt_count, 1);
    assertEquals(f.submitted.length, 0);
    assertEquals(refundCalls(f), []);
    assertEquals(f.tables.battles[0].status, 'completed');
    assert(f.rpcs.some((r) => r.name === 'release_video_job_lease'));
    f.job.attempt_count = 2;
    assertEquals((await f.step()).status, 'failed');
    assertEquals(f.job.status, 'failed');
    assertEquals(f.tables.battles[0].status, 'completed');
  },
);

Deno.test(
  'submitted polling does not read battle moves or sign fighter references',
  async () => {
    const f = fixture({ status: 'submitted', provider_job_id: 'provider-job' });
    f.tables.video_job_inputs = [];
    f.tables.character_portraits = [];
    assertEquals((await f.step()).status, 'processing');
    assertEquals(f.reads.includes('battle_prompts'), false);
    assertEquals(f.reads.includes('video_job_inputs'), false);
    assertEquals(f.reads.includes('character_portraits'), false);
    assertEquals(f.submitted.length, 0);
  },
);

for (const status of ['queued', 'submitted']) {
  Deno.test(
    `a lost lease on a ${status} job causes no publication, state writes or refund`,
    async () => {
      const f = fixture({
        status,
        provider_job_id: 'provider-job',
        lease_token: 'new-holder',
        battle_round_id: null,
        entitlement_source: 'credits',
        trigger: 'series_end_legacy',
        credits_charged: 1,
      });
      f.provider.pollVideoStatus = async () => ({
        status: 'failed',
        errorCode: 'provider_failed',
      });
      f.job.attempt_count = 2;
      const result = await f.step();
      assertEquals(result.error, 'lease_lost');
      assertEquals(f.writes, []);
      assertEquals(refundCalls(f), []);
      assertEquals(f.submitted.length, 0);
    },
  );
}

Deno.test(
  'successful post-moderated output records actual duration and costs submitted duration',
  async () => {
    const f = fixture({
      status: 'submitted',
      provider_job_id: 'provider-job',
      submitted_duration_seconds: 12,
      provider_model: 'grok-imagine-video-1.5',
      submitted_at: new Date().toISOString(),
    });
    await withOutput(f, 'approved', async () => {
      assertEquals((await f.step()).status, 'succeeded');
      assertEquals(f.job.provider_cost_usd, 1.2000000000000002);
      assertEquals(f.job.actual_duration_seconds, 14.7);
      assertEquals(f.job.credits_charged, 0);
      assertEquals(f.tables.battle_rounds[0].cinematic_tier, 1);
      assert(
        f.events.indexOf('moderation:approved') <
          f.events.indexOf('video_jobs:succeeded'),
      );
      assertEquals(refundCalls(f), []);
    });
  },
);

for (const status of ['rejected', 'quarantined', 'pending']) {
  Deno.test(
    `post-generation ${status} moderation never publishes Tier 1`,
    async () => {
      const f = fixture({
        status: 'submitted',
        provider_job_id: 'provider-job',
      });
      await withOutput(f, status, async () => {
        assertEquals((await f.step()).status, 'failed');
        assertEquals(f.job.status, 'failed');
        assertEquals(f.tables.battle_rounds[0].cinematic_tier, undefined);
        assertEquals(f.tables.battles[0].status, 'completed');
        assertEquals(f.tables.videos[0].visibility, 'private');
        assertEquals(
          f.writes.some((w) => w.value.status === 'succeeded'),
          false,
        );
      });
    },
  );
}

for (const [source, rpc] of [
  ['credits', 'grant_credits'],
  ['free_grant', 'restore_free_tier1_reveal'],
  ['subscription_allowance', 'restore_subscription_allowance'],
]) {
  Deno.test(
    `legacy series_end ${source} failure refunds its recorded funding only once`,
    async () => {
      const f = fixture({
        status: 'submitted',
        battle_round_id: null,
        trigger: 'series_end_legacy',
        entitlement_source: source,
        credits_charged: source === 'credits' ? 2 : 0,
        spend_transaction_id: 'spend',
      });
      assertEquals((await f.step()).status, 'failed');
      assertEquals(f.job.refunded, true);
      const calls = refundCalls(f);
      assertEquals(calls.length, 1);
      assertEquals(calls[0].name, rpc);
      assertEquals(calls[0].args.p_idempotency_key, 'refund-video-job');
      if (source === 'credits') assertEquals(calls[0].args.p_amount, 2);
      // A duplicate terminal delivery sees the durable marker and cannot repeat billing.
      f.job.status = 'submitted';
      assertEquals((await f.step()).status, 'failed');
      assertEquals(refundCalls(f).length, 1);
      assertEquals(f.tables.battles[0].status, 'completed');
    },
  );

  Deno.test(
    `failed legacy ${source} refund stays resumable and unmarked until RPC succeeds`,
    async () => {
      const f = fixture({
        status: 'submitted',
        battle_round_id: null,
        trigger: 'series_end_legacy',
        entitlement_source: source,
        credits_charged: source === 'credits' ? 2 : 0,
      });
      f.refundError(rpc);
      const result = await f.step();
      assertEquals(result.error, 'entitlement_reconciliation');
      assertEquals(f.job.status, 'submitted');
      assertEquals(f.job.refunded, false);
      assertEquals(
        f.writes.some((w) => w.value.status === 'failed'),
        false,
      );
      assert(f.rpcs.some((r) => r.name === 'release_video_job_lease'));
      f.refundError(null);
      assertEquals((await f.step()).status, 'failed');
      assertEquals(f.job.refunded, true);
    },
  );
}

Deno.test(
  'automatic free terminal failures spend neither credits nor allowance and never refund',
  async () => {
    const f = fixture({ status: 'submitted', battle_round_id: null });
    assertEquals((await f.step()).status, 'failed');
    assertEquals(refundCalls(f), []);
    assertEquals(f.job.credits_charged, 0);
    assertEquals(f.job.refunded, false);
    assertEquals(f.tables.battles[0].status, 'completed');
  },
);

Deno.test(
  'lease stolen during provider poll prevents its result from writing or refunding',
  async () => {
    const f = fixture({
      status: 'submitted',
      provider_job_id: 'provider-job',
      attempt_count: 2,
      entitlement_source: 'credit',
      trigger: 'per_round_manual',
      spend_transaction_id: 'reservation',
    });
    f.provider.pollVideoStatus = async () => {
      f.job.lease_token = 'new-holder';
      return { status: 'failed', errorCode: 'provider_failed' };
    };
    assertEquals((await f.step()).error, 'lease_lost');
    assertEquals(f.writes, []);
    assertEquals(refundCalls(f), []);
  },
);

for (const source of ['credit', 'new_user_grant']) {
  Deno.test(
    `round ${source} refund outage preserves its reservation for retry`,
    async () => {
      const f = fixture({
        status: 'submitted',
        entitlement_source: source,
        trigger: 'per_round_manual',
        spend_transaction_id: 'reservation',
        round_number: null,
      });
      f.refundError('finalize_round_upgrade');
      assertEquals((await f.step()).error, 'entitlement_reconciliation');
      assertEquals(f.job.refunded, false);
      assertEquals(f.job.status, 'submitted');
      f.refundError(null);
      assertEquals((await f.step()).status, 'failed');
      assertEquals(f.job.refunded, true);
      const calls = f.rpcs.filter((r) => r.name === 'finalize_round_upgrade');
      assertEquals(calls.at(-1)?.args, {
        p_reservation_id: 'reservation',
        p_outcome: 'failed',
      });
    },
  );
}

Deno.test(
  'approved subscriber cinematic retries allowance reconciliation before terminal publication',
  async () => {
    const f = fixture({
      status: 'submitted',
      provider_job_id: 'provider-job',
      entitlement_source: 'subscriber_round',
      trigger: 'per_round_manual',
      round_number: null,
    });
    f.refundError('decrement_subscriber_round_allowance');
    await withOutput(f, 'approved', async () => {
      assertEquals((await f.step()).error, 'entitlement_reconciliation');
      assertEquals(f.job.status, 'submitted');
      assertEquals(f.tables.battle_rounds[0].cinematic_tier, undefined);
      assertEquals(f.job.refunded, false);
      f.refundError(null);
      assertEquals((await f.step()).status, 'succeeded');
      const call = f.rpcs.find(
        (r) => r.name === 'decrement_subscriber_round_allowance',
      );
      assertEquals(call?.args.p_round_number, 3);
      assertEquals(call?.args.p_idempotency_key, 'sub_decr:battle:3:one');
    });
  },
);

Deno.test(
  'legacy hard timeout refunds once and reveals the already-ready Tier 0 result',
  async () => {
    const f = fixture({
      status: 'submitted',
      battle_round_id: null,
      entitlement_source: 'credits',
      trigger: 'series_end_legacy',
      credits_charged: 1,
      provider_job_id: 'provider-job',
      submitted_at: new Date(Date.now() - 301_000).toISOString(),
    });
    f.tables.battles[0].status = 'generating_video';
    assertEquals((await f.step()).error, 'hard_timeout');
    assertEquals(f.job.refunded, true);
    assertEquals(f.tables.battles[0].status, 'result_ready');
    assertEquals(refundCalls(f).length, 1);
  },
);

Deno.test(
  'v2 output captions use the saved round fighter/outcome and span the frozen duration',
  async () => {
    const f = fixture({ status: 'submitted', provider_job_id: 'provider-job' });
    f.tables.battles[0].player_one_character = { name: 'Changed player' };
    f.tables.battles[0].tier0_reveal_payload = {
      summary: 'Wrong series winner',
    };
    await withOutput(f, 'approved', async () => {
      assertEquals((await f.step()).status, 'succeeded');
      const lines = f.tables.video_captions[0]?.json_payload.lines;
      assert(lines?.length > 0);
      assert(lines.some((line: Row) => line.text.includes('Vex')));
      assertEquals(
        lines.some(
          (line: Row) =>
            line.text.includes('Wrong series winner') ||
            line.text.includes('Changed player'),
        ),
        false,
      );
      assertEquals(Math.max(...lines.map((line: Row) => line.end_ms)), 15000);
      assertEquals(f.reads.includes('battle_prompts'), false);
    });
  },
);

Deno.test(
  'missing saved v2 caption input never invents captions from the series result',
  async () => {
    const f = fixture({ status: 'submitted', provider_job_id: 'provider-job' });
    f.tables.video_job_inputs = [];
    f.tables.battles[0].tier0_reveal_payload = {
      summary: 'Wrong series winner',
    };
    await withOutput(f, 'approved', async () => {
      assertEquals((await f.step()).status, 'succeeded');
      assertEquals(f.tables.video_captions.length, 0);
    });
  },
);

Deno.test(
  'lease stolen during moderation prevents publication and entitlement finalization',
  async () => {
    const f = fixture({
      status: 'submitted',
      provider_job_id: 'provider-job',
      entitlement_source: 'credit',
      trigger: 'per_round_manual',
      spend_transaction_id: 'reservation',
    });
    await withOutput(
      f,
      'approved',
      async () => {
        assertEquals((await f.step()).error, 'lease_lost');
        assertEquals(f.job.status, 'submitted');
        assertEquals(f.tables.battle_rounds[0].cinematic_tier, undefined);
        assertEquals(refundCalls(f), []);
        assertEquals(
          f.writes.some((w) => w.value.status === 'succeeded'),
          false,
        );
      },
      () => {
        f.job.lease_token = 'new-holder';
      },
    );
  },
);

for (const recoveryStatus of [200, 503]) {
  Deno.test(
    `scheduled worker recovers orphan funding once and continues on recovery ${recoveryStatus}`,
    async () => {
      const keys = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SECRET_KEYS',
        'VIDEO_PROVIDER',
      ];
      const previous = keys.map((key) => Deno.env.get(key));
      const oldFetch = globalThis.fetch;
      Deno.env.set('SUPABASE_URL', 'https://backend.test');
      Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
      Deno.env.delete('SUPABASE_SECRET_KEYS');
      Deno.env.set('VIDEO_PROVIDER', 'mock');
      const calls: string[] = [];
      globalThis.fetch = ((request: Request | string | URL) => {
        const path = new URL(
          request instanceof Request ? request.url : String(request),
        ).pathname;
        calls.push(path);
        if (path.endsWith('/recover_orphan_cinematic_funding'))
          return Promise.resolve(
            Response.json(
              recoveryStatus === 200
                ? 0
                : { code: 'temporary_outage', message: 'Try next sweep' },
              { status: recoveryStatus },
            ),
          );
        if (path.endsWith('/claim_video_jobs'))
          return Promise.resolve(Response.json([]));
        throw new Error(`Unexpected network call: ${path}`);
      }) as typeof fetch;
      try {
        const response = await workerHandler(
          new Request('https://worker.test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: 'test-service-key',
            },
            body: '{}',
          }),
        );
        assertEquals(response.status, 200);
        assertEquals(calls, [
          '/rest/v1/rpc/recover_orphan_cinematic_funding',
          '/rest/v1/rpc/claim_video_jobs',
        ]);
        calls.length = 0;
        const direct = await workerHandler(
          new Request('https://worker.test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: 'test-service-key',
            },
            body: JSON.stringify({ video_job_id: 'job' }),
          }),
        );
        assertEquals(direct.status, 200);
        assertEquals(calls, ['/rest/v1/rpc/claim_video_jobs']);
      } finally {
        globalThis.fetch = oldFetch;
        keys.forEach((key, i) =>
          previous[i] === undefined
            ? Deno.env.delete(key)
            : Deno.env.set(key, previous[i]!),
        );
      }
    },
  );
}

Deno.test(
  'lease stolen during storage copy prevents metadata writes and moderation invocation',
  async () => {
    const f = fixture({ status: 'submitted', provider_job_id: 'provider-job' });
    f.db.storage.from = () => ({
      upload: async () => {
        f.job.lease_token = 'new-holder';
        return { data: {}, error: null };
      },
    });
    await withOutput(f, 'approved', async () => {
      assertEquals((await f.step()).error, 'lease_lost');
      assertEquals(f.writes, []);
      assertEquals(f.events.includes('moderation:approved'), false);
      assertEquals(refundCalls(f), []);
    });
  },
);

Deno.test(
  'a saved cinematic retry rejects withdrawn prompt approval and refunds its reservation',
  async () => {
    const f = fixture({
      entitlement_source: 'credit',
      trigger: 'per_round_manual',
      spend_transaction_id: 'reservation',
    });
    const frozen = structuredClone(f.input);
    assertEquals((await f.step()).status, 'submitted');
    f.provider.pollVideoStatus = async () => ({
      status: 'failed',
      errorCode: 'provider_failed',
    });
    assertEquals((await f.step()).status, 'retry_queued');
    f.tables.battle_prompts[0].moderation_status = 'rejected';
    assertEquals((await f.step()).status, 'failed');
    assertEquals(f.job.refunded, true);
    assertEquals(f.submitted.length, 1);
    assertEquals(f.input, frozen);
    const calls = f.rpcs.filter((r) => r.name === 'finalize_round_upgrade');
    assertEquals(
      calls.map((r) => r.args),
      [{ p_reservation_id: 'reservation', p_outcome: 'failed' }],
    );
    assertEquals(f.tables.battles[0].status, 'completed');
  },
);

Deno.test(
  'worker preserves the complete provider audio and video bytes for v2 and legacy clips',
  async () => {
    for (const legacy of [false, true]) {
      const f = fixture();
      await f.step();
      if (legacy) f.job.duration_policy_version = null;
      await withOutput(f, 'approved', async () => {
        assertEquals((await f.step()).status, 'succeeded');
        assertEquals(f.uploaded.length, 1);
        assertEquals(f.uploaded[0], mp4Fixture());
      });
    }
  },
);
Deno.test(
  'worker rejects malformed v3 media before upload and refunds its funding',
  async () => {
    const f = plusTwenty({
      entitlement_source: 'credit',
      trigger: 'on_demand_credit',
      spend_transaction_id: 'hold',
      credits_charged: 1,
    });
    await f.step();
    await withOutput(
      f,
      'approved',
      async () => {
        const result = await f.step();
        assertEquals(result.status, 'failed');
        assertEquals(result.error, 'storage_failed');
        assertEquals(f.uploaded.length, 0);
        assertEquals(f.tables.videos.length, 0);
        assertEquals(
          refundCalls(f).map((call) => call.name),
          ['finalize_round_upgrade'],
        );
        assertEquals(f.job.refunded, true);
      },
      undefined,
      new Uint8Array([1, 2, 3]),
    );
  },
);

function plusTwenty(overrides: Row = {}) {
  const f = fixture({
    cinematic_profile: 'plus',
    target_duration_seconds: 20,
    duration_policy_version: 'cinematics-v3',
    execution_stage: 'base',
    ...overrides,
  });
  f.input.policy = {
    cinematic_profile: 'plus',
    target_duration_seconds: 20,
    duration_policy_version: 'cinematics-v3',
  };
  return f;
}
Deno.test(
  '20-second worker durably marks paid base submission before calling provider',
  async () => {
    const f = plusTwenty();
    const submit = f.provider.submitVideoGeneration;
    f.provider.submitVideoGeneration = (request: Row) => {
      assertEquals(f.job.execution_stage, 'base_submitting');
      assertEquals(f.job.status, 'submitted');
      assert(f.job.execution_started_at);
      return submit(request);
    };
    assertEquals((await f.step()).status, 'submitted');
    assertEquals(f.job.execution_stage, 'base');
    assertEquals(f.job.submitted_duration_seconds, 15);
    assertEquals(f.submitted[0].targetDurationSeconds, 20);
  },
);
Deno.test(
  '20-second worker preserves synchronized audio in the private base and approved full output',
  async () => {
    const f = plusTwenty();
    await f.step();
    let extensionCalls = 0;
    await withOutput(f, 'approved', async () => {
      f.provider.pollVideoStatus = async () => ({
        status: 'succeeded',
        videoUrl: 'https://provider.test/clip',
        durationSeconds: 15,
        moderationApproved: true,
        moderationProvider: 'xai_generation',
      });
      assertEquals((await f.step()).status, 'processing');
      assertEquals(f.job.execution_stage, 'extension_ready');
      assertEquals(f.job.base_video_path, 'job/base.mp4');
      assertEquals(f.uploaded[0], mp4DurationFixture(15));
      assertEquals(f.uploadedPaths[0], {
        bucket: 'cinematic-work',
        path: 'job/base.mp4',
      });
      assertEquals(f.job.base_provider_model, 'grok-imagine-video-1.5');
      assertEquals(f.job.base_submitted_duration_seconds, 15);
      assertEquals(
        f.tables.videos.length,
        0,
        'intermediate approval must create no participant-visible video',
      );
      assertEquals(f.tables.video_captions.length, 0);
      assertEquals(f.tables.battle_rounds[0].cinematic_tier, undefined);
      f.provider.submitVideoExtension = async (request: Row) => {
        extensionCalls++;
        assertEquals(f.job.execution_stage, 'extension_submitting');
        assertEquals(request.durationSeconds, 5);
        assertEquals(request.videoUrl, 'https://assets.test/job/base.mp4');
        assert(request.prompt.includes('Vex'));
        return {
          providerJobId: 'extended-job',
          providerRequestId: 'extended-job',
          durationSeconds: 5,
          model: 'grok-imagine-video',
        };
      };
      assertEquals((await f.step()).status, 'submitted');
      assertEquals(f.job.execution_stage, 'extension');
      const readCount = f.reads.filter((r) => r === 'battle_prompts').length;
      f.provider.pollVideoStatus = async (id: string) => {
        assertEquals(id, 'extended-job');
        return {
          status: 'succeeded',
          videoUrl: 'https://provider.test/clip',
          durationSeconds: 20,
          moderationApproved: true,
          moderationProvider: 'xai_generation',
        };
      };
      assertEquals((await f.step()).status, 'succeeded');
      assertEquals(f.job.actual_duration_seconds, 20);
      assertEquals(f.uploaded[1], mp4DurationFixture(20));
      assertEquals(f.job.provider_cost_usd, 2);
      assertEquals(f.tables.battle_rounds[0].cinematic_tier, 1);
      assertEquals(
        f.reads.filter((r) => r === 'battle_prompts').length,
        readCount,
        'poll only uses recorded inputs',
      );
      assertEquals(f.submitted.length, 1);
      assertEquals(extensionCalls, 1);
    });
  },
);
Deno.test(
  '20-second worker rejects the base before any extension or playable metadata',
  async () => {
    const f = plusTwenty({
      status: 'submitted',
      provider_job_id: 'base',
      entitlement_source: 'credits',
      trigger: 'round',
      spend_transaction_id: 'spend',
      credits_charged: 3,
      submitted_at: new Date().toISOString(),
    });
    await withOutput(f, 'approved', async () => {
      f.provider.pollVideoStatus = async () => ({
        status: 'succeeded',
        videoUrl: 'https://provider.test/clip',
        durationSeconds: 15,
        moderationApproved: false,
        moderationProvider: 'xai_generation',
      });
      assertEquals((await f.step()).status, 'failed');
      assertEquals(f.tables.videos.length, 0);
      assertEquals(refundCalls(f).length, 1);
      assertEquals(f.submitted.length, 0);
    });
  },
);
Deno.test(
  '20-second ambiguous paid submission markers never resubmit and eventually refund',
  async () => {
    for (const execution_stage of ['base_submitting', 'extension_submitting']) {
      const f = plusTwenty({
        execution_stage,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        execution_started_at: new Date().toISOString(),
        entitlement_source: 'credits',
        trigger: 'round',
        spend_transaction_id: 'spend',
        credits_charged: 3,
      });
      assertEquals((await f.step()).status, 'processing');
      assertEquals(f.submitted.length, 0);
      f.job.submitted_at = new Date(Date.now() - 301_000).toISOString();
      assertEquals((await f.step()).error, 'hard_timeout');
      assertEquals(refundCalls(f).length, 1);
    }
  },
);
Deno.test(
  '20-second extension failure does not reset to queued or regenerate the paid base',
  async () => {
    const f = plusTwenty({
      execution_stage: 'extension',
      status: 'submitted',
      provider_job_id: 'extension',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date().toISOString(),
      base_video_path: 'job/base.mp4',
      base_provider_job_id: 'base',
      entitlement_source: 'credits',
      trigger: 'round',
      spend_transaction_id: 'spend',
      credits_charged: 3,
    });
    f.provider.pollVideoStatus = async () => ({
      status: 'failed',
      errorCode: 'provider_failed',
    });
    assertEquals((await f.step()).status, 'failed');
    assertEquals(f.submitted.length, 0);
    assertEquals(refundCalls(f).length, 1);
  },
);

Deno.test(
  '20-second worker holds ambiguous provider acceptance without a duplicate submission',
  async () => {
    const f = plusTwenty();
    let calls = 0;
    f.provider.submitVideoGeneration = async () => {
      calls++;
      throw new Error('connection lost after acceptance');
    };
    assertEquals((await f.step()).error, 'submission_uncertain');
    assertEquals(f.job.execution_stage, 'base_submitting');
    assertEquals((await f.step()).error, 'submission_uncertain');
    assertEquals(calls, 1);
    assertEquals(f.job.refunded, false);
  },
);
Deno.test(
  '20-second continuation rechecks withdrawn approval without changing frozen moves',
  async () => {
    const f = plusTwenty({
      status: 'processing',
      execution_stage: 'extension_ready',
      base_video_path: 'job/base.mp4',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date().toISOString(),
      entitlement_source: 'credits',
      trigger: 'round',
      spend_transaction_id: 'spend',
      credits_charged: 3,
    });
    const original = structuredClone(f.input);
    f.tables.battle_prompts[1].moderation_status = 'rejected';
    let calls = 0;
    f.provider.submitVideoExtension = async () => {
      calls++;
      return {};
    };
    assertEquals((await f.step()).status, 'failed');
    assertEquals(calls, 0);
    assertEquals(refundCalls(f).length, 1);
    assertEquals(f.input, original);
  },
);
Deno.test(
  '20-second continuation cannot start or charge after losing its lease',
  async () => {
    const f = plusTwenty({
      status: 'processing',
      execution_stage: 'extension_ready',
      base_video_path: 'job/base.mp4',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date().toISOString(),
    });
    f.db.storage.from = () => ({
      createSignedUrl: () => {
        f.job.lease_token = 'other';
        return Promise.resolve({
          data: { signedUrl: 'https://base.test/clip.mp4' },
        });
      },
    });
    let calls = 0;
    f.provider.submitVideoExtension = async () => {
      calls++;
      return {};
    };
    assertEquals((await f.step()).error, 'lease_lost');
    assertEquals(calls, 0);
    assertEquals(f.job.execution_stage, 'extension_ready');
    assertEquals(refundCalls(f).length, 0);
  },
);
for (const table of ['character_portraits', 'signature_items']) {
  Deno.test(
    `20-second continuation refuses a withdrawn frozen ${table} asset before signing the base`,
    async () => {
      const f = plusTwenty({
        status: 'processing',
        execution_stage: 'extension_ready',
        base_video_path: 'job/base.mp4',
        submitted_at: new Date().toISOString(),
        execution_started_at: new Date().toISOString(),
        entitlement_source: 'credits',
        trigger: 'round',
        spend_transaction_id: 'spend',
        credits_charged: 3,
      });
      const original = structuredClone(f.input);
      f.tables[table][0].moderation_status = 'rejected';
      let signed = 0,
        submitted = 0;
      f.db.storage.from = () => ({
        createSignedUrl: async () => {
          signed++;
          return { data: { signedUrl: 'https://base.test/clip.mp4' } };
        },
      });
      f.provider.submitVideoExtension = async () => {
        submitted++;
        return {
          providerJobId: 'extension',
          providerRequestId: 'extension',
          durationSeconds: 5,
        };
      };
      assertEquals((await f.step()).status, 'failed');
      assertEquals(signed, 0);
      assertEquals(submitted, 0);
      assertEquals(refundCalls(f).length, 1);
      assertEquals(f.tables.videos.length, 0);
      assertEquals(f.input, original);
    },
  );
}
Deno.test(
  '20-second output shorter than the quoted duration stays private and refunds once',
  async () => {
    const f = plusTwenty({
      execution_stage: 'extension',
      status: 'submitted',
      provider_job_id: 'extended-job',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date().toISOString(),
      entitlement_source: 'credits',
      trigger: 'round',
      spend_transaction_id: 'spend',
      credits_charged: 3,
    });
    await withOutput(
      f,
      'approved',
      async () => {
        f.provider.pollVideoStatus = async () => ({
          status: 'succeeded',
          videoUrl: 'https://provider.test/clip',
          durationSeconds: 20,
          moderationApproved: true,
          moderationProvider: 'xai_generation',
        });
        assertEquals((await f.step()).error, 'duration_mismatch');
        assertEquals(f.uploaded.length, 0);
        assertEquals(f.tables.videos.length, 0);
        assertEquals(refundCalls(f).length, 1);
      },
      undefined,
      mp4DurationFixture(5),
    );
  },
);
Deno.test(
  '20-second worker publishes measured full extension when provider duration reports only five added seconds',
  async () => {
    const f = plusTwenty({
      execution_stage: 'extension',
      status: 'submitted',
      provider_job_id: 'extended-job',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date().toISOString(),
    });
    await withOutput(
      f,
      'approved',
      async () => {
        f.provider.pollVideoStatus = async () => ({
          status: 'succeeded',
          videoUrl: 'https://provider.test/clip',
          durationSeconds: 5,
          moderationApproved: true,
          moderationProvider: 'xai_generation',
        });
        assertEquals((await f.step()).status, 'succeeded');
        assertEquals(f.job.actual_duration_seconds, 20.04);
        assertEquals(f.tables.battle_rounds[0].cinematic_tier, 1);
        assertEquals(refundCalls(f).length, 0);
      },
      undefined,
      mp4DurationFixture(20.04),
    );
  },
);
Deno.test(
  '20-second execution uses a fresh stage window but never exceeds the total deadline',
  async () => {
    const f = plusTwenty({
      execution_stage: 'extension',
      status: 'submitted',
      provider_job_id: 'extended-job',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date(Date.now() - 400_000).toISOString(),
    });
    assertEquals((await f.step()).status, 'processing');
    f.job.execution_started_at = new Date(Date.now() - 601_000).toISOString();
    assertEquals((await f.step()).error, 'hard_timeout');
  },
);

Deno.test(
  '20-second worker stores exact billed cost for both requests rather than multiplying final duration',
  async () => {
    const f = plusTwenty();
    await f.step();
    await withOutput(f, 'approved', async () => {
      f.provider.pollVideoStatus = async () => ({
        status: 'succeeded',
        videoUrl: 'https://provider.test/clip',
        durationSeconds: 15,
        moderationApproved: true,
        moderationProvider: 'xai_generation',
        costUsd: 1.234,
      });
      await f.step();
      assertEquals(f.job.base_cost_usd, 1.234);
      f.provider.submitVideoExtension = async () => ({
        providerJobId: 'extension',
        providerRequestId: 'extension',
        model: 'grok-imagine-video',
        durationSeconds: 5,
      });
      await f.step();
      f.provider.pollVideoStatus = async () => ({
        status: 'succeeded',
        videoUrl: 'https://provider.test/clip',
        durationSeconds: 20,
        moderationApproved: true,
        moderationProvider: 'xai_generation',
        costUsd: 0.456,
      });
      await f.step();
      assertEquals(f.job.provider_cost_usd, 1.69);
    });
  },
);

Deno.test(
  'v3 output captions use frozen round outcome and span all twenty seconds',
  async () => {
    const f = plusTwenty({
      status: 'submitted',
      execution_stage: 'extension',
      provider_job_id: 'extension',
      submitted_at: new Date().toISOString(),
      execution_started_at: new Date(Date.now() - 100_000).toISOString(),
    });
    f.tables.battles[0].tier0_reveal_payload = {
      summary: 'Wrong series result',
    };
    f.tables.battles[0].player_two_character = { name: 'Changed fighter' };
    await withOutput(f, 'approved', async () => {
      f.provider.pollVideoStatus = async () => ({
        status: 'succeeded',
        videoUrl: 'https://provider.test/clip',
        durationSeconds: 20,
        moderationApproved: true,
        moderationProvider: 'xai_generation',
      });
      assertEquals((await f.step()).status, 'succeeded');
      const lines = f.tables.video_captions[0]?.json_payload.lines;
      assert(lines.some((line: Row) => line.text.includes('Vex')));
      assertEquals(
        lines.some(
          (line: Row) =>
            line.text.includes('Wrong series') ||
            line.text.includes('Changed fighter'),
        ),
        false,
      );
      assertEquals(Math.max(...lines.map((line: Row) => line.end_ms)), 20000);
      assert(f.job.provider_latency_ms >= 100_000);
    });
  },
);

Deno.test(
  'final moderation lease rejection prevents worker publication or entitlement refund',
  async () => {
    const f = fixture({
      status: 'submitted',
      provider_job_id: 'provider-job',
      trigger: 'round',
      entitlement_source: 'credits',
      credits_charged: 3,
      spend_transaction_id: 'spend',
    });
    await withOutput(f, 'approved', async () => {
      const fetchOutput = globalThis.fetch;
      globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
        String(url).includes('/moderate-video')
          ? Promise.resolve(
              Response.json({ error: 'lease_lost' }, { status: 409 }),
            )
          : fetchOutput(url, init)) as typeof fetch;
      assertEquals((await f.step()).error, 'lease_lost');
      assertEquals(f.job.status, 'submitted');
      assertEquals(refundCalls(f).length, 0);
      assertEquals(f.tables.battle_rounds[0].cinematic_tier, undefined);
    });
  },
);
