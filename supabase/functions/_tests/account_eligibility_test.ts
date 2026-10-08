import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getAuthUserId } from '../_shared/utils.ts';
import { canGenerateBattle } from '../_shared/eligibility.ts';

Deno.test(
  'authenticated gameplay fails closed on revocation or lookup failure; account management remains available',
  async () => {
    const savedFetch = globalThis.fetch;
    const values = {
      SUPABASE_URL: 'https://auth-test.example',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    };
    const saved = Object.fromEntries(
      Object.keys(values).map((key) => [key, Deno.env.get(key)]),
    );
    for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
    let permission: boolean | null = false;
    let reads = 0;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/auth/v1/user'))
        return Promise.resolve(
          Response.json({
            id: 'real-user',
            aud: 'authenticated',
            email: 'user@example.test',
          }),
        );
      if (url.endsWith('/rest/v1/rpc/get_account_eligibility')) {
        reads++;
        assertEquals(JSON.parse(String(init?.body)).p_profile_id, 'real-user');
        return Promise.resolve(
          permission === null
            ? Response.json({ message: 'failure' }, { status: 503 })
            : Response.json({ can_play: permission, can_purchase: false }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const request = () =>
      new Request('https://example.test/matchmaking', {
        headers: { Authorization: 'Bearer session-token' },
      });
    try {
      await assertRejects(
        () => getAuthUserId(request()),
        Error,
        'account_eligibility_required',
      );
      permission = true;
      assertEquals(await getAuthUserId(request()), 'real-user');
      await assertRejects(
        () => getAuthUserId(request(), { capability: 'purchase' }),
        Error,
        'account_eligibility_required',
      );
      permission = null;
      await assertRejects(
        () => getAuthUserId(request()),
        Error,
        'account_eligibility_unavailable',
      );
      const before = reads;
      assertEquals(
        await getAuthUserId(request(), { capability: 'account' }),
        'real-user',
      );
      assertEquals(reads, before);
    } finally {
      globalThis.fetch = savedFetch;
      for (const [key, value] of Object.entries(saved))
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  },
);
Deno.test(
  'background generation requires current permission for both players and ignores a bot slot',
  async () => {
    const decisions = new Map([
      ['one', true],
      ['two', false],
    ]);
    const rpc = async (_name: string, args: { p_profile_id: string }) => ({
      data: { can_generate: decisions.get(args.p_profile_id) },
      error: null,
    });
    assertEquals(
      await canGenerateBattle(
        { rpc },
        { player_one_id: 'one', player_two_id: 'two' },
      ),
      false,
    );
    assertEquals(
      await canGenerateBattle(
        { rpc },
        { player_one_id: 'one', player_two_id: null },
      ),
      true,
    );
    decisions.set('two', true);
    assertEquals(
      await canGenerateBattle(
        { rpc },
        { player_one_id: 'one', player_two_id: 'two' },
      ),
      true,
    );
    assertEquals(
      await canGenerateBattle(
        { rpc: async () => ({ data: null, error: new Error() }) },
        { player_one_id: 'one' },
      ),
      false,
    );
  },
);
