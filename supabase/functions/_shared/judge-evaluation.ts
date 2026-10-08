import {
  type JudgeEvaluationCase,
  type EvaluationWinner,
} from './judge-evaluation-corpus.ts';
import type { JudgeCallProvenance } from './types.ts';

export interface EvaluationObservation {
  id: string;
  calls: JudgeCallProvenance[];
  baselineCalls: JudgeCallProvenance[];
  swappedCalls: JudgeCallProvenance[];
  actualWinner: EvaluationWinner;
  baselineWinner: EvaluationWinner;
  swappedWinner: EvaluationWinner;
  scores: [number, number];
  baselineScores: [number, number];
  swappedScores: [number, number];
  isKo: boolean;
  baselineIsKo: boolean;
  error?: string;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const swappedWinner = (winner: EvaluationWinner): EvaluationWinner =>
  winner === null ? null : winner === 1 ? 2 : 1;

export function evaluateJudgePromotion(
  cases: readonly JudgeEvaluationCase[],
  observations: readonly EvaluationObservation[],
  model: string,
) {
  const byId = new Map(observations.map((o) => [o.id, o]));
  const paired = cases.flatMap((c) =>
    byId.has(c.id) ? [{ c, o: byId.get(c.id)! }] : [],
  );
  const complete =
    cases.length >= 80 &&
    cases.every((c) => c.split === 'holdout') &&
    new Set(cases.map((c) => c.id)).size === cases.length &&
    observations.length === cases.length &&
    byId.size === cases.length &&
    paired.length === cases.length &&
    new Set(cases.map((c) => c.category)).size === 10 &&
    new Set(cases.map((c) => c.locale)).size === 3;
  const successful = paired.filter(({ o }) => !o.error);
  const accuracy = cases.length
    ? successful.filter(({ c, o }) => o.actualWinner === c.expectedWinner)
        .length / cases.length
    : 0;
  const provenance = (calls: JudgeCallProvenance[], version: string) =>
    Array.isArray(calls) &&
    calls.length >= 2 &&
    calls.length <= 3 &&
    calls.every(
      (c) =>
        !c.fallback &&
        !c.model_id.startsWith('mock') &&
        c.model_id === model &&
        c.prompt_version === version,
    );
  const validScores = (scores: number[]) =>
    scores.length === 2 &&
    scores.every((s) => Number.isFinite(s) && s >= 0 && s <= 60);
  const actualModel =
    complete &&
    successful.length === cases.length &&
    successful.every(
      ({ o }) =>
        provenance(o.calls, 'v2.0.0-ideas') &&
        provenance(o.swappedCalls, 'v2.0.0-ideas') &&
        provenance(o.baselineCalls, 'v1.0.0-mvp') &&
        validScores(o.scores) &&
        validScores(o.baselineScores) &&
        validScores(o.swappedScores),
    );
  const verbose = (locale: string) =>
    successful
      .filter(({ c }) => c.verboseSide && c.locale === locale)
      .map(({ c, o }) =>
        c.verboseSide === 1
          ? o.scores[0] - o.scores[1]
          : o.scores[1] - o.scores[0],
      );
  const verbosityEn = mean(verbose('en')),
    verbosityPl = mean(verbose('pl'));
  const positions = successful.map(({ o }) =>
    Math.max(
      Math.abs(o.scores[0] - o.swappedScores[1]),
      Math.abs(o.scores[1] - o.swappedScores[0]),
    ),
  );
  const localeCases = successful.filter(
    ({ c }) =>
      c.category === 'locale_equivalence' || c.category === 'mixed_locale',
  );
  const authoringCases = successful.filter(
    ({ c }) => c.category === 'authoring_invariance',
  );
  const sameMeaning = (entries: typeof successful) =>
    entries.length > 0 &&
    entries.every(
      ({ o }) =>
        o.actualWinner === null && Math.abs(o.scores[0] - o.scores[1]) <= 1,
    );
  const drawRate = mean(
    successful.map(({ o }) => Number(o.actualWinner === null)),
  );
  const baselineDrawRate = mean(
    successful.map(({ o }) => Number(o.baselineWinner === null)),
  );
  const koRate = mean(successful.map(({ o }) => Number(o.isKo)));
  const baselineKoRate = mean(
    successful.map(({ o }) => Number(o.baselineIsKo)),
  );
  const gap = median(
    successful.map(({ o }) => Math.abs(o.scores[0] - o.scores[1])),
  );
  const baselineGap = median(
    successful.map(({ o }) =>
      Math.abs(o.baselineScores[0] - o.baselineScores[1]),
    ),
  );
  const drawChange =
    drawRate === null || baselineDrawRate === null
      ? null
      : Math.abs(drawRate - baselineDrawRate);
  const koChange =
    koRate === null || baselineKoRate === null
      ? null
      : Math.abs(koRate - baselineKoRate);
  // A zero baseline cannot justify an unbounded relative increase.
  const gapChange =
    gap === null || baselineGap === null
      ? null
      : baselineGap === 0
        ? gap === 0
          ? 0
          : null
        : Math.abs(gap - baselineGap) / baselineGap;
  const gates = {
    completeHoldout: complete,
    humanReviewed:
      cases.length > 0 &&
      cases.every((c) => c.labelProvenance === 'independently_human_reviewed'),
    actualModelNoFallback: actualModel,
    accuracy: accuracy >= 0.9,
    verbosity:
      verbosityEn !== null &&
      verbosityPl !== null &&
      Math.abs(verbosityEn) <= 1 &&
      Math.abs(verbosityPl) <= 1,
    position:
      positions.length > 0 &&
      positions.every((n) => n <= 1) &&
      successful.every(
        ({ o }) => o.actualWinner === swappedWinner(o.swappedWinner),
      ),
    locale: sameMeaning(localeCases),
    authoring: sameMeaning(authoringCases),
    drawDrift: drawChange !== null && drawChange <= 0.05 + Number.EPSILON,
    koDrift: koChange !== null && koChange <= 0.05 + Number.EPSILON,
    medianGapDrift: gapChange !== null && gapChange <= 0.2 + Number.EPSILON,
  };
  return {
    accuracy,
    correctCount: successful.filter(
      ({ c, o }) => o.actualWinner === c.expectedWinner,
    ).length,
    totalCount: cases.length,
    passed: Object.values(gates).every(Boolean),
    gates,
    metrics: {
      verbosityDirectionEnPoints: verbosityEn,
      verbosityDirectionPlPoints: verbosityPl,
      maxPositionScoreChange: positions.length ? Math.max(...positions) : null,
      drawRate,
      baselineDrawRate,
      drawRateChange: drawChange,
      koRate,
      baselineKoRate,
      koRateChange: koChange,
      medianGap: gap,
      baselineMedianGap: baselineGap,
      medianGapRelativeChange: gapChange,
    },
    split: cases.every((c) => c.split === 'holdout') ? 'holdout' : 'tuning',
    labelProvenance: gates.humanReviewed
      ? 'independently_human_reviewed'
      : 'authored_candidate',
    model,
  };
}
