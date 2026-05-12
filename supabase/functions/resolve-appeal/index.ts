// Resolve Appeal Edge Function
// Processes pending appeals and runs independent judge re-evaluation (service-role only)

import { createServiceClient, corsHeaders, errorResponse, hasSupabaseSecretAuthorization, successResponse } from '../_shared/utils.ts';
import { runJudgePipeline, JUDGE_PROMPT_VERSION } from '../_shared/judge.ts';
import { createJudgeProvider } from '../_shared/providers.ts';

interface ResolveAppealRequest {
  appeal_id?: string;
  batch_size?: number;
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
    const { appeal_id, batch_size = 10 }: ResolveAppealRequest = await req.json();
    
    const supabase = createServiceClient();
    
    // Determine which appeals to process
    let appealsToProcess: { id: string }[] = [];
    
    if (appeal_id) {
      // Process specific appeal
      const { data, error } = await supabase
        .from('appeals')
        .select('id')
        .eq('id', appeal_id)
        .eq('status', 'pending')
        .single();
      
      if (error || !data) {
        return errorResponse('Appeal not found or not pending');
      }
      
      appealsToProcess = [data];
    } else {
      // Process oldest pending appeals up to batch_size
      const { data, error } = await supabase
        .from('appeals')
        .select('id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batch_size);
      
      if (error) {
        return errorResponse('Failed to fetch pending appeals');
      }
      
      appealsToProcess = data || [];
    }
    
    if (appealsToProcess.length === 0) {
      return successResponse({
        message: 'No pending appeals to process',
        processed_count: 0,
      });
    }
    
    // Process each appeal
    const results = [];
    
    for (const appeal of appealsToProcess) {
      try {
        const result = await processAppeal(supabase, appeal.id);
        results.push({
          appeal_id: appeal.id,
          success: result.success,
          status: result.status,
          error: result.error,
        });
      } catch (error) {
        results.push({
          appeal_id: appeal.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    const successCount = results.filter((r) => r.success).length;
    
    return successResponse({
      processed_count: results.length,
      success_count: successCount,
      results,
    });
    
  } catch (error) {
    console.error('Resolve appeal error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});

/**
 * Process a single appeal: fetch data, run judge, update appeal
 */
async function processAppeal(
  supabase: ReturnType<typeof createServiceClient>,
  appealId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  // Fetch appeal with battle and prompts
  const { data: appeal, error: appealError } = await supabase
    .from('appeals')
    .select(`
      *,
      battle:battles(
        id,
        player_one_id,
        player_two_id,
        theme
      )
    `)
    .eq('id', appealId)
    .single();
  
  if (appealError || !appeal) {
    throw new Error('Appeal not found');
  }
  
  const battle = appeal.battle as unknown as {
    id: string;
    player_one_id: string;
    player_two_id: string;
    theme: string | null;
  };
  
  // Fetch locked prompts
  const { data: prompts, error: promptsError } = await supabase
    .from('battle_prompts')
    .select('*')
    .eq('battle_id', battle.id)
    .eq('is_locked', true);
  
  if (promptsError || !prompts || prompts.length !== 2) {
    throw new Error('Failed to fetch battle prompts');
  }
  
  const p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
  const p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);
  
  if (!p1Prompt || !p2Prompt) {
    throw new Error('Prompts mismatch');
  }
  
  // Get prompt text (template or custom)
  const getPromptText = async (prompt: typeof p1Prompt): Promise<string> => {
    if (prompt.custom_prompt_text) {
      return prompt.custom_prompt_text;
    }
    
    if (prompt.prompt_template_id) {
      const { data: template } = await supabase
        .from('prompt_templates')
        .select('body')
        .eq('id', prompt.prompt_template_id)
        .single();
      
      return template?.body || '';
    }
    
    return '';
  };
  
  const p1Text = await getPromptText(p1Prompt);
  const p2Text = await getPromptText(p2Prompt);
  
  if (!p1Text || !p2Text) {
    throw new Error('Failed to retrieve prompt text');
  }
  
  // Run independent judge with appeal metadata
  const judgeProvider = createJudgeProvider();
  const judgeResult = await runJudgePipeline(
    judgeProvider,
    p1Text,
    p2Text,
    p1Prompt.move_type,
    p2Prompt.move_type,
    p1Prompt.word_count || p1Text.split(/\s+/).length,
    p2Prompt.word_count || p2Text.split(/\s+/).length,
    battle.theme,
    JUDGE_PROMPT_VERSION
  );
  
  // Insert judge_runs row with is_appeal=true, run_sequence=3
  const { data: judgeRun, error: judgeRunError } = await supabase
    .from('judge_runs')
    .insert({
      battle_id: battle.id,
      judge_prompt_version: JUDGE_PROMPT_VERSION,
      model_id: judgeProvider.getModelId(),
      seed: Math.floor(Math.random() * 10000),
      player_one_raw_scores: judgeResult.player_one_raw_scores,
      player_two_raw_scores: judgeResult.player_two_raw_scores,
      player_one_normalized_scores: judgeResult.player_one_normalized_scores,
      player_two_normalized_scores: judgeResult.player_two_normalized_scores,
      winner_profile_id: judgeResult.winner_profile_id === 'p1' 
        ? battle.player_one_id 
        : judgeResult.winner_profile_id === 'p2' 
        ? battle.player_two_id 
        : null,
      is_draw: judgeResult.is_draw,
      explanation: judgeResult.explanation,
      aggregate_score_diff: judgeResult.aggregate_score_diff,
      is_tiebreaker: false,
      is_appeal: true,
      run_sequence: 3,
    })
    .select()
    .single();
  
  if (judgeRunError || !judgeRun) {
    throw new Error('Failed to insert judge run');
  }
  
  // Map judge winner to profile UUID
  const appealWinnerId = judgeResult.winner_profile_id === 'p1'
    ? battle.player_one_id
    : judgeResult.winner_profile_id === 'p2'
    ? battle.player_two_id
    : null;
  
  // Call DB resolve_appeal function
  const { data: resolved, error: resolveError } = await supabase.rpc('resolve_appeal', {
    p_appeal_id: appealId,
    p_appeal_winner_id: appealWinnerId,
    p_appeal_judge_run_id: judgeRun.id,
  });
  
  if (resolveError) {
    throw new Error(`Failed to resolve appeal: ${resolveError.message}`);
  }
  
  // Check if appeal was actually processed (idempotency check)
  if (!resolved) {
    return {
      success: false,
      error: 'Appeal already resolved (idempotency)',
    };
  }
  
  // Fetch final appeal status
  const { data: finalAppeal } = await supabase
    .from('appeals')
    .select('status')
    .eq('id', appealId)
    .single();
  
  return {
    success: true,
    status: finalAppeal?.status || 'unknown',
  };
}
