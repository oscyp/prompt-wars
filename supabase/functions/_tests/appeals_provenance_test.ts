// deno-lint-ignore-file no-import-prefix
import {
  forfeitRoundPayload,
  recordedRoundForfeit,
} from '../_shared/round-forfeit.ts';
import { reconstructAppeal } from '../_shared/appeals.ts';
import { aggregateScore, JUDGE_PROMPT_VERSION } from '../_shared/judge.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  originalModelsFor,
  reviewerAvailability,
  processIndependentAppeal,
  judgeAppealRound,
} from '../_shared/appeals-service.ts';

// Project the requested columns: omitting the legacy scalar must fail this test.
function fixture(
  rounds: Record<string, unknown>[],
  runs: Record<string, unknown>[] = [],
) {
  const rows: Record<string, Record<string, unknown>[]> = {
    battles: [
      {
        format: 'bo3',
        player_one_id: 'p1',
        player_two_id: 'p2',
        judge_model_id: 'bo3-aggregate',
        score_payload: {},
      },
    ],
    battle_rounds: rounds,
    judge_runs: runs,
  };
  return {
    from(table: string) {
      let columns = '*';
      const result = () => ({
        data: (rows[table] ?? []).map((row) =>
          columns === '*'
            ? row
            : Object.fromEntries(
                columns.split(',').map((key) => [key, row[key]]),
              ),
        ),
        error: null,
      });
      const query = {
        select(value: string) {
          columns = value;
          return query;
        },
        eq() {
          return query;
        },
        single: () => Promise.resolve({ ...result(), data: result().data[0] }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof originalModelsFor>[0];
}
const round = (value: Record<string, unknown> = {}) => ({
  round_number: 1,
  status: 'result_ready',
  judge_payload: {},
  ...value,
});
Deno.test(
  'legacy scalar model alone disables same-model review without submitting allowance',
  async () => {
    const db = fixture([round({ judge_model_id: ' primary-v1, primary-v2 ' })]);
    const models = await originalModelsFor(db, 'battle');
    assertEquals(models.sort(), ['primary-v1', 'primary-v2']);
    const keys = ['APPEALS_ENABLED', 'APPEAL_JUDGE_MODEL', 'JUDGE_API_KEY'];
    const saved = keys.map((key) => Deno.env.get(key));
    try {
      Deno.env.set(keys[0], 'true');
      Deno.env.set(keys[1], 'primary-v2');
      Deno.env.set(keys[2], 'test-only');
      assertEquals((await reviewerAvailability(db, models)).available, false);
    } finally {
      keys.forEach((key, i) =>
        saved[i] === undefined
          ? Deno.env.delete(key)
          : Deno.env.set(key, saved[i]!),
      );
    }
  },
);
Deno.test(
  'one missing judged round identity fails closed despite another known model',
  async () => {
    assertEquals(
      await originalModelsFor(
        fixture([
          round({ judge_model_id: 'known' }),
          round({ round_number: 2 }),
        ]),
        'battle',
      ),
      [],
    );
  },
);
Deno.test(
  'round audit sequence recovers identity and ignores aggregate sentinels',
  async () => {
    assertEquals(
      await originalModelsFor(
        fixture([round()], [{ model_id: 'audited', run_sequence: 1 }]),
        'battle',
      ),
      ['audited'],
    );
  },
);
Deno.test(
  'call provenance retains every model, timeout and unplayed rounds need no judge identity',
  async () => {
    const db = fixture([
      round({
        judge_model_id: 'scalar',
        judge_payload: {
          calls: [{ model_id: 'first' }, { model_id: 'tie-break' }],
        },
      }),
      round({ round_number: 2, judge_payload: { resolution: 'timeout' } }),
      round({ round_number: 3, status: 'waiting_for_prompts' }),
    ]);
    assertEquals((await originalModelsFor(db, 'battle')).sort(), [
      'first',
      'scalar',
      'tie-break',
    ]);
  },
);

Deno.test(
  'legacy one-sided timeout remains reviewable without inventing unknown judge provenance',
  async () => {
    const timeout = round({
      round_number: 2,
      judge_model_id: 'forfeit',
      round_winner_id: 'p1',
      player_one_locked_at: '2026-09-13T10:00:00Z',
      player_two_locked_at: null,
      judge_payload: { forfeit_profile_id: null },
    });
    assertEquals(
      await originalModelsFor(
        fixture([round({ judge_model_id: 'primary' }), timeout]),
        'battle',
      ),
      ['primary'],
    );
    assertEquals(
      await originalModelsFor(
        fixture([
          round({ judge_model_id: 'primary' }),
          { ...timeout, judge_model_id: null },
        ]),
        'battle',
      ),
      [],
    );
    assertEquals(
      await originalModelsFor(
        fixture([
          round({ judge_model_id: 'primary' }),
          { ...timeout, player_two_locked_at: '2026-09-13T10:00:01Z' },
        ]),
        'battle',
      ),
      [],
    );
  },
);
function availabilityFixture(failure: Record<string, unknown>) {
  const calibration = {
    status: 'passed',
    judge_model_id: 'independent',
    judge_prompt_version: JUDGE_PROMPT_VERSION,
    locale: 'en',
    threshold: 0.9,
    accuracy: 1,
    total_count: 1,
    created_at: new Date().toISOString(),
    per_item_results: [
      {
        calls: [
          {
            model_id: 'independent',
            prompt_version: JUDGE_PROMPT_VERSION,
            fallback: false,
          },
        ],
      },
    ],
  };
  return {
    from(table: string) {
      let rows = table === 'appeals' ? [failure] : [calibration];
      const result = () => ({ data: rows, error: null });
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((row) => row[key as keyof typeof row] === value);
          return query;
        },
        gt(key: string, value: string) {
          rows = rows.filter(
            (row) => String(row[key as keyof typeof row] ?? '') > value,
          );
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(done: (result: unknown) => unknown) {
          return Promise.resolve(result()).then(done);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof reviewerAvailability>[0];
}
async function configured(work: () => Promise<void>) {
  const values = {
    APPEALS_ENABLED: 'true',
    APPEAL_JUDGE_MODEL: 'independent',
    APPEAL_JUDGE_LOCALE: 'en',
    JUDGE_API_KEY: 'test-only',
  };
  const saved = Object.keys(values).map((key) => Deno.env.get(key));
  try {
    Object.entries(values).forEach(([key, value]) => Deno.env.set(key, value));
    await work();
  } finally {
    Object.keys(values).forEach((key, i) =>
      saved[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, saved[i]!),
    );
  }
}
Deno.test(
  'an unrelated item under long retry backoff does not disable a calibrated reviewer',
  () =>
    configured(async () => {
      const failure = {
        id: 'old',
        review_status: 'retryable_failure',
        lease_expires_at: new Date(Date.now() + 320 * 60000).toISOString(),
        retry_after: new Date(Date.now() + 320 * 60000).toISOString(),
        last_error: 'Frozen fighter stats are missing',
      };
      assertEquals(
        (await reviewerAvailability(availabilityFixture(failure), ['primary']))
          .available,
        true,
      );
    }),
);
Deno.test(
  'actual provider cooldown disables only its exact model and stays separate from item retries',
  () =>
    configured(async () => {
      const failure = {
        id: 'old',
        review_status: 'retryable_failure',
        failed_provider_model: 'independent',
        provider_unavailable_until: new Date(Date.now() + 600000).toISOString(),
      };
      assertEquals(
        (await reviewerAvailability(availabilityFixture(failure), ['primary']))
          .available,
        false,
      );
      assertEquals(
        (
          await reviewerAvailability(
            availabilityFixture({
              ...failure,
              failed_provider_model: 'other-model',
            }),
            ['primary'],
          )
        ).available,
        true,
      );
    }),
);

Deno.test(
  'new inferred timeout payload passes provenance and retains its winner in replay',
  async () => {
    const payload = forfeitRoundPayload({
      loserId: 'p2',
      explicit: false,
      playerOne: { text: 'Held the line', moveType: 'defense', wordCount: 3 },
      playerTwo: { text: '', moveType: 'attack', wordCount: 0 },
      theme: 'storm',
      rulesVersion: 2,
    });
    assertEquals(payload.resolution, 'timeout');
    assertEquals(payload.forfeit_profile_id, 'p2');
    const timeout = round({
      round_number: 2,
      round_winner_id: 'p1',
      judge_model_id: 'forfeit',
      judge_payload: payload,
    });
    const models = await originalModelsFor(
      fixture([round({ judge_model_id: 'primary' }), timeout]),
      'battle',
    );
    assertEquals(models, ['primary']);
    await configured(async () =>
      assertEquals(
        (await reviewerAvailability(availabilityFixture({}), models)).available,
        true,
      ),
    );
    const timeoutWinner = recordedRoundForfeit(timeout, {
      player_one_id: 'p1',
      player_two_id: 'p2',
    });
    assertEquals(timeoutWinner, 1);
    const first = {
      text: 'The shield redirects the storm',
      moveType: 'defense' as const,
      wordCount: 5,
    };
    const second = {
      text: 'Lightning cracks against the shield',
      moveType: 'attack' as const,
      wordCount: 5,
    };
    const promptsSeen: string[] = [];
    const score = (n: number) => ({
      clarity: n,
      originality: n,
      specificity: n,
      theme_fit: n,
      archetype_fit: n,
      dramatic_potential: n,
    });
    const judged = await judgeAppealRound(
      {
        getModelId: () => 'independent',
        judge(request) {
          promptsSeen.push(request.promptOne, request.promptTwo);
          return Promise.resolve({
            playerOneScores: score(request.promptOne === first.text ? 9 : 5),
            playerTwoScores: score(request.promptTwo === first.text ? 9 : 5),
            explanation:
              'The shield redirects the attack with a specific counter.',
            modelId: 'independent',
            promptVersion: request.promptVersion,
          });
        },
      },
      first,
      second,
      'storm',
      'independent',
      models,
    );
    assertEquals(promptsSeen.length >= 4, true);
    assertEquals(
      promptsSeen.every((text) => text === first.text || text === second.text),
      true,
    );
    const stats = { strength: 5, stamina: 10, agility: 5, focus: 5 };
    const result = reconstructAppeal({
      format: 'bo3',
      rulesVersion: 2,
      originalWinner: 1,
      playerOne: stats,
      playerTwo: stats,
      rounds: [
        {
          playerOneBase: aggregateScore(judged.player_one_normalized_scores),
          playerTwoBase: aggregateScore(judged.player_two_normalized_scores),
          playerOneMove: 'defense',
          playerTwoMove: 'attack',
        },
        {
          playerOneBase: 0,
          playerTwoBase: 0,
          playerOneMove: 'defense',
          playerTwoMove: 'attack',
          forfeitWinner: timeoutWinner,
        },
      ],
    });
    assertEquals(result.winner, 1);
    assertEquals(result.status, 'upheld');
    assertEquals(result.rounds.length, 2);
  },
);
Deno.test(
  'legacy frozen one-sided prompts prove timeout only with matching recorded winner',
  () => {
    const base = {
      judge_model_id: 'forfeit',
      round_winner_id: 'p2',
      judge_payload: {
        frozen_inputs: {
          player_one: { text: '' },
          player_two: { text: 'Committed move' },
        },
      },
    };
    const players = { player_one_id: 'p1', player_two_id: 'p2' };
    assertEquals(recordedRoundForfeit(base, players), 2);
    assertEquals(
      recordedRoundForfeit({ ...base, round_winner_id: 'p1' }, players),
      undefined,
    );
    assertEquals(
      recordedRoundForfeit({ ...base, judge_model_id: undefined }, players),
      undefined,
    );
  },
);
Deno.test(
  'worker classifies missing data separately from an actual provider outage',
  () =>
    configured(async () => {
      const fetchBefore = globalThis.fetch;
      try {
        globalThis.fetch = () =>
          Promise.reject(new Error('simulated provider outage'));
        for (const providerOutage of [false, true]) {
          let failure: Record<string, unknown> | undefined;
          const b = {
            id: 'battle',
            format: 'bo3',
            player_one_id: 'p1',
            player_two_id: 'p2',
            winner_id: 'p1',
            judge_model_id: 'bo3-aggregate',
            score_payload: {},
          };
          const r = round({
            judge_model_id: 'primary',
            judge_payload: providerOutage
              ? {
                  frozen_inputs: {
                    player_one: {
                      text: 'A precise shield catches the falling storm',
                      moveType: 'defense',
                      wordCount: 8,
                    },
                    player_two: {
                      text: 'My spiral of sparks strikes the open gate',
                      moveType: 'attack',
                      wordCount: 9,
                    },
                  },
                }
              : {},
          });
          const calibration = {
            status: 'passed',
            judge_model_id: 'independent',
            judge_prompt_version: JUDGE_PROMPT_VERSION,
            locale: 'en',
            threshold: 0.9,
            accuracy: 1,
            total_count: 1,
            created_at: new Date().toISOString(),
            per_item_results: [
              {
                calls: [
                  {
                    model_id: 'independent',
                    prompt_version: JUDGE_PROMPT_VERSION,
                    fallback: false,
                  },
                ],
              },
            ],
          };
          const db = {
            from(table: string) {
              const rows =
                table === 'battles'
                  ? [b]
                  : table === 'battle_rounds'
                    ? [r]
                    : table === 'judge_calibration_runs'
                      ? [calibration]
                      : [];
              const q = {
                select() {
                  return q;
                },
                eq() {
                  return q;
                },
                gt() {
                  return q;
                },
                order() {
                  return q;
                },
                limit() {
                  return q;
                },
                single() {
                  return Promise.resolve({ data: rows[0], error: null });
                },
                maybeSingle() {
                  return Promise.resolve({
                    data: rows[0] ?? null,
                    error: null,
                  });
                },
                then(done: (value: unknown) => unknown) {
                  return Promise.resolve({ data: rows, error: null }).then(
                    done,
                  );
                },
              };
              return q;
            },
            rpc(name: string, args: Record<string, unknown>) {
              if (name === 'claim_independent_appeal')
                return Promise.resolve({
                  data: {
                    id: 'review',
                    battle_id: 'battle',
                    original_resolution: b,
                    attempts: 1,
                  },
                  error: null,
                });
              if (name === 'fail_independent_appeal_classified') {
                failure = args;
                return Promise.resolve({ data: null, error: null });
              }
              throw new Error('Unexpected mutation ' + name);
            },
          } as unknown as Parameters<typeof processIndependentAppeal>[0];
          assertEquals(
            (await processIndependentAppeal(db, 'review')).status,
            'retryable_failure',
          );
          assertEquals(
            failure?.p_failed_provider_model,
            providerOutage ? 'independent' : null,
          );
        }
      } finally {
        globalThis.fetch = fetchBefore;
      }
    }),
);
