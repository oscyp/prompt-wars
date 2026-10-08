import {
  assertEquals,
  assertRejects,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCinematicInput } from '../_shared/cinematic-inputs.ts';
import { CinematicPreparationError } from '../_shared/cinematic-references.ts';
import { cinematicSource } from './fixtures/cinematic.ts';
import { moderateCinematicInput } from '../_shared/cinematic-moderation.ts';

function fixture() {
  const source: any = cinematicSource();
  const input = buildCinematicInput(source);
  const prompts = [
    { id: 'prompt-one', profile_id: 'one', moderation_status: 'approved' },
    { id: 'prompt-two', profile_id: 'two', moderation_status: 'approved' },
  ];
  const audits: any[] = [],
    filters: any[] = [];
  let auditError = false;
  const db: any = {
    from(table: string) {
      let value: any;
      const scope: any = {};
      const q: any = {
        select: () => q,
        eq: (key: string, val: any) => {
          scope[key] = val;
          return q;
        },
        insert: (v: any) => {
          value = v;
          return q;
        },
        then: (resolve: any) => {
          if (table === 'battle_prompts') {
            filters.push(scope);
            return Promise.resolve({ data: prompts, error: null }).then(
              resolve,
            );
          }
          if (table === 'moderation_events') {
            audits.push(value);
            return Promise.resolve({
              data: { id: 'audit' },
              error: auditError ? { message: 'audit down' } : null,
            }).then(resolve);
          }
          throw Error(table);
        },
      };
      return q;
    },
  };
  return {
    source,
    input,
    prompts,
    audits,
    filters,
    db,
    auditOutage: () => {
      auditError = true;
    },
  };
}
async function configured(
  overrides: Record<string, string | null>,
  run: () => Promise<void>,
) {
  const keys = [
    'ENVIRONMENT',
    'DENO_ENV',
    'DENO_TESTING',
    'OPENAI_API_KEY',
    'PERSPECTIVE_API_KEY',
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  keys.forEach((key) => Deno.env.delete(key));
  Object.entries(overrides).forEach(([key, value]) =>
    value === null ? Deno.env.delete(key) : Deno.env.set(key, value),
  );
  try {
    await run();
  } finally {
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!),
    );
  }
}

for (const status of ['rejected', 'pending', 'flagged_human_review']) {
  Deno.test(
    `cinematic moderation refuses a currently ${status} locked human prompt`,
    async () => {
      await configured({ ENVIRONMENT: 'test' }, async () => {
        const f = fixture();
        f.prompts[0].moderation_status = status;
        const error = await assertRejects(
          () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
          CinematicPreparationError,
        );
        assertEquals((error as CinematicPreparationError).retryable, false);
        assertEquals(f.filters[0], {
          battle_id: 'battle',
          round_number: 3,
          is_locked: true,
        });
        assertEquals(f.audits[0].target_type, 'battle_prompt');
        assertEquals(f.audits[0].target_id, 'prompt-one');
        assert(f.audits[0].moderator_notes.includes('job'));
      });
    },
  );
}
Deno.test(
  'cinematic moderation rechecks saved human and bot move texts without mutating the snapshot',
  async () => {
    await configured({ ENVIRONMENT: 'test' }, async () => {
      const f = fixture();
      f.source.battle.is_player_two_bot = true;
      f.source.battle.player_two_id = null;
      f.prompts.splice(1);
      const original = structuredClone(f.input);
      await moderateCinematicInput(f.db, f.input, f.source.battle, 'job');
      assertEquals(f.input, original);
      assertEquals(
        f.audits.map((a) => a.action),
        ['approved', 'approved'],
      );
      assertEquals(f.audits[1].target_id, 'battle');
      f.input.moves.p2!.text = 'This move includes explicit sexual content.';
      const error = await assertRejects(
        () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
        CinematicPreparationError,
      );
      assertEquals((error as CinematicPreparationError).retryable, false);
      assertEquals(f.audits.at(-1).action, 'rejected');
    });
  },
);
Deno.test(
  'cinematic moderation fails closed with a retryable error when unconfigured in production',
  async () => {
    await configured({ ENVIRONMENT: 'production' }, async () => {
      const f = fixture();
      const error = await assertRejects(
        () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
        CinematicPreparationError,
      );
      assertEquals((error as CinematicPreparationError).retryable, true);
      assertEquals(f.audits.length, 0);
    });
  },
);
Deno.test(
  'cinematic moderation provider outage is retryable and audited rather than approved',
  async () => {
    await configured(
      { ENVIRONMENT: 'production', OPENAI_API_KEY: 'test-openai-key' },
      async () => {
        const oldFetch = globalThis.fetch;
        globalThis.fetch = (() =>
          Promise.resolve(
            new Response('down', { status: 503 }),
          )) as typeof fetch;
        try {
          const f = fixture();
          const error = await assertRejects(
            () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
            CinematicPreparationError,
          );
          assertEquals((error as CinematicPreparationError).retryable, true);
          assertEquals(f.audits[0].action, 'flagged_human_review');
          assertEquals(f.audits[0].provider, 'unavailable');
        } finally {
          globalThis.fetch = oldFetch;
        }
      },
    );
  },
);
Deno.test(
  'cinematic moderation cannot proceed when its audit cannot be stored',
  async () => {
    await configured({ ENVIRONMENT: 'test' }, async () => {
      const f = fixture();
      f.auditOutage();
      const error = await assertRejects(
        () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
        CinematicPreparationError,
      );
      assertEquals((error as CinematicPreparationError).retryable, true);
    });
  },
);
Deno.test(
  'a missing nonforfeiting human approval is retryable and never accepted from a frozen move alone',
  async () => {
    await configured({ ENVIRONMENT: 'test' }, async () => {
      const f = fixture();
      f.prompts.splice(0);
      const error = await assertRejects(
        () => moderateCinematicInput(f.db, f.input, f.source.battle, 'job'),
        CinematicPreparationError,
      );
      assertEquals((error as CinematicPreparationError).retryable, true);
    });
  },
);

Deno.test(
  'cinematic forfeit without a move skips absent action moderation honestly',
  async () => {
    await configured({ ENVIRONMENT: 'test' }, async () => {
      const f = fixture();
      f.input.moves.p1 = null;
      f.input.outcome.forfeit = 'p1';
      f.prompts.splice(0, 1);
      await moderateCinematicInput(f.db, f.input, f.source.battle, 'job');
      assertEquals(f.audits.length, 1);
      assertEquals(f.audits[0].target_id, 'prompt-two');
    });
  },
);
