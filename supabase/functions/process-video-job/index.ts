// Process Video Job Edge Function
// Handles Tier 1 video generation lifecycle: submit, poll, store, refund on failure
// Designed for async queue processing or scheduled invocation

import { createServiceClient, corsHeaders, errorResponse, getSupabaseSecretKey, hasSupabaseSecretAuthorization, successResponse } from '../_shared/utils.ts';
import { createVideoProvider } from '../_shared/providers.ts';
import { VideoModerationProvider } from '../_shared/moderation.ts';

interface ProcessVideoJobRequest {
  video_job_id?: string; // specific job
  batch_size?: number; // process N queued jobs
}

const MAX_RETRY_ATTEMPTS = 3;
const HARD_TIMEOUT_SECONDS = 300; // 5 minutes
const CREDIT_COST_PER_VIDEO = 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Service-role only (server/scheduled execution)
  const authHeader = req.headers.get('Authorization');
  
  if (!hasSupabaseSecretAuthorization(authHeader)) {
    return errorResponse('Service role required', 403);
  }

  try {
    const { video_job_id, batch_size }: ProcessVideoJobRequest = await req.json();
    const supabase = createServiceClient();
    const videoProvider = createVideoProvider();

    let jobsToProcess: Array<{ id: string; battle_id: string; status: string; attempt_count: number }> = [];

    if (video_job_id) {
      // Process specific job
      const { data: job, error: jobError } = await supabase
        .from('video_jobs')
        .select('*')
        .eq('id', video_job_id)
        .single();

      if (jobError || !job) {
        return errorResponse('Video job not found');
      }

      jobsToProcess = [job];
    } else {
      // Process queued jobs
      const limit = batch_size || 10;
      const { data: jobs, error: jobsError } = await supabase
        .from('video_jobs')
        .select('*')
        .in('status', ['queued', 'submitted', 'processing'])
        .lt('attempt_count', MAX_RETRY_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (jobsError) {
        return errorResponse('Failed to fetch video jobs');
      }

      jobsToProcess = jobs || [];
    }

    const results = [];

    for (const job of jobsToProcess) {
      const result = await processVideoJob(supabase, videoProvider, job);
      results.push(result);
    }

    return successResponse({
      processed: results.length,
      jobs: results,
    });
  } catch (error) {
    console.error('Process video job error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});

async function processVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  videoProvider: ReturnType<typeof createVideoProvider>,
  job: { id: string; battle_id: string; status: string; attempt_count: number; provider_job_id?: string }
): Promise<{ job_id: string; status: string; error?: string }> {
  try {
    // Fetch battle context with bot_persona for bot battles
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select(`
        *,
        player_one_character:characters!battles_player_one_character_id_fkey(*),
        player_two_character:characters!battles_player_two_character_id_fkey(*),
        bot_persona:bot_personas(*)
      `)
      .eq('id', job.battle_id)
      .single();

    if (battleError || !battle) {
      await refundVideoJobOnFailure(supabase, job.id, 'battle_not_found');
      await failJob(supabase, job.id, 'battle_not_found', 'Battle not found');
      return { job_id: job.id, status: 'failed', error: 'battle_not_found' };
    }

    // Fetch prompts (handle bot battles vs human battles)
    let p1Prompt, p2Prompt;
    
    if (battle.is_player_two_bot) {
      // Bot battle: only player one has a prompt in battle_prompts
      const { data: prompts, error: promptsError } = await supabase
        .from('battle_prompts')
        .select('*')
        .eq('battle_id', job.battle_id)
        .eq('is_locked', true);

      if (promptsError || !prompts || prompts.length !== 1) {
        await refundVideoJobOnFailure(supabase, job.id, 'prompts_not_found');
        await failJob(supabase, job.id, 'prompts_not_found', 'Bot battle requires exactly one human prompt');
        return { job_id: job.id, status: 'failed', error: 'prompts_not_found' };
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      if (!p1Prompt) {
        await refundVideoJobOnFailure(supabase, job.id, 'prompts_mismatch');
        await failJob(supabase, job.id, 'prompts_mismatch', 'Human prompt not found');
        return { job_id: job.id, status: 'failed', error: 'prompts_mismatch' };
      }

      // Generate bot prompt from bot_prompt_library
      const { data: botPrompts, error: botPromptError } = await supabase
        .from('bot_prompt_library')
        .select('*')
        .eq('bot_persona_id', battle.bot_persona_id);

      if (botPromptError || !botPrompts || botPrompts.length === 0) {
        await refundVideoJobOnFailure(supabase, job.id, 'bot_prompts_not_found');
        await failJob(supabase, job.id, 'bot_prompts_not_found', 'Bot prompts not found for persona');
        return { job_id: job.id, status: 'failed', error: 'bot_prompts_not_found' };
      }

      // Select random bot prompt (in production, could match theme/move type)
      const randomBotPrompt = botPrompts[Math.floor(Math.random() * botPrompts.length)];

      // Create pseudo-prompt object for bot
      p2Prompt = {
        custom_prompt_text: randomBotPrompt.prompt_text,
        prompt_template_id: null,
        move_type: randomBotPrompt.move_type,
        word_count: randomBotPrompt.prompt_text.split(/\s+/).length,
        profile_id: null, // Bot has no profile
      };
    } else {
      // Human vs human: both prompts in battle_prompts
      const { data: prompts, error: promptsError } = await supabase
        .from('battle_prompts')
        .select('*')
        .eq('battle_id', job.battle_id)
        .eq('is_locked', true);

      if (promptsError || !prompts || prompts.length !== 2) {
        await refundVideoJobOnFailure(supabase, job.id, 'prompts_not_found');
        await failJob(supabase, job.id, 'prompts_not_found', 'Prompts not found');
        return { job_id: job.id, status: 'failed', error: 'prompts_not_found' };
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);

      if (!p1Prompt || !p2Prompt) {
        await refundVideoJobOnFailure(supabase, job.id, 'prompts_mismatch');
        await failJob(supabase, job.id, 'prompts_mismatch', 'Prompts mismatch');
        return { job_id: job.id, status: 'failed', error: 'prompts_mismatch' };
      }
    }

    // Get prompt text
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

    // Submit or poll video generation
    if (job.status === 'queued') {
      // Submit new video generation
      // Use bot_persona as player_two character metadata for bot battles
      const playerTwoCharacterName = battle.is_player_two_bot 
        ? battle.bot_persona?.name 
        : battle.player_two_character?.name;
      const playerTwoArchetype = battle.is_player_two_bot 
        ? battle.bot_persona?.archetype 
        : battle.player_two_character?.archetype;
      
      const submission = await videoProvider.submitVideoGeneration({
        battleId: job.battle_id,
        playerOneCharacterName: battle.player_one_character.name,
        playerOneArchetype: battle.player_one_character.archetype,
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
      });

      // Update job to submitted
      const { error: updateError } = await supabase
        .from('video_jobs')
        .update({
          status: 'submitted',
          provider_job_id: submission.providerJobId,
          provider_request_id: submission.providerRequestId,
          submitted_at: new Date().toISOString(),
          attempt_count: job.attempt_count + 1,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error('Failed to update job:', updateError);
      }

      return { job_id: job.id, status: 'submitted' };
    }

    if (job.status === 'submitted' || job.status === 'processing') {
      // Poll provider status
      if (!job.provider_job_id) {
        await refundVideoJobOnFailure(supabase, job.id, 'missing_provider_job_id');
        await failJob(supabase, job.id, 'missing_provider_job_id', 'Provider job ID missing');
        return { job_id: job.id, status: 'failed', error: 'missing_provider_job_id' };
      }

      const providerStatus = await videoProvider.pollVideoStatus(job.provider_job_id);

      if (providerStatus.status === 'processing') {
        // Still processing, update timestamp
        await supabase
          .from('video_jobs')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        return { job_id: job.id, status: 'processing' };
      }

      if (providerStatus.status === 'succeeded' && providerStatus.videoUrl) {
        let videoUrl;
        try {
          videoUrl = await copyVideoToStorage(supabase, job.battle_id, job.id, providerStatus.videoUrl);
        } catch (storageError) {
          console.error('Storage copy failed:', storageError);
          await refundVideoJobOnFailure(supabase, job.id, 'storage_failed');
          await failJob(supabase, job.id, 'storage_failed', 'Failed to copy video to storage');
          return { job_id: job.id, status: 'failed', error: 'storage_failed' };
        }

        // Create videos row
        const { data: videoRow, error: videoError } = await supabase
          .from('videos')
          .insert({
            battle_id: job.battle_id,
            video_job_id: job.id,
            storage_path: videoUrl,
            moderation_status: 'pending', // requires post-gen moderation
            visibility: 'private',
          })
          .select('id')
          .single();

        if (videoError || !videoRow) {
          console.error('Failed to create video row:', videoError);
          await refundVideoJobOnFailure(supabase, job.id, 'storage_failed');
          await failJob(supabase, job.id, 'storage_failed', 'Failed to store video metadata');
          return { job_id: job.id, status: 'failed', error: 'storage_failed' };
        }
        
        // Invoke post-generation video moderation (blocking for refund logic)
        try {
          const moderationResult = await moderateVideo(supabase, videoRow.id, job.battle_id);
          
          // If moderation rejected, refund and return battle to result_ready
          if (moderationResult.status === 'rejected') {
            await refundVideoJobOnFailure(supabase, job.id, 'moderation_rejected');
            await supabase
              .from('video_jobs')
              .update({
                status: 'failed',
                error_code: 'moderation_rejected',
                error_message: moderationResult.reason || 'Video rejected by moderation',
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id);
            
            // Return battle to result_ready so Tier 0 remains visible
            await supabase
              .from('battles')
              .update({ status: 'result_ready' })
              .eq('id', job.battle_id);
            
            return { job_id: job.id, status: 'failed', error: 'moderation_rejected' };
          }
        } catch (modError) {
          console.error('Video moderation failed:', modError);
          // Continue - moderation failure does not block video storage for approved content
        }

        // Mark job succeeded
        await supabase
          .from('video_jobs')
          .update({
            status: 'succeeded',
            credits_charged: CREDIT_COST_PER_VIDEO,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Update battle status
        await supabase
          .from('battles')
          .update({
            status: 'completed',
          })
          .eq('id', job.battle_id);

        return { job_id: job.id, status: 'succeeded' };
      }

      if (providerStatus.status === 'failed') {
        // Provider failure, retry or refund
        if (job.attempt_count + 1 < MAX_RETRY_ATTEMPTS) {
          // Retry: reset to queued without refunding (only refund on terminal failure)
          await supabase
            .from('video_jobs')
            .update({
              status: 'queued',
              attempt_count: job.attempt_count + 1,
              error_code: providerStatus.errorCode,
              error_message: providerStatus.errorMessage,
            })
            .eq('id', job.id);

          return { job_id: job.id, status: 'retry_queued' };
        } else {
          // Max retries, refund based on entitlement source and set battle back to result_ready
          await refundVideoJobOnFailure(supabase, job.id, providerStatus.errorCode || 'provider_failed');
          await failJob(supabase, job.id, providerStatus.errorCode || 'provider_failed', providerStatus.errorMessage || 'Provider failed');
          
          // Set battle status back to result_ready so Tier 0 result is visible
          await supabase
            .from('battles')
            .update({ status: 'result_ready' })
            .eq('id', job.battle_id);
          
          return { job_id: job.id, status: 'failed', error: providerStatus.errorCode };
        }
      }
    }

    return { job_id: job.id, status: job.status };
  } catch (error) {
    console.error(`Error processing video job ${job.id}:`, error);
    await refundVideoJobOnFailure(supabase, job.id, 'processing_error');
    await failJob(supabase, job.id, 'processing_error', error instanceof Error ? error.message : 'Unknown error');
    return { job_id: job.id, status: 'failed', error: 'processing_error' };
  }
}

async function failJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('video_jobs')
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Refund video job on internal failure (idempotent, source-aware)
 * Separate from provider max-retry refunds
 */
async function refundVideoJobOnFailure(
  supabase: ReturnType<typeof createServiceClient>,
  videoJobId: string,
  errorCode: string
): Promise<void> {
  // Fetch video job with entitlement details
  const { data: job } = await supabase
    .from('video_jobs')
    .select('requester_profile_id, entitlement_source, credits_charged, spend_transaction_id, refunded')
    .eq('id', videoJobId)
    .single();
  
  if (!job || job.refunded) {
    console.log('Video job already refunded or not found:', videoJobId);
    return;
  }
  
  if (!job.requester_profile_id || !job.entitlement_source) {
    console.warn('Video job missing requester or entitlement source, cannot refund:', videoJobId);
    // Mark as refunded to prevent retry loops
    await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', videoJobId);
    return;
  }
  
  const refundIdempotencyKey = `refund-video-${videoJobId}`;
  
  try {
    switch (job.entitlement_source) {
      case 'credits':
        // Refund credits using grant_credits RPC
        if (job.credits_charged && job.credits_charged > 0) {
          await supabase.rpc('grant_credits', {
            p_profile_id: job.requester_profile_id,
            p_amount: job.credits_charged,
            p_reason: `video_generation_failed_refund_${errorCode}`,
            p_idempotency_key: refundIdempotencyKey,
            p_battle_id: null,
            p_purchase_id: null,
            p_metadata: { 
              video_job_id: videoJobId,
              original_transaction_id: job.spend_transaction_id,
              error_code: errorCode,
            },
          });
          console.log(`Refunded ${job.credits_charged} credits to profile ${job.requester_profile_id}`);
        }
        break;
      
      case 'free_grant':
        // Restore free tier reveal
        await supabase.rpc('restore_free_tier1_reveal', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(`Restored free Tier 1 reveal to profile ${job.requester_profile_id}`);
        break;
      
      case 'subscription_allowance':
        // Restore subscription allowance
        await supabase.rpc('restore_subscription_allowance', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(`Restored subscription allowance to profile ${job.requester_profile_id}`);
        break;
      
      default:
        console.warn('Unknown entitlement source for refund:', job.entitlement_source);
    }
    
    // Mark job as refunded
    await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', videoJobId);
      
  } catch (error) {
    console.error('Refund error for video job:', videoJobId, error);
    // Don't throw - we'll retry on next invocation
  }
}

/**
 * Refund video job based on entitlement source (legacy, used for provider max retries)
 * Handles credits, subscription_allowance, and free_grant sources
 */
async function refundVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  videoJobId: string
): Promise<void> {
  // Fetch video job with entitlement details
  const { data: job } = await supabase
    .from('video_jobs')
    .select('requester_profile_id, entitlement_source, credits_charged, spend_transaction_id, refunded')
    .eq('id', videoJobId)
    .single();
  
  if (!job || job.refunded) {
    console.log('Video job already refunded or not found:', videoJobId);
    return;
  }
  
  if (!job.requester_profile_id || !job.entitlement_source) {
    console.warn('Video job missing requester or entitlement source, cannot refund:', videoJobId);
    // Mark as refunded to prevent retry loops
    await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', videoJobId);
    return;
  }
  
  const refundIdempotencyKey = `refund-video-${videoJobId}`;
  
  try {
    switch (job.entitlement_source) {
      case 'credits':
        // Refund credits using grant_credits RPC
        if (job.credits_charged && job.credits_charged > 0) {
          await supabase.rpc('grant_credits', {
            p_profile_id: job.requester_profile_id,
            p_amount: job.credits_charged,
            p_reason: 'video_generation_failed_refund',
            p_idempotency_key: refundIdempotencyKey,
            p_battle_id: null,
            p_purchase_id: null,
            p_metadata: { 
              video_job_id: videoJobId,
              original_transaction_id: job.spend_transaction_id 
            },
          });
          console.log(`Refunded ${job.credits_charged} credits to profile ${job.requester_profile_id}`);
        }
        break;
      
      case 'free_grant':
        // Restore free tier reveal
        await supabase.rpc('restore_free_tier1_reveal', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(`Restored free Tier 1 reveal to profile ${job.requester_profile_id}`);
        break;
      
      case 'subscription_allowance':
        // Restore subscription allowance
        await supabase.rpc('restore_subscription_allowance', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(`Restored subscription allowance to profile ${job.requester_profile_id}`);
        break;
      
      default:
        console.warn('Unknown entitlement source for refund:', job.entitlement_source);
    }
    
    // Mark job as refunded
    await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', videoJobId);
      
  } catch (error) {
    console.error('Refund error for video job:', videoJobId, error);
    // Don't throw - we'll retry on next process-video-job invocation
  }
}

async function copyVideoToStorage(
  supabase: ReturnType<typeof createServiceClient>,
  battleId: string,
  videoJobId: string,
  providerVideoUrl: string
): Promise<string> {
  // Fetch video from provider URL
  const response = await fetch(providerVideoUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch video from provider: ${response.statusText}`);
  }

  const videoBlob = await response.blob();
  const storagePath = `videos/${battleId}/${videoJobId}.mp4`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('battle-videos')
    .upload(storagePath, videoBlob, {
      contentType: 'video/mp4',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload video to storage: ${uploadError.message}`);
  }

  return storagePath;
}

/**
 * Moderate video using moderate-video Edge Function
 */
async function moderateVideo(
  supabase: ReturnType<typeof createServiceClient>,
  videoId: string,
  battleId: string
): Promise<{ status: string; reason?: string }> {
  // Call moderate-video Edge Function with service-role authority
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getSupabaseSecretKey();
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const moderateFunctionUrl = `${supabaseUrl}/functions/v1/moderate-video`;
  
  const response = await fetch(moderateFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ video_id: videoId, battle_id: battleId }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Moderate-video invocation failed:', errorText);
    throw new Error(`Moderate-video failed: ${response.status}`);
  }
  
  const result = await response.json();
  return { status: result.status, reason: result.reason };
}
