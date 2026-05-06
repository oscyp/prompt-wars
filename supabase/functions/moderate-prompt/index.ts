// Moderate Prompt Edge Function
// Pre-generation text moderation for custom prompts
// Records moderation_events and returns approved/rejected/flagged

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import { ModerationStatus } from '../_shared/types.ts';

interface ModeratePromptRequest {
  prompt_text: string;
  battle_prompt_id?: string; // Optional: associate with specific battle_prompt
  context?: {
    battle_id?: string;
    profile_id?: string;
    move_type?: string;
  };
}

interface ModeratePromptResponse {
  status: ModerationStatus;
  reason?: string;
  confidence?: number;
  moderation_event_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { prompt_text, battle_prompt_id, context }: ModeratePromptRequest = await req.json();

    if (!prompt_text) {
      return errorResponse('prompt_text required');
    }

    // Moderate the text
    const moderator = new TextModerationProvider();
    const result = await moderator.moderate(prompt_text);

    const supabase = createServiceClient();

    // Record moderation event
    const { data: moderationEvent, error: eventError } = await supabase
      .from('moderation_events')
      .insert({
        target_type: 'battle_prompt',
        target_id: battle_prompt_id || '00000000-0000-0000-0000-000000000000',
        action: result.status,
        reason: result.reason,
        moderator_notes: result.flaggedCategories?.join(', '),
        automated: true,
        provider: result.provider,
        provider_request_id: result.providerRequestId,
        confidence_score: result.confidence,
        flagged_categories: result.flaggedCategories,
      })
      .select('id')
      .single();

    if (eventError) {
      console.error('Failed to record moderation event:', eventError);
      // Continue even if event recording fails
    }

    // Update battle_prompt moderation_status if ID provided
    if (battle_prompt_id) {
      const { error: updateError } = await supabase
        .from('battle_prompts')
        .update({ moderation_status: result.status })
        .eq('id', battle_prompt_id);

      if (updateError) {
        console.error('Failed to update battle_prompt moderation_status:', updateError);
      }
    }

    // Update abuse signals for the user
    if (context?.profile_id) {
      const { error: abuseError } = await supabase.rpc('increment_abuse_counter', {
        p_profile_id: context.profile_id,
        p_counter: 'prompts_submitted_24h',
      });

      if (abuseError) {
        console.error('Failed to update abuse signals:', abuseError);
      }
    }

    const response: ModeratePromptResponse = {
      status: result.status,
      reason: result.reason,
      confidence: result.confidence,
      moderation_event_id: moderationEvent?.id || '',
    };

    // Return 403 if rejected, 200 if approved or flagged
    if (result.status === 'rejected') {
      return new Response(JSON.stringify(response), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return successResponse(response);
  } catch (error) {
    console.error('Moderate prompt error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
