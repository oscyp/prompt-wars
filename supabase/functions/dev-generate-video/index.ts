// Dev-only: Trigger real xAI Tier 1 video generation on demand.
// Bypasses entitlement gates; intended for development/QA from the mobile dev client.
// verify_jwt: true — user JWT required.

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';
import { XAIVideoProvider, type VideoGenerationRequest } from '../_shared/providers.ts';

interface DevGenerateVideoRequest {
  battle_id?: string;
}

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  try {
    userId = await getAuthUserId(req);
  } catch (_err) {
    return errorResponse('Unauthorized', 401);
  }

  let body: DevGenerateVideoRequest;
  try {
    body = await req.json();
  } catch (_err) {
    return errorResponse('Invalid JSON body', 400);
  }

  const battleId = body.battle_id;
  if (!battleId || typeof battleId !== 'string') {
    return errorResponse('battle_id is required', 400);
  }

  const supabase = createServiceClient();

  // Load battle with character + bot_persona joins
  const { data: battle, error: battleError } = await supabase
    .from('battles')
    .select(`
      *,
      player_one_character:characters!battles_player_one_character_id_fkey(*),
      player_two_character:characters!battles_player_two_character_id_fkey(*),
      bot_persona:bot_personas(*)
    `)
    .eq('id', battleId)
    .single();

  if (battleError || !battle) {
    return errorResponse('Battle not found', 404);
  }

  if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
    return errorResponse('Forbidden', 403);
  }

  // Load locked prompts (bot battle = 1; PvP = 2)
  const { data: prompts, error: promptsError } = await supabase
    .from('battle_prompts')
    .select('*')
    .eq('battle_id', battleId)
    .eq('is_locked', true);

  if (promptsError) {
    return errorResponse('Failed to load battle prompts', 500);
  }

  let p1Prompt: any;
  let p2Prompt: any;

  if (battle.is_player_two_bot) {
    if (!prompts || prompts.length !== 1) {
      return errorResponse('prompts_not_found: bot battle requires exactly one locked human prompt', 400);
    }
    p1Prompt = prompts.find((p: any) => p.profile_id === battle.player_one_id);
    if (!p1Prompt) {
      return errorResponse('prompts_mismatch: human prompt not found', 400);
    }

    const { data: botPrompts, error: botPromptError } = await supabase
      .from('bot_prompt_library')
      .select('*')
      .eq('bot_persona_id', battle.bot_persona_id);

    if (botPromptError || !botPrompts || botPrompts.length === 0) {
      return errorResponse('bot_prompts_not_found: no bot prompts for persona', 400);
    }

    const randomBotPrompt = botPrompts[Math.floor(Math.random() * botPrompts.length)];
    p2Prompt = {
      custom_prompt_text: randomBotPrompt.prompt_text,
      prompt_template_id: null,
      move_type: randomBotPrompt.move_type,
      word_count: randomBotPrompt.prompt_text.split(/\s+/).length,
      profile_id: null,
    };
  } else {
    if (!prompts || prompts.length !== 2) {
      return errorResponse('prompts_not_found: PvP battle requires two locked prompts', 400);
    }
    p1Prompt = prompts.find((p: any) => p.profile_id === battle.player_one_id);
    p2Prompt = prompts.find((p: any) => p.profile_id === battle.player_two_id);
    if (!p1Prompt || !p2Prompt) {
      return errorResponse('prompts_mismatch: could not match prompts to participants', 400);
    }
  }

  const getPromptText = async (prompt: any): Promise<string> => {
    if (prompt.custom_prompt_text) return prompt.custom_prompt_text;
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

  const playerTwoCharacterName = battle.is_player_two_bot
    ? battle.bot_persona?.name
    : battle.player_two_character?.name;
  const playerTwoArchetype = battle.is_player_two_bot
    ? battle.bot_persona?.archetype
    : battle.player_two_character?.archetype;

  const payload: VideoGenerationRequest = {
    battleId: battleId,
    playerOneCharacterName: battle.player_one_character?.name,
    playerOneArchetype: battle.player_one_character?.archetype,
    playerOnePrompt: p1Text,
    playerOneMoveType: p1Prompt.move_type,
    playerTwoCharacterName: playerTwoCharacterName || 'Unknown',
    playerTwoArchetype: playerTwoArchetype || 'bot',
    playerTwoPrompt: p2Text,
    playerTwoMoveType: p2Prompt.move_type,
    winnerId: battle.winner_id,
    isDraw: battle.is_draw,
    theme: battle.theme,
    targetDurationSeconds: 8,
    aspectRatio: '9:16',
    safetyConstraints: ['no_real_person_likeness', 'no_violence', 'no_nsfw'],
  };

  // Wipe any existing Tier 1 placeholder job for this battle (battle-level only,
  // not per-round) so Realtime surfaces this fresh xAI job.
  const { data: staleJobs } = await supabase
    .from('video_jobs')
    .select('id')
    .eq('battle_id', battleId)
    .eq('tier', 1)
    .is('battle_round_id', null);

  if (staleJobs && staleJobs.length > 0) {
    for (const stale of staleJobs) {
      await supabase.from('video_jobs').delete().eq('id', stale.id);
    }
  }

  // Insert a fresh job row
  const { data: jobRow, error: insertError } = await supabase
    .from('video_jobs')
    .insert({
      battle_id: battleId,
      tier: 1,
      provider: 'xai',
      status: 'queued',
      trigger: 'on_demand_grant',
      entitlement_source: 'new_user_grant',
      credits_charged: 0,
      cost_units: 0,
      refund_units: 0,
      refunded: false,
      attempt_count: 0,
      retry_count: 0,
      request_payload_hash: `dev_${battleId}_${Date.now()}`,
      requester_profile_id: userId,
    })
    .select('id')
    .single();

  if (insertError || !jobRow) {
    console.error('Failed to insert dev video job:', insertError);
    return errorResponse('Failed to create video job', 500);
  }

  const videoJobId = jobRow.id;
  const provider = new XAIVideoProvider();

  // Submit synchronously to xAI
  let submission;
  try {
    submission = await provider.submitVideoGeneration(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('xAI submit failed:', msg);
    await supabase
      .from('video_jobs')
      .update({
        status: 'failed',
        error_code: 'xai_submit_failed',
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', videoJobId);

    return successResponse({
      video_job_id: videoJobId,
      status: 'failed',
      error: msg,
    });
  }

  const submittedAt = new Date().toISOString();
  await supabase
    .from('video_jobs')
    .update({
      status: 'submitted',
      provider_job_id: submission.providerJobId,
      provider_request_id: submission.providerRequestId,
      submitted_at: submittedAt,
      attempt_count: 1,
    })
    .eq('id', videoJobId);

  // Background polling
  const pollTask = (async () => {
    const MAX_ITERATIONS = 30;
    const SLEEP_MS = 5000;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      await new Promise((r) => setTimeout(r, SLEEP_MS));

      try {
        const providerStatus = await provider.pollVideoStatus(submission.providerJobId);

        if (providerStatus.status === 'succeeded' && providerStatus.videoUrl) {
          await supabase
            .from('video_jobs')
            .update({
              status: 'succeeded',
              video_url: providerStatus.videoUrl,
              completed_at: new Date().toISOString(),
            })
            .eq('id', videoJobId);
          return;
        }

        if (providerStatus.status === 'failed') {
          await supabase
            .from('video_jobs')
            .update({
              status: 'failed',
              error_code: providerStatus.errorCode ?? 'xai_failed',
              error_message: providerStatus.errorMessage ?? 'xAI reported failure',
              completed_at: new Date().toISOString(),
            })
            .eq('id', videoJobId);
          return;
        }

        // processing / queued
        await supabase
          .from('video_jobs')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', videoJobId);
      } catch (loopErr) {
        const msg = loopErr instanceof Error ? loopErr.message : String(loopErr);
        console.error('xAI poll exception:', msg);
        await supabase
          .from('video_jobs')
          .update({
            status: 'failed',
            error_code: 'xai_poll_exception',
            error_message: msg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', videoJobId);
        return;
      }
    }

    // Timeout
    await supabase
      .from('video_jobs')
      .update({
        status: 'failed',
        error_code: 'xai_timeout',
        error_message: 'Polling timed out after ~150s',
        completed_at: new Date().toISOString(),
      })
      .eq('id', videoJobId);
  })();

  try {
    EdgeRuntime.waitUntil(pollTask);
  } catch (_e) {
    // Fallback: fire-and-forget if EdgeRuntime is unavailable
    pollTask.catch((e) => console.error('Poll task error:', e));
  }

  return successResponse({
    video_job_id: videoJobId,
    status: 'submitted',
    provider_job_id: submission.providerJobId,
    message: 'xAI generation in progress; result will surface via Realtime',
  });
});
