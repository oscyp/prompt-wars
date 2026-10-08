import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  parseAvatarRequest,
  resolvePlayerAvatars,
} from "../sign-player-avatars/resolve.ts";
import { handleAvatarRequest } from "../sign-player-avatars/handler.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = id(1),
  opponent = id(2),
  character = id(3),
  asset = id(4),
  battle = id(5);
Deno.test("HTTP authentication runs before validation or service signing", async () => {
  let calls = 0;
  const request = () =>
    new Request("https://local.test", {
      method: "POST",
      body: JSON.stringify({ profile_ids: [opponent] }),
    });
  const resolve = () => {
    calls++;
    return Promise.resolve({ players: {}, battles: {} });
  };
  assertEquals(
    (await handleAvatarRequest(request(), {
      authenticate: () => Promise.reject(new Error()),
      resolve,
    })).status,
    401,
  );
  assertEquals(calls, 0);
  assertEquals(
    (await handleAvatarRequest(request(), {
      authenticate: () => Promise.resolve(caller),
      resolve,
    })).status,
    200,
  );
  assertEquals(calls, 1);
});
function fixture(overrides: Record<string, unknown[]> = {}, fail = "") {
  const rows: Record<string, unknown[]> = {
    blocks: [],
    characters: [{
      id: character,
      profile_id: opponent,
      is_active: true,
      avatar_portrait_id: asset,
    }],
    battles: [{
      id: battle,
      player_one_id: caller,
      player_two_id: opponent,
      player_two_character_id: character,
      identity_snapshot: {
        player_two: { id: character, avatar: { image_path: "frozen.png" } },
      },
    }],
    character_portraits: [{
      id: asset,
      character_id: character,
      profile_id: opponent,
      kind: "avatar",
      moderation_status: "approved",
      is_current: true,
      image_path: "frozen.png",
    }],
    ...overrides,
  };
  const signed: string[][] = [];
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      let data = rows[table] ?? [];
      const q = {
        select() {
          return q;
        },
        in(key: string, values: unknown[]) {
          data = data.filter((r: any) => values.includes(r[key]));
          return q;
        },
        eq(key: string, value: unknown) {
          data = data.filter((r: any) => r[key] === value);
          return q;
        },
        or() {
          return q;
        },
        then(resolve: (value: unknown) => void) {
          resolve({
            data: data.slice(0, 1000),
            error: fail === table ? { message: "offline" } : null,
          });
        },
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        assertEquals(bucket, "character-portraits");
        return {
          createSignedUrls(paths: string[]) {
            signed.push(paths);
            return Promise.resolve({
              error: fail === "sign" ? {} : null,
              data: paths.map((path) => ({
                path,
                signedUrl: `https://media.test/${path}`,
              })),
            });
          },
        };
      },
    },
  };
  return { client: client as any, signed, reads };
}

Deno.test("avatar contract accepts identifiers only, deduplicates and bounds combined batches", () => {
  assertEquals(
    parseAvatarRequest({
      profile_ids: [opponent, opponent],
      battle_ids: [battle],
    }),
    { profile_ids: [opponent], battle_ids: [battle] },
  );
  for (
    const body of [{ image_path: "secret" }, {}, { profile_ids: ["bad"] }, {
      profile_ids: [null],
    }, { profile_ids: Array.from({ length: 51 }, (_, n) => id(n)) }]
  ) {
    assertThrows(() => parseAvatarRequest(body));
  }
});

Deno.test("current and frozen avatars share one authorized batch signing call", async () => {
  const f = fixture();
  const result = await resolvePlayerAvatars(f.client, caller, {
    profile_ids: [opponent],
    battle_ids: [battle],
  }, 0);
  assertEquals(result.players[opponent].asset_id, asset);
  assertEquals(result.battles[battle].status, "available");
  assertEquals(
    result.players[opponent].expires_at,
    new Date(3600_000).toISOString(),
  );
  assertEquals(f.signed, [["frozen.png"]]);
});

Deno.test("unauthorized and legacy battles never sign even in mixed batches", async () => {
  const f = fixture({
    battles: [
      {
        id: battle,
        player_one_id: id(9),
        player_two_id: opponent,
        identity_snapshot: {
          player_two: { id: character, avatar: { image_path: "frozen.png" } },
        },
      },
      { id: id(6), player_one_id: caller, player_two_id: opponent },
    ],
  });
  const result = await resolvePlayerAvatars(f.client, caller, {
    profile_ids: [opponent],
    battle_ids: [battle, id(6)],
  });
  assertEquals(result.players[opponent].status, "available");
  assertEquals(result.battles[battle].status, "unavailable");
  assertEquals(result.battles[id(6)].status, "unavailable");
});

Deno.test("both directions of blocking suppress current and frozen portraits", async () => {
  for (const [a, b] of [[caller, opponent], [opponent, caller]]) {
    const f = fixture({
      blocks: [{ blocker_profile_id: a, blocked_profile_id: b }],
    });
    const result = await resolvePlayerAvatars(f.client, caller, {
      profile_ids: [opponent],
      battle_ids: [battle],
    });
    assertEquals(result.players[opponent].status, "unavailable");
    assertEquals(result.battles[battle].status, "unavailable");
    assertEquals(f.signed.length, 0);
  }
});

Deno.test("snapshot path cannot bypass current moderation, ownership, kind or removal", async () => {
  for (
    const change of [
      { moderation_status: "rejected" },
      { moderation_status: "pending" },
      { profile_id: id(7) },
      { character_id: id(8) },
      { kind: "fighter" },
    ]
  ) {
    const f = fixture({
      character_portraits: [{
        id: asset,
        character_id: character,
        profile_id: opponent,
        image_path: "frozen.png",
        kind: "avatar",
        moderation_status: "approved",
        is_current: true,
        ...change,
      }],
    });
    const result = await resolvePlayerAvatars(f.client, caller, {
      profile_ids: [opponent],
      battle_ids: [battle],
    });
    assertEquals(result.players[opponent].status, "unavailable");
    assertEquals(result.battles[battle].status, "unavailable");
    assertEquals(f.signed.length, 0);
  }
  const f = fixture({ character_portraits: [] });
  assertEquals(
    (await resolvePlayerAvatars(f.client, caller, {
      profile_ids: [],
      battle_ids: [battle],
    })).battles[battle].status,
    "unavailable",
  );
});

Deno.test("battle keeps approved non-current avatar after a new portrait is selected", async () => {
  const f = fixture({
    character_portraits: [
      {
        id: asset,
        character_id: character,
        profile_id: opponent,
        kind: "avatar",
        moderation_status: "approved",
        is_current: false,
        image_path: "frozen.png",
      },
      {
        id: id(10),
        character_id: character,
        profile_id: opponent,
        kind: "avatar",
        moderation_status: "approved",
        is_current: true,
        image_path: "new.png",
      },
    ],
    characters: [{
      id: character,
      profile_id: opponent,
      is_active: true,
      avatar_portrait_id: id(10),
    }],
  });
  const result = await resolvePlayerAvatars(f.client, caller, {
    profile_ids: [opponent],
    battle_ids: [battle],
  });
  assertEquals(result.players[opponent].asset_id, id(10));
  assertEquals(result.battles[battle].asset_id, asset);
});

Deno.test("database and signing failure never produce new signing or mutation attempts", async () => {
  const f = fixture({}, "blocks");
  await assertRejects(() =>
    resolvePlayerAvatars(f.client, caller, {
      profile_ids: [opponent],
      battle_ids: [],
    })
  );
  assertEquals(f.signed.length, 0);
  const signing = fixture({}, "sign");
  assertEquals(
    (await resolvePlayerAvatars(signing.client, caller, {
      profile_ids: [opponent],
      battle_ids: [],
    })).players[opponent].status,
    "retryable",
  );
});

Deno.test("block authorization is bounded even for accounts with more than 1000 relationships", async () => {
  const blocks = Array.from(
    { length: 1001 },
    (_, n) => ({ blocker_profile_id: caller, blocked_profile_id: id(n + 100) }),
  );
  blocks.push({ blocker_profile_id: opponent, blocked_profile_id: caller });
  const f = fixture({ blocks });
  const result = await resolvePlayerAvatars(f.client, caller, {
    profile_ids: [opponent],
    battle_ids: [battle],
  });
  assertEquals(result.players[opponent].status, "unavailable");
  assertEquals(result.players[opponent].identity, undefined);
  assertEquals(f.signed.length, 0);
});
