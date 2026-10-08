// Run Judge Calibration Edge Function
// Runs nightly accuracy checks against frozen calibration sets (service-role only)

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import {
  runJudgePipeline,
  JUDGE_PROMPT_VERSION,
  IDEAS_JUDGE_PROMPT_VERSION,
  judgePolicyVersion,
} from '../_shared/judge.ts';
import { JUDGE_EVALUATION_CASES } from '../_shared/judge-evaluation-corpus.ts';
import type { EvaluationObservation } from '../_shared/judge-evaluation.ts';
import { buildComposerCalibrationRecord } from '../_shared/judge-calibration-evidence.ts';
import {
  applyHumanReview,
  budgetedEvaluationProvider,
  runJudgeEvaluationCase,
} from '../_shared/judge-evaluation-runner.ts';
import { independentProvider } from '../_shared/appeals-service.ts';
import { assertIndependentCalls, type ActualCall } from '../_shared/appeals.ts';
import { createJudgeProvider, XAIJudgeProvider } from '../_shared/providers.ts';

interface RunCalibrationRequest {
  target?: 'primary' | 'appeal';
  judge_policy_version?: string;
  split?: 'tuning' | 'holdout';
  max_provider_calls?: number;
  human_review?: unknown;
  locale?: string;
  limit?: number;
  threshold?: number;
}

interface CalibrationItemResult {
  calls?: ActualCall[];
  id: string;
  expected_winner: number | null;
  actual_winner: number | null; // 1, 2, or null for draw
  correct: boolean;
  player_one_score: number;
  player_two_score: number;
  score_diff: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Service-role only
  const authHeader = req.headers.get('Authorization');

  if (!hasSupabaseSecretAuthorization(authHeader)) {
    return errorResponse('Service role required', 403);
  }

  try {
    const {
      target = 'primary',
      judge_policy_version = JUDGE_PROMPT_VERSION,
      split = 'holdout',
      max_provider_calls,
      human_review,
      locale = 'en',
      limit = 100,
      threshold = 0.9,
    }: RunCalibrationRequest = await req.json();

    const supabase = createServiceClient();
    const version = judgePolicyVersion(judge_policy_version);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
      return errorResponse('threshold must be between 0 and 1', 400);
    if (version === IDEAS_JUDGE_PROMPT_VERSION) {
      if (threshold < 0.9)
        return errorResponse('Composer threshold must be at least 0.9', 400);
      if (!['tuning', 'holdout'].includes(split))
        return errorResponse('Invalid dataset split', 400);
      if (
        !(Deno.env.get('JUDGE_API_KEY') || Deno.env.get('XAI_API_KEY')) ||
        (target === 'primary' && !Deno.env.get('JUDGE_MODEL_ID'))
      )
        return errorResponse(
          'Real-model evaluation requires configured model and credentials',
          409,
        );
      const provider = budgetedEvaluationProvider(
        target === 'appeal'
          ? independentProvider()
          : new XAIJudgeProvider(Deno.env.get('JUDGE_MODEL_ID')!),
        max_provider_calls ?? 0,
      );
      let cases = JUDGE_EVALUATION_CASES.filter((c) => c.split === split);
      if (human_review !== undefined)
        cases = await applyHumanReview(cases, human_review);
      const observations: EvaluationObservation[] = [];
      for (const item of cases) {
        try {
          observations.push(await runJudgeEvaluationCase(provider, item));
        } catch (error) {
          console.error(
            `Evaluation stopped at ${item.id}:`,
            error instanceof Error ? error.message : 'provider error',
          );
          break;
        }
      }
      const record = buildComposerCalibrationRecord({
        cases,
        observations,
        model: provider.getModelId(),
        providerCalls: provider.callsUsed(),
        threshold,
      });
      const { data: saved, error } = await supabase
        .from('judge_calibration_runs')
        .insert(record)
        .select('id')
        .single();
      if (error)
        return errorResponse('Failed to save composer calibration evidence');
      return successResponse({
        calibration_run_id: saved.id,
        judge_prompt_version: version,
        status: record.status,
        evaluation: record.evaluation_metadata,
        provider_calls: provider.callsUsed(),
      });
    }

    // Load active calibration sets
    const { data: calibrationSets, error: setsError } = await supabase
      .from('judge_calibration_sets')
      .select('*')
      .eq('locale', locale)
      .eq('is_active', true)
      .eq('judge_policy_version', version)
      .limit(limit);

    if (setsError) {
      return errorResponse('Failed to load calibration sets');
    }

    if (!calibrationSets || calibrationSets.length === 0) {
      return errorResponse('No active calibration sets found for locale');
    }

    // Run judge pipeline for each calibration set
    const judgeProvider =
      target === 'appeal' ? independentProvider() : createJudgeProvider();
    const results: CalibrationItemResult[] = [];
    let correctCount = 0;

    for (const set of calibrationSets) {
      try {
        const judgeResult = await runJudgePipeline(
          judgeProvider,
          set.prompt_one_text,
          set.prompt_two_text,
          set.prompt_one_move_type,
          set.prompt_two_move_type,
          set.prompt_one_text.split(/\s+/).length,
          set.prompt_two_text.split(/\s+/).length,
          set.theme,
          JUDGE_PROMPT_VERSION,
        );

        if (target === 'appeal')
          assertIndependentCalls(
            judgeResult.calls,
            judgeProvider.getModelId(),
            [],
            JUDGE_PROMPT_VERSION,
          );

        // Map judge result to winner number (1, 2, or null for draw)
        let actualWinner: number | null = null;

        if (!judgeResult.is_draw) {
          actualWinner = judgeResult.winner_profile_id === 'p1' ? 1 : 2;
        }

        // Null is a valid expected draw; provider failures are recorded separately.
        const isCorrect = actualWinner === set.expected_winner;

        if (isCorrect) {
          correctCount++;
        }

        // Calculate scores for logging
        const p1Score = Object.values(
          judgeResult.player_one_normalized_scores,
        ).reduce((sum: number, val) => sum + (val as number), 0);
        const p2Score = Object.values(
          judgeResult.player_two_normalized_scores,
        ).reduce((sum: number, val) => sum + (val as number), 0);

        results.push({
          calls: judgeResult.calls,
          id: set.id,
          expected_winner: set.expected_winner,
          actual_winner: actualWinner,
          correct: isCorrect,
          player_one_score: p1Score,
          player_two_score: p2Score,
          score_diff: Math.abs(p1Score - p2Score),
        });
      } catch (error) {
        console.error(`Calibration set ${set.id} failed:`, error);
        // Record as incorrect
        results.push({
          id: set.id,
          expected_winner: set.expected_winner,
          actual_winner: null,
          correct: false,
          player_one_score: 0,
          player_two_score: 0,
          score_diff: 0,
        });
      }
    }

    // Calculate accuracy
    const totalCount = calibrationSets.length;
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;
    const status =
      accuracy >= Math.max(0.9, threshold) &&
      results.every(
        (r) =>
          r.calls?.length &&
          r.calls.every(
            (c) => !c.fallback && c.model_id === judgeProvider.getModelId(),
          ),
      )
        ? 'passed'
        : 'failed';

    // Insert calibration run
    const { data: calibrationRun, error: runError } = await supabase
      .from('judge_calibration_runs')
      .insert({
        judge_prompt_version: JUDGE_PROMPT_VERSION,
        judge_model_id: judgeProvider.getModelId(),
        locale,
        total_count: totalCount,
        correct_count: correctCount,
        accuracy,
        threshold: Math.max(0.9, threshold),
        status,
        per_item_results: results,
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to insert calibration run:', runError);
      return errorResponse('Failed to save calibration run');
    }

    return successResponse({
      calibration_run_id: calibrationRun.id,
      locale,
      total_count: totalCount,
      correct_count: correctCount,
      accuracy: parseFloat(accuracy.toFixed(4)),
      threshold,
      status,
      judge_model_id: judgeProvider.getModelId(),
      judge_prompt_version: JUDGE_PROMPT_VERSION,
      summary: `${correctCount}/${totalCount} correct (${(accuracy * 100).toFixed(2)}%) - ${status.toUpperCase()}`,
    });
  } catch (error) {
    console.error('Calibration run error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
