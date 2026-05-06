// Run Judge Calibration Edge Function
// Runs nightly accuracy checks against frozen calibration sets (service-role only)

import { createServiceClient, corsHeaders, errorResponse, successResponse } from '../_shared/utils.ts';
import { runJudgePipeline, JUDGE_PROMPT_VERSION } from '../_shared/judge.ts';
import { createJudgeProvider } from '../_shared/providers.ts';

interface RunCalibrationRequest {
  locale?: string;
  limit?: number;
  threshold?: number;
}

interface CalibrationItemResult {
  id: string;
  expected_winner: number;
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!authHeader?.includes(serviceKey || 'invalid')) {
    return errorResponse('Service role required', 403);
  }
  
  try {
    const {
      locale = 'en',
      limit = 100,
      threshold = 0.90,
    }: RunCalibrationRequest = await req.json();
    
    const supabase = createServiceClient();
    
    // Load active calibration sets
    const { data: calibrationSets, error: setsError } = await supabase
      .from('judge_calibration_sets')
      .select('*')
      .eq('locale', locale)
      .eq('is_active', true)
      .limit(limit);
    
    if (setsError) {
      return errorResponse('Failed to load calibration sets');
    }
    
    if (!calibrationSets || calibrationSets.length === 0) {
      return errorResponse('No active calibration sets found for locale');
    }
    
    // Run judge pipeline for each calibration set
    const judgeProvider = createJudgeProvider();
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
          JUDGE_PROMPT_VERSION
        );
        
        // Map judge result to winner number (1, 2, or null for draw)
        let actualWinner: number | null = null;
        
        if (!judgeResult.is_draw) {
          actualWinner = judgeResult.winner_profile_id === 'p1' ? 1 : 2;
        }
        
        // Treat draw/null as incorrect
        const isCorrect = actualWinner === set.expected_winner;
        
        if (isCorrect) {
          correctCount++;
        }
        
        // Calculate scores for logging
        const p1Score = Object.values(judgeResult.player_one_normalized_scores).reduce(
          (sum: number, val) => sum + (val as number), 
          0
        );
        const p2Score = Object.values(judgeResult.player_two_normalized_scores).reduce(
          (sum: number, val) => sum + (val as number), 
          0
        );
        
        results.push({
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
    const status = accuracy >= threshold ? 'passed' : 'failed';
    
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
        threshold,
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
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
