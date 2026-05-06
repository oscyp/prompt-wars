// Submit Prompt Edge Function
// Locks player's prompt for a battle (calls lock_prompt DB function)
// Integrates pre-gen moderation for custom prompts

import { createServiceClient, corsHeaders, errorResponse, successResponse, getAuthUserId } from '../_shared/utils.ts';
import { MoveType } from '../_shared/types.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';

/**
 * Trigger battle resolution server-side (reliable async invocation)
 * Uses EdgeRuntime.waitUntil() when available, with awaited fallback for local/test runtimes
 */
async function triggerBattleResolution(battleId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const resolveFunctionUrl = `${supabaseUrl}/functions/v1/resolve-battle`;
  
  const resolutionTask = (async () => {
    try {
      const response = await fetch(resolveFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ battle_id: battleId }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resolve-battle invocation failed:', errorText);
        throw new Error(`Resolve-battle failed: ${response.status}`);
      }
      
      console.log('Battle resolution triggered for:', battleId);
    } catch (error) {
      console.error('Battle resolution error:', error);
      throw error;
    }
  })();
  
  // Use EdgeRuntime.waitUntil when available (production/deployed)
  // @ts-ignore - EdgeRuntime may not be defined in all contexts
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(resolutionTask);
  } else {
    // Fallback: await for local/test runtimes to ensure completion
    await resolutionTask;
  }
}

interface SubmitPromptRequest {
  battle_id: string;
  prompt_template_id?: string;
  custom_prompt_text?: string;
  move_type: MoveType;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const userId = await getAuthUserId(req);
    const {
      battle_id,
      prompt_template_id,
      custom_prompt_text,
      move_type,
    }: SubmitPromptRequest = await req.json();
    
    if (!battle_id || !move_type) {
      return errorResponse('battle_id and move_type required');
    }
    
    if (!prompt_template_id && !custom_prompt_text) {
      return errorResponse('Either prompt_template_id or custom_prompt_text required');
    }
    
    // Pre-gen moderation for custom prompts
    let moderationStatus: 'approved' | 'rejected' | 'flagged_human_review' | 'pending' = 'approved';
    
    if (custom_prompt_text) {
      const moderator = new TextModerationProvider();
      const moderationResult = await moderator.moderate(custom_prompt_text);
      
      moderationStatus = moderationResult.status;
      
      // MVP: reject unsafe, allow approved, reject flagged_human_review (conservative)
      if (moderationResult.status === 'rejected') {
        return errorResponse(
          `Prompt rejected: ${moderationResult.reason || 'Content policy violation'}`,
          403
        );
      }
      
      if (moderationResult.status === 'flagged_human_review') {
        return errorResponse(
          'Prompt requires review and cannot be submitted at this time',
          403
        );
      }
      
      // Log moderation event
      const supabase = createServiceClient();
      await supabase.from('moderation_events').insert({
        target_type: 'battle_prompt',
        target_id: battle_id, // Will update with prompt_id after creation
        action: moderationResult.status,
        reason: moderationResult.reason,
        moderator_notes: moderationResult.flaggedCategories?.join(', '),
        automated: true,
        provider: moderationResult.provider,
        provider_request_id: moderationResult.providerRequestId,
        confidence_score: moderationResult.confidence,
        flagged_categories: moderationResult.flaggedCategories,
      });
    }
    
    const supabase = createServiceClient();
    
    // Lock prompt via DB function
    const { data: promptId, error: lockError } = await supabase.rpc('lock_prompt', {
      p_battle_id: battle_id,
      p_profile_id: userId,
      p_prompt_template_id: prompt_template_id ?? null,
      p_custom_prompt_text: custom_prompt_text ?? null,
      p_move_type: move_type,
    });
    
    if (lockError) {
      console.error('Lock prompt error:', lockError);
      return errorResponse(lockError.message || 'Failed to submit prompt', 400);
    }
    
    // Update moderation status for approved custom prompts
    // (lock_prompt defaults custom prompts to 'pending')
    if (custom_prompt_text && moderationStatus === 'approved' && promptId) {
      const { error: updateError } = await supabase
        .from('battle_prompts')
        .update({ moderation_status: 'approved' })
        .eq('id', promptId);
      
      if (updateError) {
        console.error('Failed to update moderation status:', updateError);
      }
    }
    
    // Check if battle is now ready to resolve
    const { data: battle } = await supabase
      .from('battles')
      .select('status, player_one_id, player_two_id, is_player_two_bot')
      .eq('id', battle_id)
      .single();
    
    if (battle && battle.status === 'resolving') {
      // Both prompts submitted (or bot battle with human prompt), battle ready for resolution
      // Trigger server-owned resolution reliably
      try {
        await triggerBattleResolution(battle_id);
      } catch (error) {
        console.error('Failed to trigger battle resolution:', error);
        // Don't fail the response - resolution can be retried via scheduled job
      }
      
      return successResponse({
        prompt_id: promptId,
        battle_status: 'resolving',
        message: 'Prompt submitted. Battle resolving...',
      });
    }
    
    return successResponse({
      prompt_id: promptId,
      battle_status: battle?.status || 'waiting_for_prompts',
      message: 'Prompt submitted. Waiting for opponent...',
    });
    
  } catch (error) {
    console.error('Submit prompt error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
