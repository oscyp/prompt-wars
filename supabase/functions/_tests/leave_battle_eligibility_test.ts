import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const BATTLE_ID = '22222222-2222-2222-2222-222222222222';
type Handler = (request: Request) => Promise<Response>;

Deno.test(
  'restricted players can leave their battles without bypassing ownership or authentication',
  async (t) => {
    const savedServe = Deno.serve;
    let handler: Handler | undefined;
    try {
      // Capture the deployed handler without starting a listening server.
      Deno.serve = ((registered: Handler) => {
        handler = registered;
      }) as unknown as typeof Deno.serve;
      await import('../leave-battle/index.ts');
    } finally {
      Deno.serve = savedServe;
    }
    assert(handler);
    const leave = handler;

    const values = {
      SUPABASE_URL: 'https://leave-test.example',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
      SUPABASE_PUBLISHABLE_KEYS: '',
      SUPABASE_SECRET_KEYS: '',
    };
    const savedEnv = Object.fromEntries(
      Object.keys(values).map((key) => [key, Deno.env.get(key)]),
    );
    for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
    const savedFetch = globalThis.fetch;
    let authenticated = true;
    let participant = true;
    let claims = 0;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/auth/v1/user')) {
        return Promise.resolve(
          authenticated
            ? Response.json({
                id: PLAYER_ID,
                aud: 'authenticated',
                role: 'authenticated',
                email: 'player@example.test',
                email_confirmed_at: '2026-09-01T12:00:00Z',
                app_metadata: { provider: 'email', providers: ['email'] },
                user_metadata: {},
                identities: [],
                created_at: '2026-09-01T12:00:00Z',
                updated_at: '2026-09-01T12:00:00Z',
                is_anonymous: false,
              })
            : Response.json({ message: 'Invalid session' }, { status: 401 }),
        );
      }
      if (url.endsWith('/rest/v1/rpc/get_account_eligibility')) {
        return Promise.resolve(
          Response.json({
            enabled: true,
            status: 'revoked',
            can_play: false,
            can_generate: false,
            can_purchase: false,
            can_grant: false,
          }),
        );
      }
      if (url.endsWith('/rest/v1/rpc/claim_leave_battle')) {
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_profile_id, PLAYER_ID);
        assertEquals(args.p_battle_id, BATTLE_ID);
        assertEquals(args.p_credits, 0);
        claims++;
        return Promise.resolve(
          Response.json(
            participant
              ? { success: true, action: 'canceled', charged: 0 }
              : { success: false, error: 'not_participant' },
          ),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const request = () =>
      new Request('https://example.test/leave-battle', {
        method: 'POST',
        headers: { Authorization: 'Bearer session-token' },
        body: JSON.stringify({
          battle_id: BATTLE_ID,
          profile_id: 'caller-cannot-select-another-account',
        }),
      });

    try {
      await t.step(
        'consent withdrawal does not prevent free battle settlement',
        async () => {
          const response = await leave(request());
          assertEquals(response.status, 200);
          assertEquals(await response.json(), {
            success: true,
            action: 'canceled',
            credits_charged: 0,
          });
        },
      );
      await t.step(
        'a restricted nonparticipant still cannot leave another battle',
        async () => {
          participant = false;
          const response = await leave(request());
          assertEquals(response.status, 403);
          assertEquals(
            (await response.json()).error,
            'Battle participant required',
          );
        },
      );
      await t.step(
        'an invalid session never reaches the service-role claim',
        async () => {
          authenticated = false;
          const claimsBefore = claims;
          const response = await leave(request());
          assert(response.status >= 400);
          assertEquals(claims, claimsBefore);
        },
      );
    } finally {
      globalThis.fetch = savedFetch;
      for (const [key, value] of Object.entries(savedEnv)) {
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
      }
    }
  },
);
