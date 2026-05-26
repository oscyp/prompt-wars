// Submit Prompt Edge Function
// Locks player's prompt for a battle (calls lock_prompt DB function)
// Integrates pre-gen moderation for custom prompts

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from '../_shared/utils.ts';
import { MoveType } from '../_shared/types.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';

/**
 * Trigger battle resolution server-side (reliable async invocation)
 * Uses EdgeRuntime.waitUntil() when available, with awaited fallback for local/test runtimes
 */
async function triggerBattleResolution(battleId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getSupabasePublishableKey();
  const serviceKey = getSupabaseSecretKey();

  if (!supabaseUrl || !publishableKey || !serviceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const resolveFunctionUrl = `${supabaseUrl}/functions/v1/resolve-battle`;

  const resolutionTask = (async () => {
    try {
      const response = await fetch(resolveFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: publishableKey,
          Authorization: `Bearer ${serviceKey}`,
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

/**
 * Generic async edge-function invoker with service-role auth.
 */
async function invokeFn(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getSupabasePublishableKey();
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new Error('Missing Supabase environment variables');
  }
  const url = `${supabaseUrl}/functions/v1/${fn}`;
  const task = (async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Invoke ${fn} failed:`, await res.text());
    }
  })();
  // @ts-ignore EdgeRuntime may not be defined
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  } else {
    await task;
  }
}

interface SubmitPromptRequest {
  battle_id: string;
  prompt_template_id?: string;
  custom_prompt_text?: string;
  move_type: MoveType;
  round_number?: number; // Bo3 only; defaults to battles.current_round
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
      round_number: requestedRound,
    }: SubmitPromptRequest = await req.json();

    if (!battle_id || !move_type) {
      return errorResponse('battle_id and move_type required');
    }

    if (!prompt_template_id && !custom_prompt_text) {
      return errorResponse(
        'Either prompt_template_id or custom_prompt_text required',
      );
    }

    // Pre-gen moderation for custom prompts
    let moderationStatus:
      | 'approved'
      | 'rejected'
      | 'flagged_human_review'
      | 'pending' = 'approved';

    if (custom_prompt_text) {
      const moderator = new TextModerationProvider();
      const moderationResult = await moderator.moderate(custom_prompt_text);

      moderationStatus = moderationResult.status;

      // MVP: reject unsafe, allow approved, reject flagged_human_review (conservative)
      if (moderationResult.status === 'rejected') {
        return errorResponse(
          `Prompt rejected: ${moderationResult.reason || 'Content policy violation'}`,
          403,
        );
      }

      if (moderationResult.status === 'flagged_human_review') {
        return errorResponse(
          'Prompt requires review and cannot be submitted at this time',
          403,
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
    const { data: promptId, error: lockError } = await supabase.rpc(
      'lock_prompt',
      {
        p_battle_id: battle_id,
        p_profile_id: userId,
        p_prompt_template_id: prompt_template_id ?? null,
        p_custom_prompt_text: custom_prompt_text ?? null,
        p_move_type: move_type,
        p_moderation_status: moderationStatus,
      },
    );

    if (lockError) {
      console.error('Lock prompt error:', lockError);
      return errorResponse(lockError.message || 'Failed to submit prompt', 400);
    }

    // Check if battle is now ready to resolve
    const { data: battle } = await supabase
      .from('battles')
      .select('status, player_one_id, player_two_id, is_player_two_bot, format, current_round, mode')
      .eq('id', battle_id)
      .single();

    // ---- Bo3 lock-in flow ----
    if (battle?.format === 'bo3') {
      const roundNumber = requestedRound ?? battle.current_round ?? 1;

      // Validate per-round state.
      const { data: round, error: roundErr } = await supabase
        .from('battle_rounds')
        .select('id, status, player_one_locked_at, player_two_locked_at')
        .eq('battle_id', battle_id)
        .eq('round_number', roundNumber)
        .single();
      if (roundErr || !round) {
        return errorResponse('Round not found', 404);
      }
      if (round.status !== 'waiting_for_prompts') {
        return errorResponse(
          `Round not accepting prompts (status=${round.status})`,
          409,
        );
      }

      // Tag the battle_prompts row with the round number.
      if (promptId) {
        await supabase
          .from('battle_prompts')
          .update({ round_number: roundNumber })
          .eq('id', promptId);
      }

      const isP1 = userId === battle.player_one_id;
      const lockField = isP1 ? 'player_one_locked_at' : 'player_two_locked_at';
      const otherLocked = isP1
        ? round.player_two_locked_at
        : round.player_one_locked_at;
      const nowIso = new Date().toISOString();

      const update: Record<string, unknown> = {
        [lockField]: nowIso,
        updated_at: nowIso,
      };
      // Bot battles: human lock immediately satisfies "both locked".
      const bothLocked = !!otherLocked || battle.is_player_two_bot;
      if (bothLocked) {
        update.both_locked_at = nowIso;
      }
      await supabase.from('battle_rounds').update(update).eq('id', round.id);

      if (bothLocked) {
        try {
          await invokeFn('round-resolve', {
            battle_id,
            round_number: roundNumber,
          });
        } catch (e) {
          console.error('round-resolve invoke failed:', e);
        }
        return successResponse({
          success: true,
          prompt_id: promptId,
          battle_status: 'resolving',
          round_number: roundNumber,
          message: 'Prompt submitted. Round resolving...',
        });
      }

      return successResponse({
        success: true,
        prompt_id: promptId,
        battle_status: 'waiting_for_prompts',
        round_number: roundNumber,
        message: 'Prompt submitted. Waiting for opponent...',
      });
    }

    // ---- Single-format flow (unchanged) ----

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
        success: true,
        prompt_id: promptId,
        battle_status: 'resolving',
        message: 'Prompt submitted. Battle resolving...',
      });
    }

    return successResponse({
      success: true,
      prompt_id: promptId,
      battle_status: battle?.status || 'waiting_for_prompts',
      message: 'Prompt submitted. Waiting for opponent...',
    });
  } catch (error) {
    console.error('Submit prompt error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
