import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { startFaceOff } from '../_shared/start-face-off.ts';
import { getSituationBotMove } from '../_shared/prompt-situations.ts';

type Handler = (request: Request) => Promise<Response>;
let resolve: Handler;
const originalServe = Deno.serve;
Deno.serve = ((handler: Handler) => {
  resolve = handler;
}) as unknown as typeof Deno.serve;
try {
  await import('../round-resolve/index.ts');
} finally {
  Deno.serve = originalServe;
}

let advance: Handler;
Deno.serve = ((handler: Handler) => {
  advance = handler;
}) as unknown as typeof Deno.serve;
try {
  await import('../battle-advance/index.ts');
} finally {
  Deno.serve = originalServe;
}

const battleId = '00000000-0000-4000-8000-000000000031';
const playerId = '00000000-0000-4000-8000-000000000032';
const situation = {
  id: 'neon-1',
  catalogVersion: 1,
  environmentId: 'neon-nexus',
  text: 'Lights flicker above the platform.',
};

Deno.test(
  'policy2 missing private choice fails recoverably before claiming a round',
  async () => {
    const originalFetch = globalThis.fetch;
    const env = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEYS',
    ];
    const before = env.map((name) => Deno.env.get(name));
    Deno.env.set('SUPABASE_URL', 'https://private-bot.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
    Deno.env.set('SUPABASE_SECRET_KEYS', '');
    const writes: string[] = [];
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/rest/v1/battles?')) {
        return Promise.resolve(
          Response.json({
            id: battleId,
            format: 'bo3',
            status: 'resolving',
            current_round: 1,
            player_one_id: playerId,
            player_two_id: null,
            is_player_two_bot: true,
            judge_policy_version: 'v2.0.0-ideas',
            bot_policy_version: 2,
          }),
        );
      }
      if (url.endsWith('/rpc/get_private_bot_move')) {
        return Promise.resolve(
          Response.json(
            { message: 'bot_choice_integrity_error', code: 'P0001' },
            { status: 400 },
          ),
        );
      }
      writes.push(url);
      if (url.endsWith('/rpc/claim_battle_round')) {
        return Promise.resolve(Response.json([]));
      }
      throw new Error('Unexpected request: ' + url);
    }) as typeof fetch;
    try {
      const response = await resolve(
        new Request('https://private-bot.test/resolve', {
          method: 'POST',
          headers: { apikey: 'service' },
          body: JSON.stringify({ battle_id: battleId, round_number: 1 }),
        }),
      );
      assertEquals(response.status, 503);
      const payload = await response.json();
      assertEquals(payload.code, 'bot_choice_unavailable');
      assertEquals(payload.retryable, true);
      assertEquals(writes, []);
    } finally {
      globalThis.fetch = originalFetch;
      env.forEach((name, i) =>
        before[i] === undefined
          ? Deno.env.delete(name)
          : Deno.env.set(name, before[i]!),
      );
    }
  },
);

Deno.test('policy1 resolver does not require private state', async () => {
  const originalFetch = globalThis.fetch;
  const env = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEYS',
  ];
  const before = env.map((name) => Deno.env.get(name));
  Deno.env.set('SUPABASE_URL', 'https://private-bot.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
  Deno.env.set('SUPABASE_SECRET_KEYS', '');
  let claimed = false;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/rest/v1/battles?')) {
      return Promise.resolve(
        Response.json({
          id: battleId,
          format: 'bo3',
          status: 'resolving',
          current_round: 1,
          player_one_id: playerId,
          is_player_two_bot: true,
          judge_policy_version: 'v2.0.0-ideas',
          bot_policy_version: 1,
        }),
      );
    }
    if (url.endsWith('/rpc/claim_battle_round')) {
      claimed = true;
      return Promise.resolve(Response.json([]));
    }
    throw new Error('Legacy must not load private state: ' + url);
  }) as typeof fetch;
  try {
    const response = await resolve(
      new Request('https://private-bot.test/resolve', {
        method: 'POST',
        headers: { apikey: 'service' },
        body: JSON.stringify({ battle_id: battleId }),
      }),
    );
    assertEquals(response.status, 200);
    assert(claimed);
  } finally {
    globalThis.fetch = originalFetch;
    env.forEach((name, i) =>
      before[i] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, before[i]!),
    );
  }
});

Deno.test(
  'resolver freezes private text only for policy2 and preserves policy1 text',
  async () => {
    const originalFetch = globalThis.fetch;
    const names = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEYS',
      'JUDGE_PROVIDER',
    ];
    const before = names.map((name) => Deno.env.get(name));
    Deno.env.set('SUPABASE_URL', 'https://private-bot.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
    Deno.env.set('SUPABASE_SECRET_KEYS', '');
    Deno.env.set('JUDGE_PROVIDER', 'mock');
    const text =
      'I step past the support on dry ground. I want a short stable route for my final attack.';
    const move = {
      text,
      moveType: 'finisher',
      wordCount: text.split(/\s+/).length,
    };
    try {
      for (const policy of [1, 2]) {
        let result: Record<string, any> | undefined;
        let privateReads = 0;
        const round = {
          id: '00000000-0000-4000-8000-000000000035',
          round_number: 1,
          situation_snapshot: situation,
        };
        const battle = {
          id: battleId,
          format: 'bo3',
          status: 'resolving',
          current_round: 1,
          player_one_id: playerId,
          player_two_id: null,
          is_player_two_bot: true,
          judge_policy_version: 'v2.0.0-ideas',
          bot_policy_version: policy,
          player_one_hp: 100,
          player_two_hp: 100,
          theme: 'Precision over power',
        };
        globalThis.fetch = ((
          input: string | URL | Request,
          init?: RequestInit,
        ) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.includes('/rest/v1/battles?')) {
            return Promise.resolve(
              Response.json(init?.method === 'PATCH' ? null : battle),
            );
          }
          if (url.includes('/rest/v1/battle_prompts?')) {
            return Promise.resolve(Response.json([]));
          }
          if (url.includes('/rest/v1/battle_rounds?')) {
            return Promise.resolve(
              Response.json(
                init?.method === 'PATCH' ? null : { ...round, ...result },
              ),
            );
          }
          if (url.endsWith('/rpc/get_private_bot_move')) {
            privateReads++;
            assertEquals(JSON.parse(String(init?.body)), {
              p_battle_id: battleId,
              p_round_number: 1,
            });
            return Promise.resolve(
              Response.json({
                ...move,
                seed: 'must-not-escape',
                catalog_version: 1,
              }),
            );
          }
          if (url.endsWith('/rpc/claim_battle_round')) {
            return Promise.resolve(Response.json([round]));
          }
          if (url.endsWith('/rpc/complete_battle_round')) {
            result = JSON.parse(String(init?.body)).p_result;
            return Promise.resolve(Response.json(true));
          }
          if (url.endsWith('/functions/v1/battle-advance')) {
            return Promise.resolve(Response.json({}));
          }
          throw new Error('Unexpected resolver request: ' + url);
        }) as typeof fetch;
        const response = await resolve(
          new Request('https://private-bot.test/resolve', {
            method: 'POST',
            headers: { apikey: 'service' },
            body: JSON.stringify({
              battle_id: battleId,
              forfeit_profile_id: playerId,
            }),
          }),
        );
        assertEquals(response.status, 200);
        assertEquals(privateReads, policy === 2 ? 1 : 0);
        assertEquals(
          result?.judge_payload.frozen_inputs.player_two,
          policy === 2
            ? move
            : getSituationBotMove(
                { ...situation, catalogVersion: 1 },
                battleId,
                1,
              ),
        );
        assert(!JSON.stringify(result).includes('must-not-escape'));
      }
    } finally {
      globalThis.fetch = originalFetch;
      names.forEach((name, i) =>
        before[i] === undefined
          ? Deno.env.delete(name)
          : Deno.env.set(name, before[i]!),
      );
    }
  },
);

Deno.test(
  'opening composer2 round1 never prefetches while legacy opening does',
  async () => {
    const originalFetch = globalThis.fetch;
    const names = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEYS',
    ];
    const before = names.map((name) => Deno.env.get(name));
    Deno.env.set('SUPABASE_URL', 'https://private-bot.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
    Deno.env.set('SUPABASE_SECRET_KEYS', '');
    const characterId = '00000000-0000-4000-8000-000000000034';
    try {
      for (const [version, format, revealed] of [
        [1, 'bo3', false],
        [1, 'single', false],
        [1, 'bo3', true],
        [2, 'bo3', false],
        [2, 'bo3', true],
      ] as const) {
        let prefetched = 0;
        globalThis.fetch = ((input: string | URL | Request) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.includes('/rest/v1/battles?')) {
            return Promise.resolve(
              Response.json({
                id: battleId,
                format,
                status: 'matched',
                face_off_revealed_at: revealed ? '2026-10-02T00:00:00Z' : null,
                player_one_id: playerId,
                player_one_character_id: characterId,
                is_player_two_bot: true,
                prompt_experience_version: version,
              }),
            );
          }
          if (url.includes('/rest/v1/characters?')) {
            return Promise.resolve(
              Response.json([
                {
                  id: characterId,
                  stat_strength: 5,
                  stat_stamina: 5,
                  stat_agility: 5,
                  stat_focus: 5,
                },
              ]),
            );
          }
          if (url.includes('/rest/v1/character_portraits?')) {
            return Promise.resolve(Response.json([]));
          }
          if (url.endsWith('/rpc/start_battle_face_off')) {
            return Promise.resolve(Response.json(true));
          }
          if (url.endsWith('/functions/v1/prefetch-move-suggestions')) {
            prefetched++;
            return Promise.resolve(Response.json({}));
          }
          throw new Error('Unexpected face-off request: ' + url);
        }) as typeof fetch;
        const db = createClient('https://private-bot.test', 'service', {
          auth: { persistSession: false },
        });
        const opened = await startFaceOff(db, battleId);
        assertEquals(opened.applied, format === 'bo3' && !revealed);
        assertEquals(prefetched, version === 1 ? 1 : 0);
      }
    } finally {
      globalThis.fetch = originalFetch;
      names.forEach((name, i) =>
        before[i] === undefined
          ? Deno.env.delete(name)
          : Deno.env.set(name, before[i]!),
      );
    }
  },
);

Deno.test(
  'opening later composer2 rounds never prefetches while legacy opening does',
  async () => {
    const originalFetch = globalThis.fetch;
    const names = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEYS',
    ];
    const before = names.map((name) => Deno.env.get(name));
    Deno.env.set('SUPABASE_URL', 'https://private-bot.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
    Deno.env.set('SUPABASE_SECRET_KEYS', '');
    try {
      for (const version of [1, 2]) {
        let prefetched = 0;
        globalThis.fetch = ((input: string | URL | Request) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.includes('/rest/v1/battles?')) {
            return Promise.resolve(
              Response.json({
                id: battleId,
                format: 'bo3',
                status: 'resolving',
                current_round: 1,
                best_of: 3,
                player_one_id: playerId,
                player_two_id: null,
                is_player_two_bot: true,
                prompt_experience_version: version,
                player_one_hp: 100,
                player_two_hp: 100,
              }),
            );
          }
          if (url.includes('/rest/v1/battle_rounds?')) {
            return Promise.resolve(
              Response.json(
                url.includes('limit=1')
                  ? {
                      id: 'round',
                      status: 'result_ready',
                      round_number: 1,
                      is_ko: false,
                    }
                  : [],
              ),
            );
          }
          if (url.endsWith('/rpc/open_next_prompt_round')) {
            return Promise.resolve(
              Response.json({ lock_in_deadline: '2030-01-01T00:00:00Z' }),
            );
          }
          if (url.endsWith('/functions/v1/prefetch-move-suggestions')) {
            prefetched++;
            return Promise.resolve(Response.json({}));
          }
          if (url.endsWith('/rpc/can_send_notification')) {
            return Promise.resolve(Response.json(false));
          }
          throw new Error('Unexpected advance request: ' + url);
        }) as typeof fetch;
        const response = await advance(
          new Request('https://private-bot.test/advance', {
            method: 'POST',
            headers: { apikey: 'service' },
            body: JSON.stringify({ battle_id: battleId }),
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await response.json()).next_round, 2);
        // Allow the nonblocking notification to settle before restoring fetch.
        await new Promise((done) => setTimeout(done, 0));
        assertEquals(prefetched, version === 1 ? 1 : 0);
      }
    } finally {
      globalThis.fetch = originalFetch;
      names.forEach((name, i) =>
        before[i] === undefined
          ? Deno.env.delete(name)
          : Deno.env.set(name, before[i]!),
      );
    }
  },
);
