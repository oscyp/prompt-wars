import { runJudgePipeline, aggregateScore } from './judge.ts';
import { resolveCombatRound } from './combat.ts';
import { type AiJudgeProvider } from './providers.ts';
import {
  JUDGE_EVALUATION_DATASET_VERSION,
  type JudgeEvaluationCase,
} from './judge-evaluation-corpus.ts';
import { type EvaluationObservation } from './judge-evaluation.ts';

/** Budget is an explicit provider-call ceiling; model cost still depends on configured rates. */
export function budgetedEvaluationProvider(
  provider: AiJudgeProvider,
  maxCalls: number,
): AiJudgeProvider & { callsUsed(): number } {
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 2160)
    throw new Error('max_provider_calls must be an integer from 1 to 2160');
  if (provider.getModelId().startsWith('mock'))
    throw new Error(
      'Real-model evaluation requires a configured non-mock provider',
    );
  let calls = 0;
  return {
    getModelId: () => provider.getModelId(),
    callsUsed: () => calls,
    judge: (request) => {
      if (calls >= maxCalls)
        throw new Error('Evaluation provider-call budget exhausted');
      calls++;
      return provider.judge(request);
    },
  };
}

export async function runJudgeEvaluationCase(
  provider: AiJudgeProvider,
  item: JudgeEvaluationCase,
): Promise<EvaluationObservation> {
  const run = (version: string, swap: boolean) =>
    runJudgePipeline(
      provider,
      swap ? item.promptTwo : item.promptOne,
      swap ? item.promptOne : item.promptTwo,
      swap ? item.moveTypeTwo : item.moveTypeOne,
      swap ? item.moveTypeOne : item.moveTypeTwo,
      (swap ? item.promptTwo : item.promptOne).trim().split(/\s+/).length,
      (swap ? item.promptOne : item.promptTwo).trim().split(/\s+/).length,
      item.theme,
      version,
      item.situationSnapshot,
    );
  const actual = await run('v2.0.0-ideas', false);
  const baseline = await run('v1.0.0-mvp', false);
  const swapped = await run('v2.0.0-ideas', true);
  const scores = (r: typeof actual): [number, number] => [
    aggregateScore(r.player_one_normalized_scores),
    aggregateScore(r.player_two_normalized_scores),
  ];
  // Paired combat context is identical for both policies and contains no spend/source data.
  // Exercise damaged as well as fresh fighters, rather than reporting a vacuous 0% KO rate.
  const hp = [35, 65, 100][item.family.length % 3];
  const stats = { strength: 5, stamina: 5, agility: 5, focus: 5 };
  const combat = (r: typeof actual, swap: boolean) =>
    resolveCombatRound({
      rulesVersion: 2,
      playerOne: stats,
      playerTwo: stats,
      playerOneBase: scores(r)[0],
      playerTwoBase: scores(r)[1],
      playerOneMove: swap ? item.moveTypeTwo : item.moveTypeOne,
      playerTwoMove: swap ? item.moveTypeOne : item.moveTypeTwo,
      playerOneHp: hp,
      playerTwoHp: hp,
    });
  const currentCombat = combat(actual, false),
    baselineCombat = combat(baseline, false),
    swappedCombat = combat(swapped, true);
  return {
    id: item.id,
    calls: actual.calls,
    baselineCalls: baseline.calls,
    swappedCalls: swapped.calls,
    actualWinner: currentCombat.winner,
    baselineWinner: baselineCombat.winner,
    swappedWinner: swappedCombat.winner,
    scores: scores(actual),
    baselineScores: scores(baseline),
    swappedScores: scores(swapped),
    isKo: currentCombat.isKo,
    baselineIsKo: baselineCombat.isKo,
  };
}

export async function evaluationCaseDigest(
  item: JudgeEvaluationCase,
): Promise<string> {
  const source = JSON.stringify({
    id: item.id,
    promptOne: item.promptOne,
    promptTwo: item.promptTwo,
    theme: item.theme,
    situationSnapshot: item.situationSnapshot,
    moveTypeOne: item.moveTypeOne,
    moveTypeTwo: item.moveTypeTwo,
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Import an actual review artifact; shipping candidate labels never silently become human gold. */
export async function applyHumanReview(
  cases: readonly JudgeEvaluationCase[],
  value: unknown,
): Promise<JudgeEvaluationCase[]> {
  const artifact = value as {
    datasetVersion?: string;
    reviews?: {
      id: string;
      digest: string;
      reviewer: string;
      reviewedAt: string;
      rationale: string;
      expectedWinner: 1 | 2 | null;
    }[];
  };
  if (
    !artifact ||
    artifact.datasetVersion !== JUDGE_EVALUATION_DATASET_VERSION ||
    !Array.isArray(artifact.reviews)
  )
    throw new Error('Invalid human review artifact');
  const reviews = new Map(artifact.reviews.map((r) => [r.id, r]));
  if (reviews.size !== artifact.reviews.length)
    throw new Error('Duplicate human review case');
  return await Promise.all(
    cases.map(async (item) => {
      const review = reviews.get(item.id);
      if (
        !review ||
        !review.reviewer?.trim() ||
        !review.rationale?.trim() ||
        !Number.isFinite(Date.parse(review.reviewedAt)) ||
        Date.parse(review.reviewedAt) > Date.now() ||
        ![1, 2, null].includes(review.expectedWinner) ||
        review.digest !== (await evaluationCaseDigest(item))
      )
        throw new Error(`Missing or stale human review for ${item.id}`);
      return {
        ...item,
        expectedWinner: review.expectedWinner,
        rationale: review.rationale,
        labelProvenance: 'independently_human_reviewed',
      };
    }),
  );
}
