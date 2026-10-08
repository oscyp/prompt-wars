import {
  assertEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  JUDGE_EVALUATION_CASES,
  JUDGE_EVALUATION_DATASET_VERSION,
} from '../_shared/judge-evaluation-corpus.ts';
import {
  applyHumanReview,
  budgetedEvaluationProvider,
  evaluationCaseDigest,
  runJudgeEvaluationCase,
} from '../_shared/judge-evaluation-runner.ts';
import type { JudgeRequest } from '../_shared/providers.ts';
const rubric = {
  clarity: 7,
  originality: 7,
  specificity: 7,
  theme_fit: 7,
  archetype_fit: 7,
  dramatic_potential: 7,
};
const fixtureProvider = (requests: JudgeRequest[]) => ({
  getModelId: () => 'fixture-model',
  judge: (r: JudgeRequest) => {
    requests.push(r);
    return Promise.resolve({
      playerOneScores: rubric,
      playerTwoScores: rubric,
      explanation: 'Both moves communicate equivalent causal plans.',
      modelId: 'fixture-model',
      promptVersion: r.promptVersion,
    });
  },
});

Deno.test(
  'evaluation runs real pipeline for candidate, legacy baseline and swapped position without coverage metadata',
  async () => {
    const requests: JudgeRequest[] = [];
    const item = JUDGE_EVALUATION_CASES.find(
      (c) => c.category === 'keyword_abuse',
    )!;
    const result = await runJudgeEvaluationCase(
      fixtureProvider(requests),
      item,
    );
    assertEquals(
      requests.map((r) => r.promptVersion),
      [
        'v2.0.0-ideas',
        'v2.0.0-ideas',
        'v1.0.0-mvp',
        'v1.0.0-mvp',
        'v2.0.0-ideas',
        'v2.0.0-ideas',
      ],
    );
    assertEquals(requests[0].situationSnapshot, item.situationSnapshot);
    assertEquals(requests[2].situationSnapshot, undefined);
    assertEquals(requests[4].promptOne, item.promptTwo);
    assertEquals(requests[4].promptTwo, item.promptOne);
    assertEquals(Object.keys(requests[0]).sort(), [
      'moveTypeOne',
      'moveTypeTwo',
      'promptOne',
      'promptTwo',
      'promptVersion',
      'seed',
      'situationSnapshot',
      'theme',
    ]);
    assertEquals(result.actualWinner, null);
    assertEquals(result.scores, [42, 42]);
  },
);

Deno.test(
  'explicit evaluation budget stops provider calls at the ceiling and refuses mock evidence',
  async () => {
    const requests: JudgeRequest[] = [];
    const provider = budgetedEvaluationProvider(fixtureProvider(requests), 3);
    await assertRejects(
      () => runJudgeEvaluationCase(provider, JUDGE_EVALUATION_CASES[0]),
      Error,
      'budget exhausted',
    );
    assertEquals(provider.callsUsed(), 3);
    assertEquals(requests.length, 3);
    assertThrows(() => budgetedEvaluationProvider(fixtureProvider([]), NaN));
    assertThrows(
      () =>
        budgetedEvaluationProvider(
          { ...fixtureProvider([]), getModelId: () => 'mock-provider' },
          10,
        ),
      Error,
      'non-mock',
    );
  },
);

Deno.test(
  'human review import binds labels to exact text and context and rejects incomplete or stale evidence',
  async () => {
    const item = JUDGE_EVALUATION_CASES[0];
    const review = {
      id: item.id,
      digest: await evaluationCaseDigest(item),
      reviewer: 'test-fixture-reviewer',
      reviewedAt: '2020-01-01T00:00:00Z',
      rationale:
        'Test-only review fixture; no actual human review represented.',
      expectedWinner: null,
    };
    const artifact = {
      datasetVersion: JUDGE_EVALUATION_DATASET_VERSION,
      reviews: [review],
    };
    const loaded = await applyHumanReview([item], artifact);
    assertEquals(loaded[0].labelProvenance, 'independently_human_reviewed');
    assertEquals(item.labelProvenance, 'authored_candidate');
    await assertRejects(
      () => applyHumanReview([item, JUDGE_EVALUATION_CASES[1]], artifact),
      Error,
      'Missing or stale',
    );
    await assertRejects(
      () =>
        applyHumanReview(
          [{ ...item, promptOne: 'Changed after review' }],
          artifact,
        ),
      Error,
      'Missing or stale',
    );
    await assertRejects(
      () =>
        applyHumanReview([item], { ...artifact, reviews: [review, review] }),
      Error,
      'Duplicate',
    );
    await assertRejects(
      () =>
        applyHumanReview([item], {
          ...artifact,
          reviews: [{ ...review, reviewedAt: 'invalid' }],
        }),
      Error,
      'Missing or stale',
    );
  },
);
