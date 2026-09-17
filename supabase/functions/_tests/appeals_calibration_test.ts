import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  reconstructAppeal,
  assertIndependentCalls,
  calibrationEligible,
} from '../_shared/appeals.ts';
const stats = { strength: 5, stamina: 10, agility: 5, focus: 5 };
const input = {
  format: 'bo3' as const,
  rulesVersion: 2,
  playerOne: stats,
  playerTwo: stats,
  originalWinner: 1 as const,
};
const round = (a: number, b: number) => ({
  playerOneBase: a,
  playerTwoBase: b,
  playerOneMove: 'attack' as const,
  playerTwoMove: 'attack' as const,
});
Deno.test('two played rounds requiring unplayed third becomes no contest', () =>
  assertEquals(
    reconstructAppeal({ ...input, rounds: [round(30, 25), round(25, 30)] })
      .status,
    'no_contest',
  ),
);
Deno.test('two round sweep upheld and changed winner overturned', () => {
  assertEquals(
    reconstructAppeal({ ...input, rounds: [round(30, 25), round(30, 25)] })
      .status,
    'upheld',
  );
  assertEquals(
    reconstructAppeal({ ...input, rounds: [round(25, 30), round(25, 30)] })
      .status,
    'overturned',
  );
});
Deno.test(
  'three round reconstruction and earlier terminal retains forensic input count',
  () => {
    const r = reconstructAppeal({
      ...input,
      rounds: [round(30, 25), round(30, 25), round(25, 30)],
    });
    assertEquals(r.rounds.length, 2);
    assertEquals(r.playedRounds, 3);
    assertEquals(r.winner, 1);
    assertEquals(
      reconstructAppeal({
        ...input,
        rounds: [round(30, 25), round(25, 30), round(25, 30)],
      }).winner,
      2,
    );
  },
);
Deno.test(
  'legacy single uses judge outcome without Bo3 stat bonus; timeout preserved',
  () => {
    assertEquals(
      reconstructAppeal({
        ...input,
        format: 'single',
        rounds: [{ ...round(10, 20), singleWinner: 2 }],
      }).winner,
      2,
    );
    assertEquals(
      reconstructAppeal({
        ...input,
        format: 'single',
        rounds: [{ ...round(0, 0), forfeitWinner: 1 }],
      }).status,
      'upheld',
    );
  },
);
Deno.test(
  'independent calls reject original actual model, mock fallback and unexpected alias',
  () => {
    assertThrows(() =>
      assertIndependentCalls(
        [{ model_id: 'primary', fallback: false, prompt_version: 'v' }],
        'primary',
        ['primary'],
        'v',
      ),
    );
    assertThrows(() =>
      assertIndependentCalls(
        [{ model_id: 'review', fallback: true, prompt_version: 'v' }],
        'review',
        ['primary'],
        'v',
      ),
    );
    assertThrows(() =>
      assertIndependentCalls(
        [{ model_id: 'alias', fallback: false, prompt_version: 'v' }],
        'review',
        ['primary'],
        'v',
      ),
    );
    assertIndependentCalls(
      [{ model_id: 'review', fallback: false, prompt_version: 'v' }],
      'review',
      ['primary'],
      'v',
    );
  },
);
Deno.test('calibration requires actual successful independent evidence', () => {
  const c = {
    status: 'passed',
    judge_model_id: 'review',
    judge_prompt_version: 'v',
    locale: 'en',
    created_at: new Date().toISOString(),
    total_count: 1,
    threshold: 0.9,
    accuracy: 1,
    per_item_results: [
      { calls: [{ model_id: 'review', fallback: false, prompt_version: 'v' }] },
    ],
  };
  assertEquals(calibrationEligible(c, 'review', 'v', 'en', 168), true);
  assertEquals(
    calibrationEligible(
      { ...c, per_item_results: [] },
      'review',
      'v',
      'en',
      168,
    ),
    false,
  );
  assertEquals(
    calibrationEligible({ ...c, status: 'failed' }, 'review', 'v', 'en', 168),
    false,
  );
  assertEquals(calibrationEligible(c, 'review', 'v', 'pl', 168), false);
});

import { judgeAppealRound } from '../_shared/appeals-service.ts';
import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
Deno.test(
  'provider failure propagates from real review path without mock appeal',
  async () => {
    const p = {
      text: 'A locked original prompt',
      moveType: 'attack' as const,
      wordCount: 4,
    };
    await assertRejects(
      () =>
        judgeAppealRound(
          {
            getModelId: () => 'review',
            judge: () => Promise.reject(new Error('provider offline')),
          },
          p,
          p,
          null,
          'review',
          ['original'],
        ),
      Error,
      'provider offline',
    );
  },
);
Deno.test(
  'incomplete and stale calibration evidence never enables submissions',
  () => {
    const c = {
      status: 'passed',
      judge_model_id: 'review',
      judge_prompt_version: 'v',
      locale: 'en',
      created_at: '2020-01-01',
      total_count: 1,
      threshold: 0.9,
      accuracy: 1,
      per_item_results: [
        {
          calls: [{ model_id: 'review', fallback: false, prompt_version: 'v' }],
        },
      ],
    };
    assertEquals(calibrationEligible(c, 'review', 'v', 'en', 168), false);
    assertEquals(
      calibrationEligible(
        {
          ...c,
          created_at: new Date().toISOString(),
          per_item_results: [
            {
              calls: [
                { model_id: 'review', fallback: true, prompt_version: 'v' },
              ],
            },
          ],
        },
        'review',
        'v',
        'en',
        168,
      ),
      false,
    );
  },
);

import { XAIJudgeProvider } from '../_shared/providers.ts';
Deno.test(
  'independent provider requires actual returned model, primary constructor unchanged',
  async () => {
    const oldKey = Deno.env.get('JUDGE_API_KEY'),
      oldFetch = globalThis.fetch;
    Deno.env.set('JUDGE_API_KEY', 'fixture-only');
    const scores = {
      clarity: 5,
      originality: 5,
      specificity: 5,
      theme_fit: 5,
      archetype_fit: 5,
      dramatic_potential: 5,
    };
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    playerOneScores: scores,
                    playerTwoScores: scores,
                    explanation: 'fixture',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    try {
      const p = new XAIJudgeProvider('independent-exact-model');
      await assertRejects(
        () =>
          p.judge({
            promptOne: 'one',
            promptTwo: 'two',
            moveTypeOne: 'attack',
            moveTypeTwo: 'attack',
            theme: null,
            promptVersion: 'v',
            seed: 1,
          }),
        Error,
        'missing actual model',
      );
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey === undefined) Deno.env.delete('JUDGE_API_KEY');
      else Deno.env.set('JUDGE_API_KEY', oldKey);
    }
  },
);
