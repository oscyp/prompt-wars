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
  /** Avatar-kind rows, keyed by character id. Absent = no avatar generated. */
  avatars?: Record<string, Record<string, unknown>>;
  /** bot_personas rows, keyed by persona id. */
  personas?: Record<string, Record<string, unknown>>;
  signErrorPaths?: string[];
}

// deno-lint-ignore no-explicit-any
function createMockSupabase(fx: Fixtures): any {
  const one = (table: string, filters: Record<string, unknown>) => {
    switch (table) {
      case 'battles':
        return { data: fx.battle, error: null };
      case 'character_portraits': {
        // Fixtures are keyed by character id and represent the FIGHTER render.
        // An explicit `avatars` fixture supplies avatar rows; absent one, an
        // avatar lookup misses, which is what every pre-existing character
        // looks like and is exactly the fallback path worth testing.
        const kind = String(filters.kind ?? 'fighter');
        const table = kind === 'avatar' ? fx.avatars : fx.portraits;
        return {
          data: table?.[String(filters.character_id)] ?? null,
          error: null,
        };
      }
      case 'bot_personas':
        return { data: fx.personas?.[String(filters.id)] ?? null, error: null };
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
      order: () => api,
      // resolveCurrentPortrait now reads `.order(...).limit(1)` and takes
      // rows[0] instead of `.maybeSingle()`, so the mock has to terminate on
      // limit() and hand back an ARRAY.
      limit: (n: number) => {
        const res = one(table, filters);
        const rows = res.data ? [res.data] : [];
        return Promise.resolve({ data: rows.slice(0, n), error: res.error });
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
    player_one_character: {
      id: 'c1',
      archetype: 'strategist',
      name: 'Mirrorwright',
      signature_color: '#8B5CF6',
    },
    player_two_character: {
      id: 'c2',
      archetype: 'titan',
      name: 'Ironhold',
      signature_color: '#22C55E',
    },
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

Deno.test(
  'resolveBattlePortraits — opponent (player_two) gets BOTH signed portraits',
  async () => {
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
      // No avatar fixture, so the fighter render IS what portrait_url points at
      // and there is nothing extra for the viewer to open.
      fighter_url: null,
      archetype: 'strategist',
      name: 'Mirrorwright',
      signature_color: '#8B5CF6',
      cosmetics: null,
    });
    assertEquals(result.payload.player_two, {
      portrait_url: 'https://signed.test/u2/c2/p.png?token=abc',
      fighter_url: null,
      archetype: 'titan',
      name: 'Ironhold',
      signature_color: '#22C55E',
      cosmetics: null,
    });
  },
);

Deno.test(
  'resolveBattlePortraits — bot side resolves to null portrait + null archetype',
  async () => {
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
    // Bot side: no character row, so no identity either.
    assertEquals(result.payload.player_two, {
      portrait_url: null,
      fighter_url: null,
      archetype: null,
      name: null,
      signature_color: null,
      cosmetics: null,
    });
  },
);

Deno.test(
  'resolveBattlePortraits — bot side carries the persona identity when there is one',
  async () => {
    // bot_personas is unreadable by clients, so this is the only way the
    // face-off learns it is fighting "Forge", a titan, in red.
    const fx: Fixtures = {
      battle: humanBattle({
        player_two_id: null,
        is_player_two_bot: true,
        bot_persona_id: 'persona-forge',
        player_two_character_id: null,
        player_two_character: null,
      }),
      portraits: { c1: approvedPortrait('u1/c1/p.png') },
      personas: {
        'persona-forge': {
          name: 'Forge',
          archetype: 'titan',
          signature_color: '#ef4444',
        },
      },
    };
    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });
    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(result.payload.player_two, {
      portrait_url: null,
      fighter_url: null,
      archetype: 'titan',
      name: 'Forge',
      signature_color: '#ef4444',
      cosmetics: null,
    });
  },
);

Deno.test(
  'resolveBattlePortraits — human with no current portrait -> null url, archetype kept',
  async () => {
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
      fighter_url: null,
      archetype: 'titan',
      name: 'Ironhold',
      signature_color: '#22C55E',
      cosmetics: null,
    });
  },
);

Deno.test(
  'resolveBattlePortraits — rejected portrait -> null url',
  async () => {
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
  },
);

Deno.test(
  'resolveBattlePortraits — signing failure on one side does not fail the other',
  async () => {
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
  },
);

// The opponent's character row is unreadable by the client: RLS on `characters`
// is `profile_id = auth.uid()`. This function is the ONLY path by which a player
// learns their opponent's name, so a payload that omits it leaves the face-off
// screen permanently showing "Player 1" / "Player 2" and "fighter" -- which is
// exactly what it did.
Deno.test(
  "resolveBattlePortraits — payload carries each side's name and colour",
  async () => {
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: {
        c1: approvedPortrait('p1.png'),
        c2: approvedPortrait('p2.png'),
      },
    };

    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });

    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;

    assertEquals(result.payload.player_one.name, 'Mirrorwright');
    assertEquals(result.payload.player_one.archetype, 'strategist');
    assertEquals(result.payload.player_one.signature_color, '#8B5CF6');

    // The caller is u1, so player_two is the opponent -- the side with no other
    // data path.
    assertEquals(result.payload.player_two.name, 'Ironhold');
    assertEquals(result.payload.player_two.archetype, 'titan');
    assertEquals(result.payload.player_two.signature_color, '#22C55E');
  },
);

Deno.test(
  'resolveBattlePortraits — identity survives a portrait signing failure',
  async () => {
    // A blank portrait must not also cost the opponent their name: those are
    // independent failures and the screen should degrade to name-without-image,
    // not to "Player 2".
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: {
        c1: approvedPortrait('p1.png'),
        c2: approvedPortrait('p2.png'),
      },
      signErrorPaths: ['p2.png'],
    };

    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });

    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(result.payload.player_two.portrait_url, null);
    assertEquals(result.payload.player_two.name, 'Ironhold');
    assertEquals(result.payload.player_two.archetype, 'titan');
  },
);

// Avatar preference, and the fallback that protects the existing player base.
//
// These are circle-cropped surfaces (face-off, VersusStrip), so the avatar is
// preferred — a circle crop of a full-body fighter render is mostly torso. But
// every character created before avatars existed has only a fighter render, so
// the fallback is what stops the face-off going blank for all of them.
Deno.test(
  'resolveBattlePortraits — prefers the avatar render when one exists',
  async () => {
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: { c1: approvedPortrait('p1-fighter.png') },
      avatars: { c1: approvedPortrait('p1-avatar.png') },
    };

    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });

    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(
      result.payload.player_one.portrait_url,
      'https://signed.test/p1-avatar.png?token=abc',
    );
  },
);

Deno.test(
  'resolveBattlePortraits — falls back to the fighter render when no avatar exists',
  async () => {
    // This is every pre-existing character.
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: { c1: approvedPortrait('p1-fighter.png') },
      // no `avatars` fixture at all
    };

    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });

    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(
      result.payload.player_one.portrait_url,
      'https://signed.test/p1-fighter.png?token=abc',
      'a character with no avatar must NOT go blank',
    );
  },
);

Deno.test(
  'resolveBattlePortraits — carries equipped cosmetics to the opponent',
  async () => {
    // The whole point of a frame or a title is that somebody else sees it, and
    // RLS on `characters` is select-own, so this payload is the only path.
    const battle = humanBattle();
    const withCosmetics = {
      ...battle,
      player_one_character: {
        ...(battle as { player_one_character: Record<string, unknown> })
          .player_one_character,
        cosmetic_config: { frame: 'neon_frame', title: 'royal_title' },
      },
    };
    const fx: Fixtures = {
      battle: withCosmetics as typeof battle,
      portraits: { c1: approvedPortrait('u1/c1/p.png') },
    };

    // Caller is player TWO, so player one is the opponent here.
    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u2',
    });
    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(result.payload.player_one.cosmetics, {
      frame: 'neon_frame',
      title: 'royal_title',
    });
  },
);

Deno.test(
  'resolveBattlePortraits — a character with no cosmetics reports null',
  async () => {
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: { c1: approvedPortrait('u1/c1/p.png') },
    };
    const result = await resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u1',
    });
    assertEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(result.payload.player_one.cosmetics, null);
  },
);

Deno.test(
  'resolveBattlePortraits — a distinct fighter render is signed separately',
  () => {
    // The viewer opens the full-body render; the strips keep the circle-cropped
    // avatar. Two different images, so two signed URLs.
    const fx: Fixtures = {
      battle: humanBattle(),
      portraits: {
        c1: approvedPortrait('u1/c1/fighter.png'),
        c2: approvedPortrait('u2/c2/fighter.png'),
      },
      avatars: {
        c1: approvedPortrait('u1/c1/avatar.png'),
        c2: approvedPortrait('u2/c2/avatar.png'),
      },
    };
    return resolveBattlePortraits(createMockSupabase(fx), {
      battleId: 'battle-1',
      callerUserId: 'u2',
    }).then((result) => {
      assertEquals(result.kind, 'ok');
      if (result.kind !== 'ok') return;

      assertEquals(
        result.payload.player_one.portrait_url,
        'https://signed.test/u1/c1/avatar.png?token=abc',
      );
      assertEquals(
        result.payload.player_one.fighter_url,
        'https://signed.test/u1/c1/fighter.png?token=abc',
      );
      // Served for the OPPONENT too — the deliberate product decision that a
      // character you are fighting is one you can look at.
      assertEquals(
        result.payload.player_two.fighter_url,
        'https://signed.test/u2/c2/fighter.png?token=abc',
      );
    });
  },
);
