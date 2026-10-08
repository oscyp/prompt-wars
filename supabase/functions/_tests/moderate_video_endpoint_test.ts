import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Handler = (request: Request) => Promise<Response>;
const previousServe = Deno.serve;
let handler: Handler;
Deno.serve = ((value: unknown) => {
  handler = value as Handler;
}) as unknown as typeof Deno.serve;
try {
  await import('../moderate-video/index.ts');
} finally {
  Deno.serve = previousServe;
}

async function endpointFixture(
  run: (
    request: (battleId?: string) => Promise<Response>,
    calls: Array<{
      path: string;
      method: string;
      body: Record<string, unknown> | null;
    }>,
  ) => Promise<void>,
  auditUnavailable = false,
  leaseResults = [true, true],
  leaseToken = 'lease',
  approved = false,
) {
  const keys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEYS',
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  const previousFetch = globalThis.fetch;
  Deno.env.set('SUPABASE_URL', 'https://backend.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.delete('SUPABASE_SECRET_KEYS');
  const calls: Array<{
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }> = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    const body =
      req.method === 'GET' ? null : await req.json().catch(() => null);
    calls.push({ path, method: req.method, body });
    if (path === '/rest/v1/videos' && req.method === 'GET')
      return Response.json({
        id: 'video',
        storage_path: 'videos/battle/job.mp4',
        battle_id: 'battle',
        moderation_status: 'pending',
        video_job_id: 'job',
      });
    if (path === '/rest/v1/moderation_events' && req.method === 'POST')
      return auditUnavailable
        ? Response.json({ message: 'audit outage' }, { status: 503 })
        : Response.json({ id: 'audit' });
    if (path === '/rest/v1/videos' && req.method === 'PATCH')
      return new Response(null, { status: 204 });
    if (path === '/rest/v1/video_jobs' && req.method === 'GET')
      return Response.json({
        id: 'job',
        requester_profile_id: 'one',
        entitlement_source: 'credits',
        credits_charged: 3,
        spend_transaction_id: 'spend',
        refunded: false,
      });
    if (path === '/rest/v1/video_jobs' && req.method === 'PATCH')
      return new Response(null, { status: 204 });
    if (path === '/rest/v1/rpc/renew_video_job_lease')
      return Response.json(leaseResults.shift() ?? true);
    if (path.startsWith('/rest/v1/rpc/')) return Response.json(true);
    throw new Error(`Unexpected endpoint dependency: ${path}`);
  }) as typeof fetch;
  try {
    await run(
      (battleId = 'battle') =>
        handler(
          new Request('https://backend.test/functions/v1/moderate-video', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer test-service-key',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              video_id: 'video',
              battle_id: battleId,
              lease_token: leaseToken,
              provider_moderation_approved: approved,
              provider_moderation_source: 'xai_generation',
            }),
          }),
        ),
      calls,
    );
  } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!),
    );
  }
}
Deno.test(
  'final video moderation returns rejection without a second refund owner',
  async () => {
    await endpointFixture(async (request, calls) => {
      const response = await request();
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.status, 'rejected');
      assertEquals(body.should_refund, true);
      assertEquals(
        calls.filter(
          (c) =>
            (c.path.startsWith('/rest/v1/rpc/') &&
              c.path !== '/rest/v1/rpc/renew_video_job_lease') ||
            c.path === '/rest/v1/video_jobs',
        ),
        [],
        'worker owns entitlement reconciliation and refund marker',
      );
      assertEquals(
        calls.filter(
          (c) => c.path === '/rest/v1/videos' && c.method === 'PATCH',
        )[0]?.body?.moderation_status,
        'rejected',
      );
    });
  },
);
Deno.test(
  'final video moderation rejects a mismatched battle before any audit or status write',
  async () => {
    await endpointFixture(async (request, calls) => {
      assertEquals((await request('another-battle')).status, 400);
      assertEquals(
        calls.filter((c) => c.method !== 'GET'),
        [],
      );
    });
  },
);
Deno.test(
  'final video moderation audit outage cannot publish an unaudited approval or rejection',
  async () => {
    await endpointFixture(async (request, calls) => {
      assertEquals((await request()).status, 500);
      assertEquals(
        calls.filter(
          (c) => c.path === '/rest/v1/videos' && c.method === 'PATCH',
        ),
        [],
      );
      assertEquals(
        calls.filter(
          (c) =>
            c.path.startsWith('/rest/v1/rpc/') &&
            c.path !== '/rest/v1/rpc/renew_video_job_lease',
        ),
        [],
      );
    }, true);
  },
);

Deno.test(
  'final video moderation requires an owned lease token before approval',
  async () => {
    await endpointFixture(
      async (request, calls) => {
        assertEquals((await request()).status, 400);
        assertEquals(
          calls.filter((c) => c.method !== 'GET'),
          [],
        );
      },
      false,
      [true, true],
      '',
      true,
    );
  },
);
Deno.test(
  'final video moderation stops approval when the lease is lost during moderation',
  async () => {
    await endpointFixture(
      async (request, calls) => {
        assertEquals((await request()).status, 409);
        assertEquals(
          calls.filter(
            (c) => c.path === '/rest/v1/videos' && c.method === 'PATCH',
          ),
          [],
        );
      },
      false,
      [true, false],
      'lease',
      true,
    );
  },
);
