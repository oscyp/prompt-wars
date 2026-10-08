/** Offline export by default. Live calls require --run-paid --max-calls=N and configured credentials. */
import {
  JUDGE_EVALUATION_CASES,
  JUDGE_EVALUATION_DATASET_VERSION,
} from '../_shared/judge-evaluation-corpus.ts';
import {
  evaluateJudgePromotion,
  type EvaluationObservation,
} from '../_shared/judge-evaluation.ts';
import {
  applyHumanReview,
  budgetedEvaluationProvider,
  evaluationCaseDigest,
  runJudgeEvaluationCase,
} from '../_shared/judge-evaluation-runner.ts';
import { XAIJudgeProvider } from '../_shared/providers.ts';
import { createServiceClient } from '../_shared/utils.ts';
import {
  buildComposerCalibrationRecord,
  composerCalibrationPersistence,
} from '../_shared/judge-calibration-evidence.ts';

const persist = composerCalibrationPersistence(Deno.args);

const option = (key: string) =>
  Deno.args
    .find((a) => a.startsWith(`--${key}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const split = option('split') ?? 'holdout';
if (!['holdout', 'tuning', 'all'].includes(split))
  throw new Error('Use --split=holdout|tuning|all');
let cases = JUDGE_EVALUATION_CASES.filter(
  (c) => split === 'all' || c.split === split,
);
const reviewPath = option('review-file');
if (reviewPath)
  cases = await applyHumanReview(
    cases,
    JSON.parse(await Deno.readTextFile(reviewPath)),
  );
const out = option('out') ?? `/tmp/prompt-wars-judge-${split}.json`;
if (!Deno.args.includes('--run-paid')) {
  const rows = await Promise.all(
    cases.map(async (c) => ({ ...c, digest: await evaluationCaseDigest(c) })),
  );
  await Deno.writeTextFile(
    out,
    JSON.stringify(
      {
        datasetVersion: JUDGE_EVALUATION_DATASET_VERSION,
        status: 'not_run',
        cases: rows,
      },
      null,
      2,
    ),
  );
  console.log(
    `Exported ${cases.length} ${split} candidates to ${out}. No model calls or promotion evidence produced.`,
  );
} else {
  if (
    !(Deno.env.get('JUDGE_API_KEY') || Deno.env.get('XAI_API_KEY')) ||
    !Deno.env.get('JUDGE_MODEL_ID')
  )
    throw new Error(
      'Configure JUDGE_MODEL_ID and JUDGE_API_KEY or XAI_API_KEY before paid evaluation',
    );
  // Validate database configuration before spending when persistence is requested.
  const calibrationDb = persist ? createServiceClient() : null;
  const provider = budgetedEvaluationProvider(
    // Explicit override requires the response's actual model ID; calibration
    // must never substitute a configured name for absent provider provenance.
    new XAIJudgeProvider(Deno.env.get('JUDGE_MODEL_ID')!),
    Number(option('max-calls')),
  );
  const observations: EvaluationObservation[] = [];
  for (const item of cases) {
    try {
      observations.push(await runJudgeEvaluationCase(provider, item));
    } catch (error) {
      console.error(
        `Stopped at ${item.id}: ${error instanceof Error ? error.message : 'provider failure'}`,
      );
      break;
    }
    // Save after every completed case so interruption cannot be mistaken for a complete run.
    await Deno.writeTextFile(
      out,
      JSON.stringify(
        {
          datasetVersion: JUDGE_EVALUATION_DATASET_VERSION,
          createdAt: new Date().toISOString(),
          observations,
          evaluation: evaluateJudgePromotion(
            cases,
            observations,
            provider.getModelId(),
          ),
          providerCalls: provider.callsUsed(),
        },
        null,
        2,
      ),
    );
  }
  const record = buildComposerCalibrationRecord({
    cases,
    observations,
    model: provider.getModelId(),
    providerCalls: provider.callsUsed(),
  });
  const evaluation = record.evaluation_metadata;
  const costs = observations
    .flatMap((o) => [...o.calls, ...o.baselineCalls, ...o.swappedCalls])
    .map((c) => c.cost_usd);
  await Deno.writeTextFile(
    out,
    JSON.stringify(
      {
        datasetVersion: JUDGE_EVALUATION_DATASET_VERSION,
        createdAt: new Date().toISOString(),
        observations,
        evaluation,
        providerCalls: provider.callsUsed(),
        knownCostUsd: costs.reduce<number>((sum, c) => sum + (c ?? 0), 0),
        costComplete:
          costs.length === provider.callsUsed() &&
          costs.length > 0 &&
          costs.every((c) => c !== undefined),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(evaluation, null, 2));
  // Write local evidence first. Database/configuration failure leaves it intact
  // and fails the command, never presenting an unpersisted result as promoted.
  if (calibrationDb) {
    const { data, error } = await calibrationDb
      .from('judge_calibration_runs')
      .insert(record)
      .select('id')
      .single();
    if (error || !data?.id)
      throw new Error(
        'Calibration persistence failed; local evidence was preserved',
      );
    console.log(`Persisted ${record.status} calibration run ${data.id}`);
  }
  if (!evaluation.passed) Deno.exitCode = 1;
}
