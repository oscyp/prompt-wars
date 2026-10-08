import {
  JUDGE_EVALUATION_DATASET_VERSION,
  type JudgeEvaluationCase,
} from './judge-evaluation-corpus.ts';
import {
  evaluateJudgePromotion,
  type EvaluationObservation,
} from './judge-evaluation.ts';
import { IDEAS_JUDGE_PROMPT_VERSION } from './judge-policy.ts';

/** Offline exports never acquire database write permission implicitly. */
export function composerCalibrationPersistence(
  args: readonly string[],
): boolean {
  if (args.some((arg) => arg.startsWith('--persist=')))
    throw new Error('Use the explicit --persist flag with --run-paid');
  const persist = args.includes('--persist');
  if (persist && !args.includes('--run-paid'))
    throw new Error(
      '--persist requires --run-paid; offline exports cannot write calibration records',
    );
  return persist;
}

/** The CLI and service endpoint persist the same recomputed, auditable evidence. */
export function buildComposerCalibrationRecord(input: {
  cases: readonly JudgeEvaluationCase[];
  observations: readonly EvaluationObservation[];
  model: string;
  providerCalls: number;
  threshold?: number;
}) {
  const threshold = input.threshold ?? 0.9;
  if (!Number.isFinite(threshold) || threshold < 0.9 || threshold > 1)
    throw new Error('Composer threshold must be between 0.9 and 1');
  if (!Number.isInteger(input.providerCalls) || input.providerCalls < 0)
    throw new Error('providerCalls must be a non-negative integer');
  const evaluation = evaluateJudgePromotion(
    input.cases,
    input.observations,
    input.model,
  );
  const passed = evaluation.passed && evaluation.accuracy >= threshold;
  const byId = new Map(input.cases.map((item) => [item.id, item]));
  return {
    judge_prompt_version: IDEAS_JUDGE_PROMPT_VERSION,
    judge_model_id: input.model,
    locale: 'multilingual',
    total_count: input.cases.length,
    correct_count: evaluation.correctCount,
    accuracy: evaluation.accuracy,
    threshold,
    status: passed ? 'passed' : 'failed',
    per_item_results: input.observations.map((observation) => ({
      ...observation,
      expected_winner: byId.get(observation.id)?.expectedWinner,
      actual_winner: observation.actualWinner,
      correct:
        !observation.error &&
        observation.actualWinner === byId.get(observation.id)?.expectedWinner,
    })),
    evaluation_metadata: {
      ...evaluation,
      passed,
      datasetVersion: JUDGE_EVALUATION_DATASET_VERSION,
      providerCalls: input.providerCalls,
      completedCount: input.observations.length,
    },
  };
}
