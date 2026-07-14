// Process Video Job Edge Function
// Handles Tier 1 video generation lifecycle: submit, poll, store, refund on failure
// Designed for async queue processing or scheduled invocation

import { createServiceClient, corsHeaders, errorResponse, getSupabaseSecretKey, hasSupabaseSecretAuthorization, successResponse } from '../_shared/utils.ts';
import { createVideoProvider } from '../_shared/providers.ts';
import { VideoModerationProvider } from '../_shared/moderation.ts';
import { notifyVideoReady } from '../_shared/push.ts';
import {
  finalizeRoundUpgradeEntitlement,
  type RoundUpgradeSource,
} from '../_shared/entitlement-gate.ts';
import { isPastHardTimeout, isRefundableTrigger } from '../_shared/video-constants.ts';

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
      // The attempt cap only gates re-submission of queued jobs; submitted/processing
      // jobs must always be polled so the hard timeout can fire even on the final attempt.
      const { data: jobs, error: jobsError } = await supabase
        .from('video_jobs')
        .select('*')
        .or(
          `status.in.(submitted,processing),and(status.eq.queued,attempt_count.lt.${MAX_RETRY_ATTEMPTS})`
        )
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
      await handleTerminalEntitlement(supabase, job, 'failed', 'battle_not_found');
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
        await handleTerminalEntitlement(supabase, job, 'failed', 'prompts_not_found');
        await failJob(supabase, job.id, 'prompts_not_found', 'Bot battle requires exactly one human prompt');
        return { job_id: job.id, status: 'failed', error: 'prompts_not_found' };
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      if (!p1Prompt) {
        await handleTerminalEntitlement(supabase, job, 'failed', 'prompts_mismatch');
        await failJob(supabase, job.id, 'prompts_mismatch', 'Human prompt not found');
        return { job_id: job.id, status: 'failed', error: 'prompts_mismatch' };
      }

      // Generate bot prompt from bot_prompt_library
      const { data: botPrompts, error: botPromptError } = await supabase
        .from('bot_prompt_library')
        .select('*')
        .eq('bot_persona_id', battle.bot_persona_id);

      if (botPromptError || !botPrompts || botPrompts.length === 0) {
        await handleTerminalEntitlement(supabase, job, 'failed', 'bot_prompts_not_found');
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
        await handleTerminalEntitlement(supabase, job, 'failed', 'prompts_not_found');
        await failJob(supabase, job.id, 'prompts_not_found', 'Prompts not found');
        return { job_id: job.id, status: 'failed', error: 'prompts_not_found' };
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);

      if (!p1Prompt || !p2Prompt) {
        await handleTerminalEntitlement(supabase, job, 'failed', 'prompts_mismatch');
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
      // Hard timeout (§8.6): a job stuck at the provider past HARD_TIMEOUT_SECONDS
      // is force-failed and refunded instead of being polled forever. Tier 0 stays
      // authoritative, so legacy battles return to result_ready like other failures.
      const startedAt = (job as any).submitted_at ?? (job as any).created_at;
      if (isPastHardTimeout(startedAt, HARD_TIMEOUT_SECONDS)) {
        await handleTerminalEntitlement(supabase, job, 'failed', 'hard_timeout');
        await failJob(
          supabase,
          job.id,
          'hard_timeout',
          `Video generation exceeded ${HARD_TIMEOUT_SECONDS}s hard timeout`
        );

        if (!(job as any).battle_round_id) {
          await supabase
            .from('battles')
            .update({ status: 'result_ready' })
            .eq('id', job.battle_id);
        }

        return { job_id: job.id, status: 'failed', error: 'hard_timeout' };
      }

      // Poll provider status
      if (!job.provider_job_id) {
        await handleTerminalEntitlement(supabase, job, 'failed', 'missing_provider_job_id');
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
          await handleTerminalEntitlement(supabase, job, 'failed', 'storage_failed');
          await failJob(supabase, job.id, 'storage_failed', 'Failed to copy video to storage');
          return { job_id: job.id, status: 'failed', error: 'storage_failed' };
        }

        // Create videos row
        const { data: videoRow, error: videoError } = await supabase
          .from('videos')
          .insert({
            battle_id: job.battle_id,
            video_job_id: job.id,
            battle_round_id: (job as any).battle_round_id ?? null,
            storage_path: videoUrl,
            moderation_status: 'pending', // requires post-gen moderation
            visibility: 'private',
            is_ai_generated: true, // §22 disclosure travels with the asset row
          })
          .select('id')
          .single();

        if (videoError || !videoRow) {
          console.error('Failed to create video row:', videoError);
          await handleTerminalEntitlement(supabase, job, 'failed', 'storage_failed');
          await failJob(supabase, job.id, 'storage_failed', 'Failed to store video metadata');
          return { job_id: job.id, status: 'failed', error: 'storage_failed' };
        }

        // Best-effort default caption insertion. Captions are nice-to-have for
        // accessibility / share-readiness; failures here MUST NOT fail the job.
        try {
          await insertDefaultCaptions(supabase, videoRow.id, battle);
        } catch (captionErr) {
          console.error('Caption insertion failed (non-fatal):', captionErr);
        }

        // Invoke post-generation video moderation (blocking for refund logic)
        try {
          const moderationResult = await moderateVideo(supabase, videoRow.id, job.battle_id);
          
          // If moderation rejected, refund and return battle to result_ready
          if (moderationResult.status === 'rejected') {
            await handleTerminalEntitlement(supabase, job, 'moderation_failed', 'moderation_rejected');
            await supabase
              .from('video_jobs')
              .update({
                status: 'failed',
                error_code: 'moderation_rejected',
                error_message: moderationResult.reason || 'Video rejected by moderation',
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id);
            
            // Return battle to result_ready so Tier 0 remains visible (legacy only;
            // per-round jobs leave battle.status alone — Tier 0 is already on
            // battle_rounds.cinematic_asset_url and remains authoritative).
            if (!(job as any).battle_round_id) {
              await supabase
                .from('battles')
                .update({ status: 'result_ready' })
                .eq('id', job.battle_id);
            }
            
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

        // Finalize entitlement on success (round-mode: subscriber decrement /
        // credit+grant confirm via finalize_round_upgrade; legacy success is a
        // no-op because spend was already finalized at job creation).
        await handleTerminalEntitlement(supabase, job, 'succeeded');

        // Per-round write-back: surface the Tier 1 asset on battle_rounds so the
        // client's per-round subscription transitions from Tier 0 to Tier 1
        // without a separate join. Do NOT touch battle.status for per-round
        // jobs (the battle may still be resolving subsequent rounds).
        if ((job as any).battle_round_id) {
          await supabase
            .from('battle_rounds')
            .update({
              cinematic_asset_url: videoUrl,
              cinematic_tier: 1,
              cinematic_video_job_id: job.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (job as any).battle_round_id);
        } else {
          // Legacy single-format / series-end behavior unchanged.
          await supabase
            .from('battles')
            .update({ status: 'completed' })
            .eq('id', job.battle_id);
        }

        // Cinematic upgrade is live: notify both human players (fire-and-forget).
        notifyVideoReady(supabase, job.battle_id);

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
          await handleTerminalEntitlement(supabase, job, 'failed', providerStatus.errorCode || 'provider_failed');
          await failJob(supabase, job.id, providerStatus.errorCode || 'provider_failed', providerStatus.errorMessage || 'Provider failed');
          
          // Set battle status back to result_ready so Tier 0 result is visible
          // (legacy only — per-round jobs do not own battle.status).
          if (!(job as any).battle_round_id) {
            await supabase
              .from('battles')
              .update({ status: 'result_ready' })
              .eq('id', job.battle_id);
          }
          
          return { job_id: job.id, status: 'failed', error: providerStatus.errorCode };
        }
      }
    }

    return { job_id: job.id, status: job.status };
  } catch (error) {
    console.error(`Error processing video job ${job.id}:`, error);
    await handleTerminalEntitlement(supabase, job, 'failed', 'processing_error');
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
 * Best-effort default caption generation for a freshly-stored Tier 1 video.
 *
 * Derives up to three caption lines from already-computed battle payloads
 * (tier0_reveal_payload + score_payload) so the upsert is cheap and offline:
 *
 *   Line 1 (0–3000ms):     tier0.summary, else "<winner> wins" / "Draw"
 *   Line 2 (3000–7000ms):  first sentence (or first 140 chars) of score
 *                          explanation
 *   Line 3 (7000–9000ms):  "Finisher: <winnerCharacterName>" when winner known
 *
 * Empty-source lines are skipped. Insertion is idempotent per
 * (video_id, locale) — duplicates are silently ignored.
 */
async function insertDefaultCaptions(
  supabase: ReturnType<typeof createServiceClient>,
  videoId: string,
  battle: any,
): Promise<void> {
  const tier0 = battle?.tier0_reveal_payload ?? null;
  const score = battle?.score_payload ?? null;

  const lines: Array<{ start_ms: number; end_ms: number; text: string }> = [];

  // Line 1 — headline summary.
  let line1Text: string | null = null;
  if (tier0 && typeof tier0.summary === 'string' && tier0.summary.trim().length > 0) {
    line1Text = tier0.summary.trim();
  } else if (battle?.is_draw) {
    line1Text = 'Draw';
  } else if (battle?.winner_id) {
    const winnerName = battle.winner_id === battle.player_one_id
      ? battle.player_one_character?.name
      : battle.is_player_two_bot
        ? battle.bot_persona?.name
        : battle.player_two_character?.name;
    if (winnerName) line1Text = `${winnerName} wins`;
  }
  if (line1Text) {
    lines.push({ start_ms: 0, end_ms: 3000, text: line1Text });
  }

  // Line 2 — explanation snippet.
  if (score && typeof score.explanation === 'string' && score.explanation.trim().length > 0) {
    const raw = score.explanation.trim();
    // First sentence boundary or 140-char hard cap, whichever is shorter.
    const sentenceMatch = raw.match(/^.+?[.!?](?:\s|$)/);
    const firstSentence = sentenceMatch ? sentenceMatch[0].trim() : raw;
    const line2Text = firstSentence.length > 140
      ? firstSentence.slice(0, 140).trimEnd()
      : firstSentence;
    if (line2Text.length > 0) {
      lines.push({ start_ms: 3000, end_ms: 7000, text: line2Text });
    }
  }

  // Line 3 — finisher attribution.
  if (battle?.winner_id) {
    const winnerCharName = battle.winner_id === battle.player_one_id
      ? battle.player_one_character?.name
      : battle.is_player_two_bot
        ? battle.bot_persona?.name
        : battle.player_two_character?.name;
    if (winnerCharName) {
      lines.push({ start_ms: 7000, end_ms: 9000, text: `Finisher: ${winnerCharName}` });
    }
  }

  if (lines.length === 0) {
    return;
  }

  const locale = 'en-US';
  const { error } = await supabase
    .from('video_captions')
    .upsert(
      {
        video_id: videoId,
        locale,
        generator: 'auto',
        json_payload: { locale, lines },
      },
      { onConflict: 'video_id,locale', ignoreDuplicates: true },
    );

  if (error) {
    console.error('video_captions upsert error (non-fatal):', error);
  }
}

/**
 * Map a stored `entitlement_source` value (may be either the new round-unit
 * source or the legacy per-battle source) to the helper's expected
 * `RoundUpgradeSource`. Returns null for unknown sources (skip finalize).
 *
 * `is_full_battle` is derived from the source itself: `subscriber_full` is
 * always full-battle; the legacy `subscription_allowance` value can't be
 * disambiguated post-hoc, so we treat it as `subscriber_round` (single round
 * decrement) which is the safer default for the decrement RPC.
 */
function normalizeRoundSource(stored: string | null | undefined): RoundUpgradeSource | null {
  switch (stored) {
    case 'subscriber_full':
    case 'subscriber_round':
    case 'credit':
    case 'new_user_grant':
      return stored;
    // Defensive legacy aliases (in case older rows pre-date the gate landing).
    case 'subscription_allowance':
      return 'subscriber_round';
    case 'credits':
      return 'credit';
    case 'free_grant':
      return 'new_user_grant';
    default:
      return null;
  }
}

/**
 * Terminal-state entitlement reconciliation.
 *
 * Round-mode jobs (`battle_round_id IS NOT NULL`): delegate to
 * `finalizeRoundUpgradeEntitlement`, which owns BOTH refund (credit/grant)
 * and subscriber-allowance decrement-on-success. This path must NOT also
 * invoke `refundVideoJobOnFailure` to avoid double-refund.
 *
 * Legacy jobs (`battle_round_id IS NULL`): fall back to
 * `refundVideoJobOnFailure`, but gate by `isRefundableTrigger(trigger)` so
 * subscriber-auto jobs (which paid via subscription) do not get refunded.
 *
 * Success path for legacy is a no-op (the legacy refund path was failure-only;
 * spend was already finalized at job creation time).
 */
async function handleTerminalEntitlement(
  supabase: ReturnType<typeof createServiceClient>,
  job: any,
  outcome: 'succeeded' | 'failed' | 'moderation_failed',
  errorCode?: string,
): Promise<void> {
  // Round-mode path.
  if (job.battle_round_id) {
    const source = normalizeRoundSource(job.entitlement_source);
    if (!source) {
      console.warn('handleTerminalEntitlement: unknown entitlement_source for round-mode job', {
        job_id: job.id,
        entitlement_source: job.entitlement_source,
      });
      return;
    }
    if (!job.requester_profile_id) {
      console.warn('handleTerminalEntitlement: missing requester_profile_id', { job_id: job.id });
      return;
    }
    try {
      await finalizeRoundUpgradeEntitlement(
        {
          reservation_id: job.spend_transaction_id ?? null,
          source,
          profile_id: job.requester_profile_id,
          battle_id: job.battle_id,
          round_number: job.round_number ?? 1,
          is_full_battle: source === 'subscriber_full',
        },
        outcome,
        supabase as any,
      );
      // Mark refunded for terminal failure outcomes so the legacy path will
      // not double-process this row if invoked later.
      if (outcome !== 'succeeded') {
        await supabase
          .from('video_jobs')
          .update({ refunded: true })
          .eq('id', job.id);
      }
    } catch (e) {
      console.error('finalizeRoundUpgradeEntitlement threw:', e);
    }
    return;
  }

  // Legacy path: refunds only on failure, and only for refundable triggers.
  if (outcome === 'succeeded') return;
  if (!isRefundableTrigger(job.trigger)) {
    // Subscriber-auto / series-end-legacy / unset triggers: no refund.
    return;
  }
  await refundVideoJobOnFailure(supabase, job.id, errorCode ?? outcome);
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
