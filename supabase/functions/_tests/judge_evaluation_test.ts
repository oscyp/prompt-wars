import {
  assertEquals,
  assert,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  JUDGE_EVALUATION_CASES,
  type JudgeEvaluationCase,
} from '../_shared/judge-evaluation-corpus.ts';
import {
  evaluateJudgePromotion,
  type EvaluationObservation,
} from '../_shared/judge-evaluation.ts';
import {
  buildComposerCalibrationRecord,
  composerCalibrationPersistence,
} from '../_shared/judge-calibration-evidence.ts';
import type { JudgeCallProvenance } from '../_shared/types.ts';
import { calibrationEligible } from '../_shared/appeals.ts';
const holdout = JUDGE_EVALUATION_CASES.filter((c) => c.split === 'holdout');
const reviewed = holdout.map((c) => ({
  ...c,
  labelProvenance: 'independently_human_reviewed' as const,
}));
const call = (version: string) =>
  ({
    model_id: 'actual-model',
    fallback: false,
    prompt_version: version,
  }) as JudgeCallProvenance;
const observations = (
  cases: readonly JudgeEvaluationCase[],
): EvaluationObservation[] =>
  cases.map((c) => {
    const scores: [number, number] =
      c.expectedWinner === null
        ? [40, 40]
        : c.expectedWinner === 1
          ? [45, 25]
          : [25, 45];
    return {
      id: c.id,
      calls: [call('v2.0.0-ideas'), call('v2.0.0-ideas')],
      baselineCalls: [call('v1.0.0-mvp'), call('v1.0.0-mvp')],
      swappedCalls: [call('v2.0.0-ideas'), call('v2.0.0-ideas')],
      actualWinner: c.expectedWinner,
      baselineWinner: c.expectedWinner,
      swappedWinner:
        c.expectedWinner === null ? null : c.expectedWinner === 1 ? 2 : 1,
      scores,
      baselineScores: scores,
      swappedScores: [scores[1], scores[0]],
      isKo: false,
      baselineIsKo: false,
    };
  });

Deno.test(
  'calibration persistence is opt-in and cannot be enabled for an offline export',
  () => {
    assertEquals(composerCalibrationPersistence([]), false);
    assertEquals(composerCalibrationPersistence(['--run-paid']), false);
    assertEquals(
      composerCalibrationPersistence(['--run-paid', '--persist']),
      true,
    );
    assertThrows(
      () => composerCalibrationPersistence(['--persist']),
      Error,
      '--run-paid',
    );
    assertThrows(
      () => composerCalibrationPersistence(['--persist=true']),
      Error,
      '--persist',
    );
  },
);

Deno.test(
  'persistable calibration recomputes complete and partial evidence without upgrading candidate labels',
  () => {
    // Synthetic fixtures validate serialization, not a claimed human/model run.
    const complete = observations(reviewed);
    const input = {
      cases: reviewed,
      observations: complete,
      model: 'actual-model',
      providerCalls: 480,
    };
    const row = buildComposerCalibrationRecord(input);
    assertEquals(row.status, 'passed');
    assertEquals(row.judge_prompt_version, 'v2.0.0-ideas');
    assertEquals(row.locale, 'multilingual');
    assertEquals(row.total_count, 80);
    assertEquals(row.per_item_results.length, 80);
    assertEquals(row.per_item_results[0].calls, complete[0].calls);
    assertEquals(
      row.per_item_results[0].baselineCalls,
      complete[0].baselineCalls,
    );
    assertEquals(
      calibrationEligible(
        { ...row, created_at: new Date().toISOString() },
        'actual-model',
        'v2.0.0-ideas',
        'multilingual',
        168,
      ),
      true,
    );
    assert(
      row.per_item_results.some(
        (item) => item.expected_winner === null && item.correct,
      ),
    );
    const partial = buildComposerCalibrationRecord({
      ...input,
      observations: complete.slice(0, 79),
    });
    assertEquals(partial.status, 'failed');
    assertEquals(partial.evaluation_metadata.passed, false);
    assertEquals(partial.total_count, 80);
    assertEquals(partial.evaluation_metadata.completedCount, 79);
    assertEquals(partial.per_item_results.length, 79);
    assertEquals(
      calibrationEligible(
        { ...partial, created_at: new Date().toISOString() },
        'actual-model',
        'v2.0.0-ideas',
        'multilingual',
        168,
      ),
      false,
    );
    assertEquals(
      buildComposerCalibrationRecord({ ...input, observations: [] }).status,
      'failed',
    );
    assertEquals(
      buildComposerCalibrationRecord({ ...input, cases: holdout }).status,
      'failed',
    );
    const fallback = structuredClone(complete);
    fallback[0].calls[0].fallback = true;
    assertEquals(
      buildComposerCalibrationRecord({ ...input, observations: fallback })
        .status,
      'failed',
    );
    assertThrows(
      () => buildComposerCalibrationRecord({ ...input, threshold: 0.8 }),
      Error,
      'threshold',
    );
    assertThrows(
      () => buildComposerCalibrationRecord({ ...input, providerCalls: NaN }),
      Error,
      'providerCalls',
    );
  },
);

Deno.test(
  'candidate corpus covers 240 labeled cases without scenario leakage or fabricated review',
  () => {
    assertEquals(JUDGE_EVALUATION_CASES.length, 240);
    assertEquals(holdout.length, 80);
    assertEquals(new Set(JUDGE_EVALUATION_CASES.map((c) => c.id)).size, 240);
    const tuningFamilies = new Set(
      JUDGE_EVALUATION_CASES.filter((c) => c.split === 'tuning').map(
        (c) => c.family,
      ),
    );
    assert(holdout.every((c) => !tuningFamilies.has(c.family)));
    assert(
      JUDGE_EVALUATION_CASES.every(
        (c) =>
          c.labelProvenance === 'authored_candidate' && c.rationale.length > 20,
      ),
    );
    assertEquals(new Set(holdout.map((c) => c.category)).size, 10);
    assertEquals(new Set(holdout.map((c) => c.coverage.archetype)).size, 5);
  },
);

Deno.test(
  'expected draws count as correct; authored labels cannot promote even perfect provider results',
  () => {
    const result = evaluateJudgePromotion(
      holdout,
      observations(holdout),
      'actual-model',
    );
    assertEquals(result.accuracy, 1);
    assertEquals(result.gates.accuracy, true);
    assertEquals(result.gates.humanReviewed, false);
    assertEquals(result.passed, false);
    assertEquals(
      evaluateJudgePromotion(reviewed, observations(reviewed), 'actual-model')
        .passed,
      true,
    );
  },
);

Deno.test(
  'promotion rejects incomplete, fallback, wrong model and wrong policy evidence',
  () => {
    const good = observations(reviewed);
    assertEquals(
      evaluateJudgePromotion(reviewed, good.slice(1), 'actual-model').gates
        .completeHoldout,
      false,
    );
    for (const changed of [
      { fallback: true },
      { model_id: 'other' },
      { prompt_version: 'v1.0.0-mvp' },
    ]) {
      const bad = structuredClone(good);
      Object.assign(bad[0].calls[0], changed);
      assertEquals(
        evaluateJudgePromotion(reviewed, bad, 'actual-model').gates
          .actualModelNoFallback,
        false,
      );
    }
    assertEquals(
      evaluateJudgePromotion(reviewed, [...good, good[0]], 'actual-model')
        .passed,
      false,
    );
  },
);

Deno.test(
  'signed verbose advantage beyond one aggregate point fails despite draw outcomes',
  () => {
    const results = observations(reviewed);
    reviewed.forEach((c, i) => {
      if (c.verboseSide) results[i].scores[c.verboseSide - 1] += 1.01;
    });
    const report = evaluateJudgePromotion(reviewed, results, 'actual-model');
    assertEquals(report.gates.verbosity, false);
    assertEquals(report.accuracy, 1);
  },
);

Deno.test(
  'position, locale, authoring and distribution drifts are independent promotion gates',
  () => {
    const position = observations(reviewed);
    position[0].swappedScores = [42, 40];
    assertEquals(
      evaluateJudgePromotion(reviewed, position, 'actual-model').gates.position,
      false,
    );
    for (const [category, gate] of [
      ['locale_equivalence', 'locale'],
      ['authoring_invariance', 'authoring'],
    ] as const) {
      const results = observations(reviewed);
      const index = reviewed.findIndex((c) => c.category === category);
      results[index].scores = [42, 40];
      assertEquals(
        evaluateJudgePromotion(reviewed, results, 'actual-model').gates[gate],
        false,
      );
    }
    const distributions = observations(reviewed);
    for (let i = 0; i < 5; i++) {
      distributions[i].isKo = true;
      distributions[i].actualWinner = 1;
    }
    assertEquals(
      evaluateJudgePromotion(reviewed, distributions, 'actual-model').gates
        .koDrift,
      false,
    );
    const gap = observations(reviewed).map((o) => ({
      ...o,
      scores: [o.scores[0] + 30, o.scores[1]] as [number, number],
    }));
    assertEquals(
      evaluateJudgePromotion(reviewed, gap, 'actual-model').gates
        .medianGapDrift,
      false,
    );
  },
);
