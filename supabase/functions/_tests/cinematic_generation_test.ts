import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { prepareCinematicGeneration } from '../_shared/cinematic-generation.ts';
import { cinematicSource } from './fixtures/cinematic.ts';

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

function cinematicTest(name: string, run: () => Promise<void>) {
  Deno.test(name, () => withCinematicTestEnvironment(run));
}
const approvedPrompts = [
  { id: 'prompt-one', profile_id: 'one', moderation_status: 'approved' },
  { id: 'prompt-two', profile_id: 'two', moderation_status: 'approved' },
];

cinematicTest(
  'generation retries reuse private snapshot after characters, moves, subscription and signing tokens change',
  async () => {
    const source = cinematicSource();
    let saved: any = null,
      signCount = 0,
      roundReads = 0;
    const job = {
      id: 'job',
      battle_id: 'battle',
      battle_round_id: 'round',
      round_number: 3,
      ...source.policy,
    };
    const db: any = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const result = () => {
          if (table === 'video_job_inputs')
            return { data: saved ? { payload: saved } : null };
          if (table === 'battle_rounds') {
            roundReads++;
            return { data: source.round };
          }
          if (table === 'battle_prompts') return { data: approvedPrompts };
          if (table === 'moderation_events') return { data: {} };
          if (table === 'signature_items')
            return {
              data: {
                id: filters.id,
                moderation_status: 'approved',
                name: 'Copper shield',
              },
            };
          if (table === 'character_portraits')
            return {
              data: {
                id: filters.id,
                image_path: filters.image_path,
                moderation_status: 'approved',
              },
            };
          throw Error(table);
        };
        const q = {
          select: () => q,
          insert: () => q,
          eq: (k: string, v: unknown) => {
            filters[k] = v;
            return q;
          },
          maybeSingle: async () => result(),
          single: async () => result(),
          then: (resolve: any) => Promise.resolve(result()).then(resolve),
        };
        return q;
      },
      rpc(name: string, args: any) {
        assertEquals(name, 'persist_cinematic_input');
        saved ??= structuredClone(args.p_payload);
        return Promise.resolve({ data: saved });
      },
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => ({
            data: {
              signedUrl: `https://assets.test/${path}?token=${++signCount}`,
            },
          }),
        }),
      },
    };
    const first = await prepareCinematicGeneration(
      db,
      job,
      source.battle,
      'lease',
    );
    source.round.judge_payload.frozen_inputs.player_one.text = 'Changed';
    source.battle.identity_snapshot.player_one.name = 'Edited';
    const retry = await prepareCinematicGeneration(
      db,
      job,
      source.battle,
      'lease',
    );
    assertEquals(retry.cinematicInput, first.cinematicInput);
    assertEquals(retry.playerOneCharacterName, 'Ash');
    assertEquals(retry.playerOnePrompt, 'I cross with my shield.');
    assertEquals(retry.targetDurationSeconds, 15);
    assertEquals(roundReads, 1);
    assertEquals(
      first.cinematicReferences![0].url === retry.cinematicReferences![0].url,
      false,
    );
  },
);

cinematicTest(
  'generation never submits when snapshot persistence loses its lease',
  async () => {
    const source = cinematicSource();
    const db: any = {
      from(table: string) {
        const q = {
          select: () => q,
          insert: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: table === 'battle_rounds' ? source.round : null,
          }),
          then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve),
        };
        return q;
      },
      rpc: async () => ({ error: { message: 'cinematic_lease_lost' } }),
    };
    await assertRejects(
      () =>
        prepareCinematicGeneration(
          db,
          {
            id: 'job',
            battle_id: 'battle',
            battle_round_id: 'round',
            round_number: 3,
            ...source.policy,
          },
          source.battle,
          'old',
        ),
      Error,
      'cinematic_lease_lost',
    );
  },
);

cinematicTest(
  'legacy identity capture uses the battle CAS winner across separate round jobs',
  async () => {
    const source = cinematicSource();
    const frozen = structuredClone(source.battle.identity_snapshot);
    const battle: any = {
      ...source.battle,
      identity_snapshot: null,
      player_one_character_id: 'Ash',
      player_two_character_id: 'Vex',
    };
    const saved = new Map<string, any>();
    let captures = 0;
    const db: any = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        let update: any;
        const result = () => {
          if (table === 'video_job_inputs')
            return {
              data: saved.has(String(filters.video_job_id))
                ? { payload: saved.get(String(filters.video_job_id)) }
                : null,
            };
          if (table === 'battle_rounds') return { data: source.round };
          if (table === 'battle_prompts') return { data: approvedPrompts };
          if (table === 'moderation_events') return { data: {} };
          if (table === 'characters')
            return {
              data: {
                id: filters.id,
                name: 'Edited after battle',
                archetype: 'mystic',
                appearance_version: 99,
              },
            };
          if (table === 'character_portraits')
            return {
              data: {
                id: filters.id,
                image_path: filters.image_path,
                moderation_status: 'approved',
              },
            };
          if (table === 'signature_items')
            return { data: { moderation_status: 'approved' } };
          if (table === 'battles') {
            if (update) {
              captures++;
              return { data: null };
            }
            return { data: { identity_snapshot: frozen } };
          }
          throw Error(table);
        };
        const q: any = {
          select: () => q,
          insert: () => q,
          eq: (k: string, v: unknown) => {
            filters[k] = v;
            return q;
          },
          is: () => q,
          update: (v: unknown) => {
            update = v;
            return q;
          },
          order: () => q,
          limit: async () => ({ data: [] }),
          single: async () => result(),
          maybeSingle: async () => result(),
          then: (resolve: any) => Promise.resolve(result()).then(resolve),
        };
        return q;
      },
      rpc: async (_name: string, args: any) => {
        saved.set(args.p_job_id, args.p_payload);
        return { data: args.p_payload };
      },
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://assets.test/${path}` },
          }),
        }),
      },
    };
    for (const id of ['job-one', 'job-two']) {
      const request = await prepareCinematicGeneration(
        db,
        {
          id,
          battle_id: 'battle',
          battle_round_id: 'round',
          round_number: 3,
          ...source.policy,
        },
        battle,
        'lease',
      );
      assertEquals(request.playerOneCharacterName, 'Ash');
      assertEquals(request.cinematicInput?.fighters.p1.appearanceVersion, 2);
    }
    assertEquals(captures, 2);
    assertEquals(saved.get('job-one'), saved.get('job-two'));
  },
);
