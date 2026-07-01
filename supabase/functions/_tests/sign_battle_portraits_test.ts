// Unit tests for the `sign-battle-portraits` resolver.
//
// Dependency-free: a hand-rolled read-only mock Supabase client drives the pure
// resolver (no live database, no Deno.serve side effect). Validates participant
// gating, cross-participant signing, and bot / missing / rejected portrait null
// behavior, plus one-side-failure isolation.

import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { resolveBattlePortraits } from '../sign-battle-portraits/resolve-battle-portraits.ts';

interface Fixtures {
  battle: Record<string, unknown> | null;
  portraits?: Record<string, Record<string, unknown>>;
  /** Storage paths for which createSignedUrl returns an error (robustness). */
  signErrorPaths?: string[];
}

// deno-lint-ignore no-explicit-any
function createMockSupabase(fx: Fixtures): any {
  const one = (table: string, filters: Record<string, unknown>) => {
    switch (table) {
      case 'battles':
        return { data: fx.battle, error: null };
      case 'character_portraits':
        return {
          data: fx.portraits?.[String(filters.character_id)] ?? null,
          error: null,
        };
      default:
        return { data: null, error: null };
    }
  };

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: () => Promise.resolve(one(table, filters)),
      single: () => Promise.resolve(one(table, filters)),
    };
    return api;
  };

  const storage = {
    from: (_bucket: string) => ({
      createSignedUrl: (path: string, _ttl: number) => {
        if (fx.signErrorPaths?.includes(path)) {
          return Promise.resolve({ data: null, error: { message: 'boom' } });
        }
        return Promise.resolve({
          data: { signedUrl: `https://signed.test/${path}?token=abc` },
          error: null,
        });
      },
    }),
  };

  return { from, storage };
}

function humanBattle(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'battle-1',
    player_one_id: 'u1',
    player_two_id: 'u2',
    is_player_two_bot: false,
    player_one_character_id: 'c1',
    player_two_character_id: 'c2',
    player_one_character: { id: 'c1', archetype: 'strategist' },
    player_two_character: { id: 'c2', archetype: 'titan' },
    ...overrides,
  };
}

function approvedPortrait(imagePath: string): Record<string, unknown> {
  return {
    image_path: imagePath,
    thumb_path: null,
    seed: 1,
    moderation_status: 'approved',
  };
}

Deno.test('resolveBattlePortraits — non-participant is forbidden', async () => {
  const result = await resolveBattlePortraits(
    createMockSupabase({ battle: humanBattle() }),
    { battleId: 'battle-1', callerUserId: 'intruder' },
  );
  assertEquals(result.kind, 'forbidden');
});

Deno.test('resolveBattlePortraits — missing battle is not_found', async () => {
  const result = await resolveBattlePortraits(
    createMockSupabase({ battle: null }),
    { battleId: 'nope', callerUserId: 'u1' },
  );
  assertEquals(result.kind, 'not_found');
});

Deno.test('resolveBattlePortraits — opponent (player_two) gets BOTH signed portraits', async () => {
  const fx: Fixtures = {
    battle: humanBattle(),
    portraits: {
      c1: approvedPortrait('u1/c1/p.png'),
      c2: approvedPortrait('u2/c2/p.png'),
    },
  };
  // The opponent (player_two) reads player_one's otherwise-private portrait.
  const result = await resolveBattlePortraits(createMockSupabase(fx), {
    battleId: 'battle-1',
    callerUserId: 'u2',
  });
  assertEquals(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assertEquals(result.payload.player_one, {
    portrait_url: 'https://signed.test/u1/c1/p.png?token=abc',
    archetype: 'strategist',
  });
  assertEquals(result.payload.player_two, {
    portrait_url: 'https://signed.test/u2/c2/p.png?token=abc',
    archetype: 'titan',
  });
});

Deno.test('resolveBattlePortraits — bot side resolves to null portrait + null archetype', async () => {
  const fx: Fixtures = {
    battle: humanBattle({
      player_two_id: null,
      is_player_two_bot: true,
      player_two_character_id: null,
      player_two_character: null,
    }),
    portraits: { c1: approvedPortrait('u1/c1/p.png') },
  };
  const result = await resolveBattlePortraits(createMockSupabase(fx), {
    battleId: 'battle-1',
    callerUserId: 'u1',
  });
  assertEquals(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assertEquals(
    result.payload.player_one.portrait_url,
    'https://signed.test/u1/c1/p.png?token=abc',
  );
  assertEquals(result.payload.player_two, {
    portrait_url: null,
    archetype: null,
  });
});

Deno.test('resolveBattlePortraits — human with no current portrait -> null url, archetype kept', async () => {
  const fx: Fixtures = {
    battle: humanBattle(),
    // Only c1 has a portrait row; c2 has none.
    portraits: { c1: approvedPortrait('u1/c1/p.png') },
  };
  const result = await resolveBattlePortraits(createMockSupabase(fx), {
    battleId: 'battle-1',
    callerUserId: 'u1',
  });
  assertEquals(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assertEquals(result.payload.player_two, {
    portrait_url: null,
    archetype: 'titan',
  });
});

Deno.test('resolveBattlePortraits — rejected portrait -> null url', async () => {
  const fx: Fixtures = {
    battle: humanBattle(),
    portraits: {
      c1: approvedPortrait('u1/c1/p.png'),
      c2: {
        image_path: 'u2/c2/p.png',
        thumb_path: null,
        seed: 2,
        moderation_status: 'rejected',
      },
    },
  };
  const result = await resolveBattlePortraits(createMockSupabase(fx), {
    battleId: 'battle-1',
    callerUserId: 'u1',
  });
  assertEquals(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assertEquals(result.payload.player_two.portrait_url, null);
  assertEquals(result.payload.player_two.archetype, 'titan');
});

Deno.test('resolveBattlePortraits — signing failure on one side does not fail the other', async () => {
  const fx: Fixtures = {
    battle: humanBattle(),
    portraits: {
      c1: approvedPortrait('u1/c1/p.png'),
      c2: approvedPortrait('u2/c2/p.png'),
    },
    signErrorPaths: ['u2/c2/p.png'],
  };
  const result = await resolveBattlePortraits(createMockSupabase(fx), {
    battleId: 'battle-1',
    callerUserId: 'u1',
  });
  assertEquals(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assertEquals(
    result.payload.player_one.portrait_url,
    'https://signed.test/u1/c1/p.png?token=abc',
  );
  assertEquals(result.payload.player_two.portrait_url, null);
});
