import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

type Handler = (request: Request) => Promise<Response>;
Deno.test(
  'video upgrade quotes preserve funding, frozen duration, validated round and Tier 0 completion',
  async (t) => {
    const serve = Deno.serve;
    let handler: Handler | undefined;
    Deno.serve = ((value: Handler) => {
      handler = value;
    }) as unknown as typeof Deno.serve;
    try {
      await import('../request-video-upgrade/index.ts');
    } finally {
      Deno.serve = serve;
    }
    assert(handler);
    const environment = {
      SUPABASE_URL: 'https://video-quote.test',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      SUPABASE_SECRET_KEYS: '',
      SUPABASE_PUBLISHABLE_KEYS: '',
    };
    const saved = Object.fromEntries(
      Object.keys(environment).map((key) => [key, Deno.env.get(key)]),
    );
    Object.entries(environment).forEach(([key, value]) =>
      Deno.env.set(key, value),
    );
    const fetchBefore = globalThis.fetch;
    const plus = {
      cinematic_profile: 'plus',
      target_duration_seconds: 20,
      duration_policy_version: 'cinematics-v3',
    };
    const standard = {
      cinematic_profile: 'standard',
      target_duration_seconds: 12,
      duration_policy_version: 'cinematics-v3',
    };
    let policy = plus,
      format = 'single',
      participant = true,
      insertRace = false;
    let grantsUsed = 0,
      reservationBusy = false,
      refundFails = false;
    let entitlement = {
      is_subscriber: false,
      credits_balance: 10,
      monthly_video_allowance_remaining: 0,
      monthly_round_allowance_remaining: 0,
      monthly_full_battle_cap_remaining: 0,
      new_user_round_grants_remaining: 0,
      new_user_grant_per_battle_limit: 1,
    };
    let existingJobs: unknown[] = [];
    const writes: { name: string; args: Record<string, unknown> }[] = [];
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method =
        init?.method ?? (input instanceof Request ? input.method : 'GET');
      const args = init?.body ? JSON.parse(String(init.body)) : {};
      const reply = (data: unknown) => Promise.resolve(Response.json(data));
      const table = url.pathname.split('/').at(-1);
      if (url.pathname === '/auth/v1/user') {
        return reply({ id: 'player', role: 'authenticated' });
      }
      if (table === 'get_account_eligibility') {
        return reply({ can_generate: true, can_play: true });
      }
      if (table === 'resolve_cinematic_policy') return reply(policy);
      if (table === 'insert_cinematic_video_job') {
        writes.push({ name: table, args });
        if (insertRace) {
          policy = standard;
          return Promise.resolve(
            Response.json(
              { message: 'cinematic_quote_changed', code: 'P0001' },
              {
                status: 400,
              },
            ),
          );
        }
        return reply({ id: 'job', status: 'queued', ...policy });
      }
      if (
        table === 'spend_credits' ||
        table === 'grant_credits' ||
        table === 'reserve_round_upgrade_credit' ||
        table === 'reserve_round_upgrade_grant' ||
        table === 'finalize_round_upgrade' ||
        table === 'consume_free_tier1_reveal' ||
        table === 'restore_free_tier1_reveal' ||
        table === 'restore_subscription_allowance'
      ) {
        writes.push({ name: table, args });
        if (reservationBusy && table?.startsWith('reserve_round_upgrade_')) {
          return Promise.resolve(
            Response.json(
              {
                code: 'P0001',
                message: 'round_upgrade_already_reserved',
              },
              { status: 400 },
            ),
          );
        }
        if (
          refundFails &&
          (table === 'grant_credits' || table === 'finalize_round_upgrade')
        ) {
          return Promise.resolve(
            Response.json(
              { code: 'P0001', message: 'refund unavailable' },
              {
                status: 400,
              },
            ),
          );
        }
        return reply('transaction');
      }
      if (table === 'process-video-job') {
        writes.push({ name: 'worker', args });
        return reply({ success: true });
      }
      if (method === 'HEAD') {
        return Promise.resolve(
          new Response(null, {
            headers: {
              'content-range': `0-0/${
                table === 'wallet_transactions' ? grantsUsed : 0
              }`,
            },
          }),
        );
      }
      if (method !== 'GET') {
        writes.push({ name: `${table}:${method}`, args });
        return reply(
          table === 'video_jobs' ? { id: 'old-job', status: 'queued' } : null,
        );
      }
      if (table === 'battles') {
        return reply({
          id: 'battle',
          status: 'completed',
          format,
          best_of: format === 'bo3' ? 3 : 1,
          player_one_id: participant ? 'player' : 'other',
          player_two_id: 'opponent',
        });
      }
      if (table === 'battle_rounds') {
        return reply({
          id: 'round',
          battle_id: 'battle',
          status: 'result_ready',
          round_number: 2,
        });
      }
      if (table === 'video_jobs') return reply(existingJobs);
      if (table === 'entitlements') return reply(entitlement);
      if (table === 'entitlements_v2') return reply([entitlement]);
      if (table === 'profiles') {
        return reply({
          created_at: '2020-01-01T00:00:00Z',
          free_tier1_reveals_remaining: 0,
        });
      }
      if (table === 'subscriptions') {
        return reply({
          id: 'subscription',
          monthly_video_allowance: 30,
          monthly_video_allowance_used: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }) as typeof fetch;
    const request = async (body: Record<string, unknown>) => {
      const response = await handler!(
        new Request('https://test/request-video-upgrade', {
          method: 'POST',
          headers: { Authorization: 'Bearer session' },
          body: JSON.stringify({ battle_id: 'battle', ...body }),
        }),
      );
      return { status: response.status, body: await response.json() };
    };
    const reset = () => {
      writes.length = 0;
      grantsUsed = 0;
      reservationBusy = false;
      refundFails = false;
      policy = plus;
      format = 'single';
      participant = true;
      insertRace = false;
      existingJobs = [];
      entitlement = {
        is_subscriber: false,
        credits_balance: 10,
        monthly_video_allowance_remaining: 0,
        monthly_round_allowance_remaining: 0,
        monthly_full_battle_cap_remaining: 0,
        new_user_round_grants_remaining: 0,
        new_user_grant_per_battle_limit: 1,
      };
    };
    try {
      await t.step(
        'existing 15-second v2 jobs preserve their original policy',
        async () => {
          reset();
          existingJobs = [
            {
              id: 'old-plus',
              status: 'succeeded',
              refunded: false,
              cinematic_profile: 'plus',
              target_duration_seconds: 15,
              duration_policy_version: 'cinematics-v2',
            },
          ];
          const result = await request({ auto_spend: true });
          assertEquals(result.body.already_requested, true);
          assertEquals(result.body.target_duration_seconds, 15);
          assertEquals(result.body.duration_policy_version, 'cinematics-v2');
          assertEquals(writes, []);
        },
      );
      await t.step(
        'round grant previews honor the per-battle limit without any reservation',
        async () => {
          reset();
          format = 'bo3';
          entitlement.new_user_round_grants_remaining = 2;
          const available = await request({ battle_round_id: 'round' });
          assertEquals(
            available.body.entitlement_check.method,
            'new_user_grant',
          );
          assertEquals(writes, []);
          grantsUsed = 1;
          const limited = await request({ battle_round_id: 'round' });
          assertEquals(limited.body.entitlement_check.method, 'credit');
          assertEquals(writes, []);
        },
      );
      await t.step(
        'reservation contention does not release another request funding or requote a spend',
        async () => {
          reset();
          format = 'bo3';
          reservationBusy = true;
          const result = await request({
            auto_spend: true,
            battle_round_id: 'round',
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credit', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.request_in_progress, true);
          assertEquals(result.body.quote_changed, undefined);
          assertEquals(
            writes.filter((row) => row.name === 'finalize_round_upgrade')
              .length,
            0,
          );
          assertEquals(
            writes.filter((row) => row.name === 'insert_cinematic_video_job')
              .length,
            0,
          );
        },
      );
      await t.step(
        'a failed round refund cannot report quote_changed success',
        async () => {
          reset();
          format = 'bo3';
          insertRace = true;
          refundFails = true;
          const result = await request({
            auto_spend: true,
            battle_round_id: 'round',
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credit', cost_credits: 1 },
          });
          assertEquals(result.status, 500);
          assertEquals(result.body.quote_changed, undefined);
        },
      );
      await t.step(
        'single funding and job creation are one atomic request without a pre-debit',
        async () => {
          reset();
          const result = await request({
            auto_spend: true,
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credits', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          const insert = writes.find(
            (row) => row.name === 'insert_cinematic_video_job',
          );
          assert(insert);
          const job = insert.args.p_job as Record<string, unknown>;
          assertEquals(job.expected_funding_quote, {
            method: 'credits',
            cost_credits: 1,
          });
          assertEquals(job.spend_transaction_id, null);
          assertEquals(
            writes.some(
              (row) =>
                row.name === 'spend_credits' || row.name === 'grant_credits',
            ),
            false,
          );
        },
      );
      await t.step(
        'a rejected atomic single creation has no separate debit to refund',
        async () => {
          reset();
          insertRace = true;
          const result = await request({
            auto_spend: true,
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credits', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.quote_changed, true);
          assertEquals(
            writes.some(
              (row) =>
                row.name === 'spend_credits' || row.name === 'grant_credits',
            ),
            false,
          );
        },
      );
      await t.step(
        'single preview carries the server policy without spending',
        async () => {
          reset();
          const result = await request({});
          assertEquals(result.status, 200);
          assertEquals(
            result.body.entitlement_check.target_duration_seconds,
            20,
          );
          assertEquals(result.body.entitlement_check.cinematic_profile, 'plus');
          assertEquals(result.body.entitlement_check.cost_credits, 1);
          assertEquals(writes, []);
        },
      );
      await t.step(
        'round preview is read-only and uses the validated row number',
        async () => {
          reset();
          format = 'bo3';
          const result = await request({
            battle_round_id: 'round',
            round_number: 1,
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.entitlement_check.method, 'credit');
          assertEquals(
            result.body.entitlement_check.target_duration_seconds,
            20,
          );
          assertEquals(writes, []);
        },
      );
      await t.step(
        'a duration change returns a new quote before any debit',
        async () => {
          reset();
          policy = standard;
          const result = await request({
            auto_spend: true,
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credits', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.quote_changed, true);
          assertEquals(result.body.can_upgrade, false);
          assertEquals(
            result.body.entitlement_check.target_duration_seconds,
            12,
          );
          assertEquals(writes, []);
        },
      );
      await t.step(
        'a funding change returns a new quote before using an allowance',
        async () => {
          reset();
          entitlement.is_subscriber = true;
          entitlement.monthly_video_allowance_remaining = 4;
          const result = await request({
            auto_spend: true,
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credits', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.quote_changed, true);
          assertEquals(
            result.body.entitlement_check.method,
            'subscription_allowance',
          );
          assertEquals(writes, []);
        },
      );
      await t.step(
        'confirmed round job is inserted atomically with its real round and never changes battle completion',
        async () => {
          reset();
          format = 'bo3';
          const result = await request({
            auto_spend: true,
            battle_round_id: 'round',
            round_number: 1,
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credit', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.video_job_id, 'job');
          assertEquals(result.body.target_duration_seconds, 20);
          const insert = writes.find(
            (row) => row.name === 'insert_cinematic_video_job',
          );
          assert(insert);
          assertEquals(insert.args.p_expected_policy, plus);
          assertEquals(
            (insert.args.p_job as Record<string, unknown>).round_number,
            2,
          );
          assertEquals(
            (insert.args.p_job as Record<string, unknown>).input_payload_hash,
            null,
          );
          assertEquals(
            writes.some((row) => row.name === 'battles:PATCH'),
            false,
          );
          assertEquals(
            writes.filter((row) => row.name === 'reserve_round_upgrade_credit')
              .length,
            1,
          );
        },
      );
      await t.step(
        'an insertion policy race refunds funding and refreshes the quote',
        async () => {
          reset();
          format = 'bo3';
          insertRace = true;
          const result = await request({
            auto_spend: true,
            battle_round_id: 'round',
            expected_cinematic_policy: plus,
            expected_funding_quote: { method: 'credit', cost_credits: 1 },
          });
          assertEquals(result.status, 200);
          assertEquals(result.body.quote_changed, true);
          assertEquals(
            result.body.entitlement_check.target_duration_seconds,
            12,
          );
          assertEquals(
            writes.filter((row) => row.name === 'reserve_round_upgrade_credit')
              .length,
            1,
          );
          assertEquals(
            writes.filter((row) => row.name === 'finalize_round_upgrade')
              .length,
            1,
          );
          assertEquals(
            writes.some((row) => row.name === 'worker'),
            false,
          );
        },
      );
      await t.step(
        'a Bo3 request without a round is rejected before spending',
        async () => {
          reset();
          format = 'bo3';
          assertEquals((await request({ auto_spend: true })).status, 400);
          assertEquals(writes, []);
        },
      );
      await t.step(
        'preview does not delete a refunded failed attempt',
        async () => {
          reset();
          existingJobs = [
            {
              id: 'failed',
              status: 'failed',
              refunded: true,
              error_code: 'provider_error',
            },
          ];
          assertEquals((await request({})).status, 200);
          assertEquals(writes, []);
        },
      );
      await t.step(
        'non-participants cannot obtain a quote or spend',
        async () => {
          reset();
          participant = false;
          assertEquals((await request({ auto_spend: true })).status, 403);
          assertEquals(writes, []);
        },
      );
    } finally {
      globalThis.fetch = fetchBefore;
      for (const [key, value] of Object.entries(saved)) {
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
      }
    }
  },
);
