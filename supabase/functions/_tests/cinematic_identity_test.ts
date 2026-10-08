import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { resolveCurrentPortrait } from '../_shared/compose-reveal-payload.ts';

// Capturing a different portrait/version would silently rewrite a battle's fighter.
Deno.test(
  'portrait resolver retains immutable portrait identity and appearance version',
  async () => {
    const row = {
      id: 'portrait-old',
      image_path: 'u/c/old.png',
      thumb_path: null,
      seed: 7,
      appearance_version: 4,
      moderation_status: 'approved',
    };
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: [row], error: null }),
    };
    const portrait = await resolveCurrentPortrait(
      { from: () => query } as any,
      'c',
    );
    assertEquals((portrait as any)?.id, 'portrait-old');
    assertEquals((portrait as any)?.appearance_version, 4);
  },
);

const loadIdentity = () =>
  import('../_shared/cinematic-identity.ts').catch(() => null);
const character = {
  id: 'c1',
  profile_id: 'u1',
  name: 'Aria',
  archetype: 'strategist',
  signature_color: '#123456',
  battle_cry: 'Go!',
  appearance_version: 4,
  starter_asset_key: null,
  vibe: 'quiet',
  silhouette: 'slender',
  era: 'future',
  expression: 'calm',
  palette_key: 'ice',
  art_style: 'comic',
  signature_item_id: 'item1',
  cosmetic_config: { frame: 'gold' },
};
const fighter = {
  id: 'portrait-old',
  image_path: 'u1/c1/old.png',
  thumb_path: null,
  seed: 7,
  appearance_version: 4,
  moderation_status: 'approved',
};
const item = {
  id: 'item1',
  profile_id: 'u1',
  kind: 'custom',
  name: 'Star key',
  description: 'A silver key',
  item_class: 'tool',
  prompt_fragment: 'holding a silver star key',
  image_path: 'u1/item1.png',
  moderation_status: 'approved',
};

Deno.test(
  'battle identity freezes complete appearance and approved signature item',
  async () => {
    const module = await loadIdentity();
    assert(module, 'cinematic identity snapshot feature is missing');
    const identity = module.snapshotCinematicFighter({
      character,
      fighter,
      signatureItem: item,
    });
    character.name = 'Edited';
    character.signature_color = '#ffffff';
    item.prompt_fragment = 'edited gear';
    assertEquals(identity.name, 'Aria');
    assertEquals(identity.signature_color, '#123456');
    assertEquals(identity.appearance_version, 4);
    assertEquals(identity.vibe, 'quiet');
    assertEquals(
      identity.signature_item?.prompt_fragment,
      'holding a silver star key',
    );
    assertEquals(identity.signature_item?.bucket, 'signature-items-custom');
    assertEquals(identity.fighter?.id, 'portrait-old');
    assertEquals(identity.fighter?.image_path, 'u1/c1/old.png');
    character.name = 'Aria';
    character.signature_color = '#123456';
    item.prompt_fragment = 'holding a silver star key';
  },
);

Deno.test(
  'unsafe and stale artwork never becomes cinematic reference artwork',
  async () => {
    const module = await loadIdentity();
    assert(module, 'cinematic identity snapshot feature is missing');
    for (const moderation_status of ['pending', 'rejected', 'taken_down']) {
      assertEquals(
        module.snapshotCinematicFighter({
          character,
          fighter: { ...fighter, moderation_status },
          signatureItem: { ...item, moderation_status },
        }).cinematic_fighter,
        null,
      );
      assertEquals(
        module.snapshotCinematicFighter({
          character,
          fighter,
          signatureItem: { ...item, moderation_status },
        }).signature_item,
        null,
      );
    }
    assertEquals(
      module.snapshotCinematicFighter({
        character,
        fighter: { ...fighter, appearance_version: 3 },
      }).cinematic_fighter,
      null,
    );
  },
);

Deno.test(
  'historical partial identity never borrows current gear or current artwork',
  async () => {
    const module = await loadIdentity();
    assert(module, 'cinematic identity snapshot feature is missing');
    const frozen = {
      id: 'c1',
      name: 'Old name',
      archetype: 'strategist',
      signature_color: '#010203',
      fighter: {
        image_path: 'u1/c1/historical.png',
        seed: 8,
        thumb_path: null,
      },
    };
    const identity = module.snapshotCinematicFighter({
      frozenIdentity: frozen,
      character,
      fighter,
      signatureItem: item,
    });
    assertEquals(identity.name, 'Old name');
    assertEquals(identity.signature_item, null);
    assertEquals(identity.appearance_version, null);
    assertEquals(identity.fighter?.image_path, 'u1/c1/historical.png');
    assertEquals(identity.identity_provenance, 'legacy_frozen');
  },
);

Deno.test(
  'bots and starters freeze provider accessible equivalents of bundled app art',
  async () => {
    const module = await loadIdentity();
    assert(module, 'cinematic identity snapshot feature is missing');
    const bot = module.snapshotCinematicFighter({
      character: { name: 'Bot', archetype: 'titan' },
      botPersonaId: 'bot1',
    });
    assertEquals(bot.id, null);
    assertEquals(bot.bot_persona_id, 'bot1');
    assertEquals(bot.cinematic_fighter?.bucket, 'character-portraits');
    assert(
      bot.cinematic_fighter?.image_path.includes(
        'cinematic-bundled/fighter/titan/',
      ),
    );
    const starter = module.snapshotCinematicFighter({
      character: { ...character, starter_asset_key: 'bundled:strategist' },
      signatureItem: item,
    });
    assertEquals(starter.starter_asset_key, 'bundled:strategist');
    assert(
      starter.cinematic_fighter?.image_path.includes(
        'cinematic-bundled/fighter/strategist/',
      ),
    );
  },
);

Deno.test(
  'capture retries a concurrent edit instead of mixing new gear with old artwork',
  async () => {
    const module = await loadIdentity();
    assert(module);
    let reads = 0;
    const original = { ...character, appearance_version: 4 };
    const edited = {
      ...character,
      appearance_version: 5,
      name: 'New name',
      signature_item_id: 'item2',
    };
    const db: any = {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const q: any = {
          select: () => q,
          eq: (key: string, value: unknown) => {
            filters[key] = value;
            return q;
          },
          order: () => q,
          single: async () => ({
            data: ++reads === 1 ? original : edited,
            error: null,
          }),
          maybeSingle: async () => ({
            data:
              filters.id === 'item1'
                ? item
                : { ...item, id: 'item2', name: 'New gear' },
            error: null,
          }),
          limit: async () => ({
            data: [{ ...fighter, appearance_version: reads === 1 ? 4 : 5 }],
            error: null,
          }),
        };
        return q;
      },
    };
    const frozen = await module.captureCinematicIdentity(db, 'c1');
    assertEquals(frozen.name, 'New name');
    assertEquals(frozen.signature_item?.id, 'item2');
    assertEquals(frozen.appearance_version, 5);
    assertEquals(frozen.fighter?.appearance_version, 5);
  },
);

Deno.test('capture fails retryably when edits never settle', async () => {
  const module = await loadIdentity();
  assert(module);
  let reads = 0;
  const db: any = {
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        single: async () => ({
          data: { ...character, appearance_version: ++reads },
          error: null,
        }),
        maybeSingle: async () => ({ data: item, error: null }),
        limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
  };
  await assertRejects(
    () => module.captureCinematicIdentity(db, 'c1'),
    Error,
    'cinematic_identity_concurrent_edit',
  );
});

Deno.test(
  'single and bo3 matchmaking freeze the same cinematic identity before later character edits',
  async () => {
    const { startFaceOff } = await import('../_shared/start-face-off.ts');
    for (const [format, missingPersona] of [
      ['single', false],
      ['bo3', false],
      ['single', true],
      ['bo3', true],
    ]) {
      let written: any = null;
      const battle = {
        id: 'battle1',
        format,
        mode: 'ranked',
        rules_version: 1,
        prompt_experience_version: 2,
        status: 'matched',
        face_off_revealed_at: null,
        player_one_id: 'u1',
        player_two_id: null,
        player_one_character_id: 'c1',
        player_two_character_id: null,
        is_player_two_bot: true,
        bot_persona_id: 'bot1',
        identity_snapshot: null,
      };
      const stats = {
        ...character,
        stat_strength: 5,
        stat_stamina: 5,
        stat_agility: 5,
        stat_focus: 5,
      };
      const db: any = {
        from: (table: string) => {
          const filters: Record<string, unknown> = {};
          let update: any;
          const one = () => ({
            data:
              table === 'battles'
                ? battle
                : table === 'bot_personas'
                  ? missingPersona
                    ? null
                    : { id: 'bot1', name: 'Bot', archetype: 'titan' }
                  : table === 'signature_items'
                    ? item
                    : stats,
            error: null,
          });
          const q: any = {
            select: () => q,
            eq: (key: string, value: unknown) => {
              filters[key] = value;
              return q;
            },
            is: () => q,
            update: (value: any) => {
              update = value;
              return q;
            },
            single: async () => one(),
            maybeSingle: async () => one(),
            order: () => q,
            limit: async () => ({ data: [fighter], error: null }),
            in: async () => ({ data: [stats], error: null }),
            then: (resolve: any) => {
              if (update) written = update.identity_snapshot;
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return q;
        },
        rpc: async (_name: string, args: any) => {
          written = args.p_identity;
          return { data: true, error: null };
        },
      };
      await startFaceOff(db, 'battle1');
      assertEquals(written?.player_one.appearance_version, 4);
      assertEquals(written?.player_one.signature_item?.name, 'Star key');
      assertEquals(written?.player_two.bot_persona_id, 'bot1');
      if (missingPersona)
        assertEquals(written?.player_two.cinematic_fighter, null);
      else
        assert(
          written?.player_two.cinematic_fighter?.image_path.includes('/titan/'),
        );
      stats.name = 'After matchmaking';
      assertEquals(written?.player_one.name, 'Aria');
    }
  },
);

Deno.test(
  'bundled asset publisher dry run verifies exact artwork bytes without credentials or uploads',
  async () => {
    const command = new Deno.Command('node', {
      args: ['scripts/publish-cinematic-reference-assets.mjs'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const result = await command.output();
    assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
    const report = JSON.parse(new TextDecoder().decode(result.stdout));
    assertEquals(report.mode, 'dry-run');
    assertEquals(report.uploaded, 0);
    assertEquals(report.assets.length, 21);
    const titan = report.assets.find(
      (asset: any) => asset.key === 'fighter:titan',
    );
    assertEquals(titan.local_path, 'assets/images/avatars/titan.jpg');
    const pen = report.assets.find(
      (asset: any) => asset.key === 'item:fountain_pen',
    );
    assertEquals(pen.local_path, 'assets/signature-icons/fountain_pen.jpg');
    assertEquals(pen.version.length, 64);
    assertEquals(
      pen.path,
      `cinematic-bundled/item/fountain_pen/${pen.version}.jpg`,
    );
  },
);

Deno.test(
  'Tier 0 keeps its captured artwork while unsafe cinematic references fail closed',
  async () => {
    const module = await loadIdentity();
    assert(module);
    const identity = module.snapshotCinematicFighter({
      character,
      fighter: { ...fighter, moderation_status: 'pending' },
      signatureItem: item,
    });
    assertEquals(identity.fighter?.image_path, 'u1/c1/old.png');
    assertEquals(identity.cinematic_fighter, null);
    const pendingGear = module.snapshotCinematicFighter({
      character,
      fighter,
      signatureItem: { ...item, moderation_status: 'pending' },
    });
    assertEquals(pendingGear.fighter?.image_path, 'u1/c1/old.png');
    assertEquals(pendingGear.cinematic_fighter, null);
  },
);

Deno.test(
  'missing item metadata does not block free battle capture and closes video references',
  async () => {
    const module = await loadIdentity();
    assert(module);
    const db: any = {
      from: () => {
        const q: any = {
          select: () => q,
          eq: () => q,
          order: () => q,
          single: async () => ({ data: character, error: null }),
          maybeSingle: async () => ({
            data: null,
            error: { message: 'temporary metadata read failure' },
          }),
          limit: async () => ({ data: [fighter], error: null }),
        };
        return q;
      },
    };
    const identity = await module.captureCinematicIdentity(db, 'c1');
    assertEquals(identity.fighter?.image_path, 'u1/c1/old.png');
    assertEquals(identity.signature_item, null);
    assertEquals(identity.cinematic_fighter, null);
  },
);
