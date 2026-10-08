import {
  isExtendedCinematic,
  cinematicExecutionTimedOut,
  moderateCinematicBase,
} from '../_shared/cinematic-execution.ts';
import { moderateCinematicInput } from '../_shared/cinematic-moderation.ts';
import { composeCinematicExtensionPrompt } from '../_shared/cinematic-prompt.ts';
import { readCinematicDurationSeconds } from '../_shared/cinematic-media.ts';
import { buildCinematicCaptions } from '../_shared/cinematic-captions.ts';
import {
  prepareCinematicGeneration,
  assertFrozenCinematicAssetApproval,
} from '../_shared/cinematic-generation.ts';
import { CinematicPreparationError } from '../_shared/cinematic-references.ts';
import type { VideoGenerationRequest } from '../_shared/providers.ts';
import { composerVideoInputs } from '../_shared/composer-video.ts';
import { canGenerateBattle } from '../_shared/eligibility.ts';
// Process Video Job Edge Function
// Handles Tier 1 video generation lifecycle: submit, poll, store, refund on failure
// Designed for async queue processing or scheduled invocation
//
// Two properties this file depends on, both newer than the rest of it:
//
// 1. Every job is LEASED before it is touched (claim_video_jobs). Selecting by
//    status alone let the minute cron and the immediate kick drive the same row
//    concurrently -- two provider submissions, and the second's provider_job_id
//    orphaning the first. Terminal writes are fenced on the lease token so a
//    worker whose lease lapsed cannot overwrite a newer one's result.
//
// 2. When invoked for ONE job, the worker polls inline instead of returning
//    after submission and leaving the next cron tick to pick it up -- that gap
//    was up to 60s of a measured 68s p50. Inline polling is deliberately NOT
//    enabled in batch mode: the batch loop is sequential, so one job polling
//    for ~100s would starve every other job in the sweep.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getSupabaseSecretKey,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import {
  createVideoProvider,
  VideoProviderError,
} from '../_shared/providers.ts';
import {
  resolveCurrentPortrait,
  signPortraitPath,
} from '../_shared/compose-reveal-payload.ts';
import { VideoModerationProvider } from '../_shared/moderation.ts';
import { notifyVideoReady } from '../_shared/push.ts';
import {
  finalizeRoundUpgradeEntitlement,
  type RoundUpgradeSource,
} from '../_shared/entitlement-gate.ts';
import {
  configuredVideoCostUsd,
  isPastHardTimeout,
  isTransientPollError,
  pollScheduleFor,
  shouldContinuePolling,
  TIER1_HARD_TIMEOUT_S,
  TIER1_MAX_RETRY_ATTEMPTS,
  TIER1_PER_ROUND_DURATION_S,
  TIER1_SINGLE_FORMAT_DURATION_S,
  VIDEO_LEASE_SECONDS,
  VIDEO_REFERENCE_SIGNED_URL_TTL_SECONDS,
} from '../_shared/video-constants.ts';

interface ProcessVideoJobRequest {
  video_job_id?: string; // specific job
  batch_size?: number; // process N queued jobs
}

// Single source of truth in _shared/video-constants.ts (kept in sync with
// request-video-upgrade so retry/timeout policy can't drift).
const MAX_RETRY_ATTEMPTS = TIER1_MAX_RETRY_ATTEMPTS;
const HARD_TIMEOUT_SECONDS = TIER1_HARD_TIMEOUT_S;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Service-role only (server/scheduled execution)
  const authHeader = req.headers.get('Authorization');

  if (!hasSupabaseSecretAuthorization(authHeader, req.headers.get('apikey'))) {
    return errorResponse('Service role required', 403);
  }

  try {
    const { video_job_id, batch_size }: ProcessVideoJobRequest =
      await req.json();
    const supabase = createServiceClient();
    const videoProvider = createVideoProvider();

    if (!video_job_id) {
      // Failed HTTP creation can leave a held reservation without a job. The
      // scheduled sweep reconciles only old orphans through the atomic RPC.
      try {
        const { error } = await supabase.rpc(
          'recover_orphan_cinematic_funding',
          {},
        );
        if (error)
          console.error('Orphan cinematic funding recovery deferred:', error);
      } catch (error) {
        console.error('Orphan cinematic funding recovery deferred:', error);
      }
    }

    let jobsToProcess: Array<{
      id: string;
      battle_id: string;
      status: string;
      attempt_count: number;
    }> = [];

    // One token per invocation. Every job this worker claims carries it, and
    // every terminal write is fenced on it.
    const leaseToken = crypto.randomUUID();

    // Inline polling only in single-job mode. The loop below is sequential, so
    // a batch sweep that polled inline would spend its whole wall clock on the
    // first job and never reach the rest.
    const pollInline = Boolean(video_job_id);

    const { data: claimed, error: claimError } = await supabase.rpc(
      'claim_video_jobs',
      {
        p_token: leaseToken,
        p_job_ids: video_job_id ? [video_job_id] : null,
        p_limit: video_job_id ? 1 : batch_size || 10,
        p_lease_seconds: VIDEO_LEASE_SECONDS,
        p_max_attempts: MAX_RETRY_ATTEMPTS,
      },
    );

    if (claimError) {
      console.error('Failed to claim video jobs:', claimError);
      return errorResponse('Failed to fetch video jobs');
    }

    jobsToProcess = claimed || [];

    // An empty claim in single-job mode is not an error: it means another
    // worker already holds the job, or it is already terminal. Saying so
    // plainly keeps the immediate kick from looking like a failure when it
    // races the cron -- which, by design, it now safely can.
    if (video_job_id && jobsToProcess.length === 0) {
      return successResponse({
        processed: 0,
        jobs: [],
        skipped: 'not_claimable',
      });
    }

    const results = [];

    for (const job of jobsToProcess) {
      const result = await driveVideoJob(
        supabase,
        videoProvider,
        job,
        leaseToken,
        pollInline,
      );
      results.push(result);
    }

    return successResponse({
      processed: results.length,
      jobs: results,
    });
  } catch (error) {
    console.error('Process video job error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
    );
  }
});

interface VideoJobResult {
  job_id: string;
  status: string;
  error?: string;
  /** The step failed to reach the provider; the JOB is untouched and in flight. */
  transient?: boolean;
  polls?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seconds of video this job asks for. Per-round (Bo3) clips are shorter than
 * a single-format series-end one, and the duration is half of what a clip
 * costs -- so submission and pricing must read it from the same place.
 */
function targetDurationFor(job: {
  battle_round_id?: string | null;
  target_duration_seconds?: number | null;
}): number {
  return (
    job.target_duration_seconds ??
    (job.battle_round_id
      ? TIER1_PER_ROUND_DURATION_S
      : TIER1_SINGLE_FORMAT_DURATION_S)
  );
}

/**
 * Runs one job to a terminal state, polling inline when allowed.
 *
 * processVideoJob performs a single step (submit, or poll-and-finish). This
 * drives it: submit, wait, poll, wait, poll... within one invocation, instead
 * of returning after the submit and leaving the next minute-cron tick to
 * notice. That gap was up to 60s of a measured 68s p50.
 *
 * Three ways out, and all three leave the job in a state the cron can resume:
 *   - terminal (succeeded / failed / retry_queued) -> done
 *   - budget or consecutive-error limit reached    -> release the lease
 *   - lease lost to another worker                 -> stop WITHOUT writing
 */
async function driveVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  videoProvider: ReturnType<typeof createVideoProvider>,
  job: { id: string; battle_id: string; status: string; attempt_count: number },
  leaseToken: string,
  pollInline: boolean,
): Promise<VideoJobResult> {
  let result = await processVideoJob(supabase, videoProvider, job, leaseToken);
  if (
    !pollInline ||
    result.error === 'lease_lost' ||
    result.error === 'entitlement_reconciliation'
  )
    return result;

  const startedAt = Date.now();
  const schedule = pollScheduleFor();
  // A job we just submitted cannot be ready for ~40s, so the schedule opens
  // with a long wait. One picked up already in flight has been waiting since
  // an earlier invocation, so it skips straight to the tight interval.
  let scheduleIndex = result.status === 'submitted' ? 0 : 1;
  let consecutiveErrors = 0;
  let polls = 0;

  while (result.status === 'submitted' || result.status === 'processing') {
    if (
      !shouldContinuePolling({
        elapsedMs: Date.now() - startedAt,
        consecutiveErrors,
      })
    ) {
      break;
    }

    await sleep(schedule[Math.min(scheduleIndex, schedule.length - 1)]);
    scheduleIndex++;
    polls++;

    // Heartbeat. FALSE means the lease lapsed and another worker took the job
    // while we slept -- so we stop here rather than writing a result over
    // theirs. Returning without releasing is correct: the lease is no longer
    // ours to release.
    const { data: renewed } = await supabase.rpc('renew_video_job_lease', {
      p_job_id: job.id,
      p_token: leaseToken,
      p_lease_seconds: VIDEO_LEASE_SECONDS,
    });
    if (renewed !== true) {
      console.warn(`Lease lost on video job ${job.id}; yielding`);
      return { ...result, error: 'lease_lost', polls };
    }

    // Re-read so status, attempt_count and provider_job_id are current -- the
    // previous step may have moved the job from queued to submitted.
    const { data: fresh } = await supabase
      .from('video_jobs')
      .select('*')
      .eq('id', job.id)
      .maybeSingle();
    if (!fresh) break;

    result = await processVideoJob(supabase, videoProvider, fresh, leaseToken);
    if (
      result.error === 'lease_lost' ||
      result.error === 'entitlement_reconciliation'
    )
      return { ...result, polls };
    // Only CONSECUTIVE failures count: an isolated 429 between good polls says
    // nothing, a run of them says the provider is not answering us right now.
    consecutiveErrors = result.transient ? consecutiveErrors + 1 : 0;
  }

  if (result.status === 'submitted' || result.status === 'processing') {
    // Hand the job back mid-flight. Status is untouched, so the cron resumes
    // it within the minute and the worst case is exactly today's behaviour.
    await supabase.rpc('release_video_job_lease', {
      p_job_id: job.id,
      p_token: leaseToken,
    });
  }

  return { ...result, polls };
}

class VideoJobLeaseLostError extends Error {}
class VideoDurationMismatchError extends Error {}
class EntitlementReconciliationError extends Error {}

async function requireVideoJobLease(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  leaseToken: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('renew_video_job_lease', {
    p_job_id: jobId,
    p_token: leaseToken,
    p_lease_seconds: VIDEO_LEASE_SECONDS,
  });
  if (error || data !== true) throw new VideoJobLeaseLostError('lease_lost');
}

export async function processVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  videoProvider: ReturnType<typeof createVideoProvider>,
  job: Parameters<typeof processVideoJobStep>[2],
  leaseToken: string,
): Promise<VideoJobResult> {
  try {
    return await processVideoJobStep(supabase, videoProvider, job, leaseToken);
  } catch (error) {
    if (error instanceof VideoJobLeaseLostError)
      return { job_id: job.id, status: job.status, error: 'lease_lost' };
    if (error instanceof EntitlementReconciliationError) {
      await supabase.rpc('release_video_job_lease', {
        p_job_id: job.id,
        p_token: leaseToken,
      });
      return {
        job_id: job.id,
        status: job.status,
        error: 'entitlement_reconciliation',
        transient: true,
      };
    }
    throw error;
  }
}

async function processVideoJobStep(
  supabase: ReturnType<typeof createServiceClient>,
  videoProvider: ReturnType<typeof createVideoProvider>,
  job: {
    id: string;
    battle_id: string;
    status: string;
    attempt_count: number;
    provider_job_id?: string;
    duration_policy_version?: string | null;
    target_duration_seconds?: number | null;
    cinematic_profile?: string | null;
    execution_stage?: string | null;
    execution_started_at?: string | null;
    submitted_at?: string | null;
    base_video_path?: string | null;
    base_cost_usd?: number | null;
  },
  leaseToken: string,
): Promise<VideoJobResult> {
  const extended = isExtendedCinematic(job);
  const writeExecutionStage = async (
    stage: string,
    values: Record<string, unknown>,
  ) => {
    await requireVideoJobLease(supabase, job.id, leaseToken);
    const { data, error } = await supabase
      .from('video_jobs')
      .update({ ...values, execution_stage: stage })
      .eq('id', job.id)
      .eq('lease_token', leaseToken)
      .eq('execution_stage', job.execution_stage ?? 'base')
      .select('id')
      .maybeSingle();
    if (error) {
      if (error.message?.includes('cinematic_lease_lost'))
        throw new VideoJobLeaseLostError();
      throw new CinematicPreparationError(
        'Cinematic execution persistence unavailable',
      );
    }
    if (!data) throw new VideoJobLeaseLostError();
    Object.assign(job, values, { execution_stage: stage });
  };
  const reconcileEntitlement = async (
    outcome: 'succeeded' | 'failed' | 'moderation_failed',
    errorCode?: string,
  ) => {
    await requireVideoJobLease(supabase, job.id, leaseToken);
    await handleTerminalEntitlement(
      supabase,
      job,
      outcome,
      errorCode,
      leaseToken,
    );
  };
  try {
    await requireVideoJobLease(supabase, job.id, leaseToken);
    // Fetch battle context with bot_persona for bot battles
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select(
        `
        *,
        player_one_character:characters!battles_player_one_character_id_fkey(*),
        player_two_character:characters!battles_player_two_character_id_fkey(*),
        bot_persona:bot_personas(*)
      `,
      )
      .eq('id', job.battle_id)
      .single();

    if (battleError || !battle) {
      await reconcileEntitlement('failed', 'battle_not_found');
      await failJob(
        supabase,
        job.id,
        'battle_not_found',
        'Battle not found',
        leaseToken,
      );
      return { job_id: job.id, status: 'failed', error: 'battle_not_found' };
    }

    if (!(await canGenerateBattle(supabase, battle))) {
      await reconcileEntitlement('failed', 'account_eligibility_required');
      await failJob(
        supabase,
        job.id,
        'account_eligibility_required',
        'Generation is unavailable for a participant',
        leaseToken,
      );
      return {
        job_id: job.id,
        status: 'failed',
        error: 'account_eligibility_required',
      };
    }

    if (extended && cinematicExecutionTimedOut(job)) {
      await reconcileEntitlement('failed', 'hard_timeout');
      await failJob(
        supabase,
        job.id,
        'hard_timeout',
        'Cinematic stage exceeded 300s or total execution exceeded 600s',
        leaseToken,
      );
      return { job_id: job.id, status: 'failed', error: 'hard_timeout' };
    }
    if (
      extended &&
      ['base_submitting', 'extension_submitting'].includes(
        job.execution_stage ?? '',
      )
    ) {
      // An accepted request may have lost its response. Never pay for it again.
      return {
        job_id: job.id,
        status: 'processing',
        error: 'submission_uncertain',
      };
    }
    if (extended && job.execution_stage === 'extension_ready') {
      if (!job.base_video_path || !videoProvider.submitVideoExtension)
        throw new CinematicPreparationError(
          'Cinematic extension input unavailable',
          false,
        );
      const { data: saved, error } = await supabase
        .from('video_job_inputs')
        .select('payload')
        .eq('video_job_id', job.id)
        .maybeSingle();
      if (error || !saved?.payload)
        throw new CinematicPreparationError(
          'Frozen extension input unavailable',
        );
      const input = saved.payload;
      if (
        input.battleId !== job.battle_id ||
        input.policy?.target_duration_seconds !== 20 ||
        input.policy?.duration_policy_version !== 'cinematics-v3'
      )
        throw new CinematicPreparationError(
          'Frozen extension input mismatch',
          false,
        );
      await moderateCinematicInput(supabase, input, battle, job.id);
      await assertFrozenCinematicAssetApproval(supabase, input);
      const { data: signed, error: signError } = await supabase.storage
        .from('cinematic-work')
        .createSignedUrl(job.base_video_path, 3600);
      if (signError || !signed?.signedUrl)
        throw new CinematicPreparationError('Private base signing unavailable');
      await writeExecutionStage('extension_submitting', {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      });
      const submission = await videoProvider.submitVideoExtension({
        videoUrl: signed.signedUrl,
        prompt: composeCinematicExtensionPrompt(input),
        durationSeconds: 5,
      });
      await writeExecutionStage('extension', {
        provider_job_id: submission.providerJobId,
        provider_request_id: submission.providerRequestId,
        provider_model: submission.model ?? null,
        submitted_duration_seconds: submission.durationSeconds ?? 5,
        provider_cost_usd:
          job.base_cost_usd != null &&
          configuredVideoCostUsd(
            submission.model,
            submission.durationSeconds ?? 5,
          ) != null
            ? Number(job.base_cost_usd) +
              configuredVideoCostUsd(
                submission.model,
                submission.durationSeconds ?? 5,
              )!
            : null,
      });
      return { job_id: job.id, status: 'submitted' };
    }

    if (job.status === 'queued') {
      let generationRequest: VideoGenerationRequest;
      if (
        ['cinematics-v2', 'cinematics-v3'].includes(
          (job as any).duration_policy_version,
        )
      ) {
        generationRequest = await prepareCinematicGeneration(
          supabase,
          job as any,
          battle,
          leaseToken,
        );
      } else {
        let recordedRound = null;
        if ((job as any).battle_round_id) {
          const { data, error } = await supabase
            .from('battle_rounds')
            .select(
              'id,battle_id,round_number,status,situation_snapshot,judge_payload,round_winner_id,is_draw',
            )
            .eq('id', (job as any).battle_round_id)
            .eq('battle_id', job.battle_id)
            .maybeSingle();
          if (error) throw new Error('Recorded round unavailable');
          recordedRound = data;
        }
        if (
          !(job as any).battle_round_id &&
          battle.score_payload?.frozen_inputs
        ) {
          recordedRound = {
            status: 'result_ready',
            judge_payload: battle.score_payload,
            situation_snapshot:
              battle.score_payload.frozen_inputs.situation_snapshot,
            round_winner_id: battle.winner_id,
            is_draw: battle.is_draw,
          };
        }
        const recorded = composerVideoInputs(battle, recordedRound);

        // Fetch only the prompts represented by this job. Without the round filter,
        // a completed Bo3 returns 4-6 locked prompt rows and final-round videos fail
        // the exact-two validation below.
        let promptQuery = supabase
          .from('battle_prompts')
          .select('*')
          .eq('battle_id', job.battle_id)
          .eq('is_locked', true);
        if ((job as any).battle_round_id) {
          promptQuery = promptQuery.eq(
            'round_number',
            (recordedRound as any)?.round_number ??
              (job as any).round_number ??
              1,
          );
        }
        const { data: scopedPrompts, error: scopedPromptsError } =
          await promptQuery;

        // Fetch prompts (handle bot battles vs human battles)
        let p1Prompt, p2Prompt;

        if (battle.is_player_two_bot) {
          // Bot battle: only player one has a prompt in battle_prompts
          if (
            scopedPromptsError ||
            !scopedPrompts ||
            scopedPrompts.length !== 1
          ) {
            await reconcileEntitlement('failed', 'prompts_not_found');
            await failJob(
              supabase,
              job.id,
              'prompts_not_found',
              'Bot battle requires exactly one human prompt',
              leaseToken,
            );
            return {
              job_id: job.id,
              status: 'failed',
              error: 'prompts_not_found',
            };
          }

          p1Prompt = scopedPrompts.find(
            (p) => p.profile_id === battle.player_one_id,
          );
          if (!p1Prompt) {
            await reconcileEntitlement('failed', 'prompts_mismatch');
            await failJob(
              supabase,
              job.id,
              'prompts_mismatch',
              'Human prompt not found',
              leaseToken,
            );
            return {
              job_id: job.id,
              status: 'failed',
              error: 'prompts_mismatch',
            };
          }

          // Generate bot prompt from bot_prompt_library
          if (recorded) {
            p2Prompt = {
              custom_prompt_text: recorded.playerTwoPrompt,
              move_type: recorded.playerTwoMoveType,
              profile_id: null,
            };
          } else {
            throw new Error(
              'Recorded bot move unavailable; refusing to invent an action',
            );
          }
        } else {
          // Human vs human: both prompts in battle_prompts
          if (
            scopedPromptsError ||
            !scopedPrompts ||
            scopedPrompts.length !== 2
          ) {
            await reconcileEntitlement('failed', 'prompts_not_found');
            await failJob(
              supabase,
              job.id,
              'prompts_not_found',
              'Prompts not found',
              leaseToken,
            );
            return {
              job_id: job.id,
              status: 'failed',
              error: 'prompts_not_found',
            };
          }

          p1Prompt = scopedPrompts.find(
            (p) => p.profile_id === battle.player_one_id,
          );
          p2Prompt = scopedPrompts.find(
            (p) => p.profile_id === battle.player_two_id,
          );

          if (!p1Prompt || !p2Prompt) {
            await reconcileEntitlement('failed', 'prompts_mismatch');
            await failJob(
              supabase,
              job.id,
              'prompts_mismatch',
              'Prompts mismatch',
              leaseToken,
            );
            return {
              job_id: job.id,
              status: 'failed',
              error: 'prompts_mismatch',
            };
          }
        }

        // Get prompt text
        const getPromptText = async (
          prompt: typeof p1Prompt,
        ): Promise<string> => {
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

        const p1Text =
          recorded?.playerOnePrompt ?? (await getPromptText(p1Prompt));
        const p2Text =
          recorded?.playerTwoPrompt ?? (await getPromptText(p2Prompt));

        // Legacy adapter retains compatibility for already-created jobs.
        // Submit new video generation
        // Use bot_persona as player_two character metadata for bot battles
        const playerTwoCharacterName = battle.is_player_two_bot
          ? battle.bot_persona?.name
          : battle.player_two_character?.name;
        const playerTwoArchetype = battle.is_player_two_bot
          ? battle.bot_persona?.archetype
          : battle.player_two_character?.archetype;

        // Reference images: the two fighters' full-body renders, so the cinematic
        // shows the players' actual characters rather than a generic figure the
        // prompt merely describes.
        //
        // Entirely best-effort. Every step is allowed to fail to null and the
        // whole block is wrapped, because "battle completion never depends on
        // video" is the governing invariant here -- and a video that ignores the
        // reference is far better than a battle that will not finish.
        let referenceImageUrls: string[] = [];
        try {
          const characterIds = [
            battle.player_one_character?.id,
            battle.is_player_two_bot ? null : battle.player_two_character?.id,
          ].filter(Boolean) as string[];

          const signed = await Promise.all(
            characterIds.map(async (characterId) => {
              const portrait = await resolveCurrentPortrait(
                supabase,
                characterId,
                // The FIGHTER render deliberately: it is the full-body image, and
                // a head/bust avatar would give the model no body to animate.
                'fighter',
              );
              if (!portrait?.image_path) return null;
              return await signPortraitPath(
                supabase,
                portrait.image_path,
                VIDEO_REFERENCE_SIGNED_URL_TTL_SECONDS,
              );
            }),
          );
          referenceImageUrls = signed.filter(Boolean) as string[];
        } catch (refErr) {
          console.error(
            'Reference image resolution failed (continuing text-only):',
            refErr,
          );
          referenceImageUrls = [];
        }

        generationRequest = {
          battleId: job.battle_id,
          playerOneCharacterName: battle.player_one_character.name,
          playerOneArchetype: battle.player_one_character.archetype,
          playerOnePrompt: p1Text,
          playerOneMoveType: recorded?.playerOneMoveType ?? p1Prompt.move_type,
          playerTwoCharacterName: playerTwoCharacterName || 'Unknown',
          playerTwoArchetype: playerTwoArchetype || 'bot',
          playerTwoPrompt: p2Text,
          playerTwoMoveType: recorded?.playerTwoMoveType ?? p2Prompt.move_type,
          // Provider prompts use blind p1/p2 labels, not database UUIDs.
          winnerId: recorded
            ? recorded.winnerId
            : battle.is_draw
              ? null
              : battle.winner_id === battle.player_one_id
                ? 'p1'
                : 'p2',
          isDraw: recorded?.isDraw ?? battle.is_draw,
          theme: recorded?.theme ?? battle.theme,
          targetDurationSeconds: targetDurationFor(job as any),
          aspectRatio: '9:16',
          referenceImageUrls,
          safetyConstraints: [
            'no_real_person_likeness',
            'no_violence',
            'no_nsfw',
            'no_dialogue_or_narration',
          ],
        };
      }
      await requireVideoJobLease(supabase, job.id, leaseToken);
      if (extended)
        await writeExecutionStage('base_submitting', {
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          execution_started_at:
            job.execution_started_at ?? new Date().toISOString(),
        });
      const submission =
        await videoProvider.submitVideoGeneration(generationRequest);
      await requireVideoJobLease(supabase, job.id, leaseToken);

      // Update job to submitted
      const { error: updateError } = await supabase
        .from('video_jobs')
        .update({
          status: 'submitted',
          ...(extended ? { execution_stage: 'base' } : {}),
          provider_job_id: submission.providerJobId,
          provider_request_id: submission.providerRequestId,
          submitted_at: new Date().toISOString(),
          attempt_count: job.attempt_count + 1,
          // Stored now, not derived later: the provider swaps to a
          // reference-capable (differently priced) model when references are
          // sent, and config read after the fact cannot tell which ran.
          provider_model: submission.model ?? null,
          submitted_duration_seconds:
            submission.durationSeconds ??
            generationRequest.targetDurationSeconds,
          provider_cost_usd:
            configuredVideoCostUsd(
              submission.model,
              submission.durationSeconds ??
                generationRequest.targetDurationSeconds,
            ) ?? null,
        })
        .eq('id', job.id)
        .eq('lease_token', leaseToken);

      if (updateError) {
        if (extended)
          throw new CinematicPreparationError(
            'Accepted base submission persistence unavailable',
          );
        console.error('Failed to update job:', updateError);
      }

      return { job_id: job.id, status: 'submitted' };
    }

    if (job.status === 'submitted' || job.status === 'processing') {
      // Hard timeout (§8.6): a job stuck at the provider past HARD_TIMEOUT_SECONDS
      // is force-failed and refunded instead of being polled forever. Tier 0 stays
      // authoritative, so legacy battles return to result_ready like other failures.
      const startedAt = (job as any).submitted_at ?? (job as any).created_at;
      if (!extended && isPastHardTimeout(startedAt, HARD_TIMEOUT_SECONDS)) {
        await reconcileEntitlement('failed', 'hard_timeout');
        await failJob(
          supabase,
          job.id,
          'hard_timeout',
          `Video generation exceeded ${HARD_TIMEOUT_SECONDS}s hard timeout`,
          leaseToken,
        );

        return { job_id: job.id, status: 'failed', error: 'hard_timeout' };
      }

      // Poll provider status
      if (!job.provider_job_id) {
        await reconcileEntitlement('failed', 'missing_provider_job_id');
        await failJob(
          supabase,
          job.id,
          'missing_provider_job_id',
          'Provider job ID missing',
          leaseToken,
        );
        return {
          job_id: job.id,
          status: 'failed',
          error: 'missing_provider_job_id',
        };
      }

      const providerStatus = await videoProvider.pollVideoStatus(
        job.provider_job_id,
      );

      await requireVideoJobLease(supabase, job.id, leaseToken);
      const stageCostUsd =
        providerStatus.costUsd ??
        configuredVideoCostUsd(
          (job as any).provider_model,
          (job as any).submitted_duration_seconds ??
            (extended ? 15 : targetDurationFor(job as any)),
        ) ??
        null;

      if (extended && providerStatus.costUsd != null) {
        const total =
          job.execution_stage === 'extension'
            ? job.base_cost_usd != null
              ? Number(job.base_cost_usd) + providerStatus.costUsd
              : null
            : providerStatus.costUsd;
        const { data, error } = await supabase
          .from('video_jobs')
          .update({ provider_cost_usd: total })
          .eq('id', job.id)
          .eq('lease_token', leaseToken)
          .select('id')
          .maybeSingle();
        if (error)
          throw new CinematicPreparationError(
            'Cinematic cost persistence unavailable',
          );
        if (!data) throw new VideoJobLeaseLostError();
      }

      if (providerStatus.status === 'processing') {
        // Still processing, update timestamp
        await supabase
          .from('video_jobs')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('lease_token', leaseToken);

        return { job_id: job.id, status: 'processing' };
      }

      if (providerStatus.status === 'succeeded' && providerStatus.videoUrl) {
        const isBase = extended && job.execution_stage !== 'extension';
        let videoUrl;
        let measuredDurationSeconds: number | null = null;
        try {
          const copied = await copyVideoToStorage(
            supabase,
            job.battle_id,
            job.id,
            providerStatus.videoUrl,
            leaseToken,
            isBase ? 'cinematic-work' : 'battle-videos',
            isBase ? `${job.id}/base.mp4` : undefined,
            extended ? (isBase ? 15 : 20) : undefined,
          );
          videoUrl = copied.path;
          measuredDurationSeconds = copied.durationSeconds;
        } catch (storageError) {
          if (storageError instanceof VideoJobLeaseLostError)
            throw storageError;
          const errorCode =
            storageError instanceof VideoDurationMismatchError
              ? 'duration_mismatch'
              : 'storage_failed';
          console.error('Storage copy failed:', storageError);
          await reconcileEntitlement('failed', errorCode);
          await failJob(
            supabase,
            job.id,
            errorCode,
            errorCode === 'duration_mismatch'
              ? 'Downloaded video did not meet the cinematic duration'
              : 'Failed to copy video to storage',
            leaseToken,
          );
          // §8.6: storage failure keeps the battle completed on Tier 0 and offers
          // a retry. Restore result_ready for legacy battles (per-round jobs don't
          // own battle.status); request-video-upgrade then allows a fresh attempt.
          return { job_id: job.id, status: 'failed', error: errorCode };
        }

        await requireVideoJobLease(supabase, job.id, leaseToken);

        if (isBase) {
          const moderation = await moderateCinematicBase(
            supabase,
            job.id,
            job.battle_id,
            videoUrl,
            providerStatus,
          );
          await requireVideoJobLease(supabase, job.id, leaseToken);
          if (moderation.status !== 'approved') {
            await reconcileEntitlement(
              'moderation_failed',
              'moderation_not_approved',
            );
            await failJob(
              supabase,
              job.id,
              'moderation_not_approved',
              moderation.reason ?? 'Base video did not pass moderation',
              leaseToken,
            );
            return {
              job_id: job.id,
              status: 'failed',
              error: 'moderation_not_approved',
            };
          }
          await writeExecutionStage('extension_ready', {
            status: 'processing',
            base_video_path: videoUrl,
            base_provider_job_id: job.provider_job_id,
            base_provider_model: (job as any).provider_model ?? null,
            base_submitted_duration_seconds:
              (job as any).submitted_duration_seconds ?? 15,
            base_cost_usd: stageCostUsd,
            provider_cost_usd: stageCostUsd,
            submitted_at: new Date().toISOString(),
          });
          return { job_id: job.id, status: 'processing' };
        }

        // Create or restore the private video row. A stable storage path plus
        // this lookup makes provider-complete retries idempotent.
        const videoPayload = {
          battle_id: job.battle_id,
          video_job_id: job.id,
          battle_round_id: (job as any).battle_round_id ?? null,
          storage_path: videoUrl,
          moderation_status: 'pending', // requires post-gen moderation
          moderation_reason: null,
          moderated_at: null,
          moderation_provider: null,
          moderation_confidence: null,
          visibility: 'private',
          is_ai_generated: true, // §22 disclosure travels with the asset row
        };
        const { data: existingVideo } = await supabase
          .from('videos')
          .select('id')
          .eq('video_job_id', job.id)
          .maybeSingle();
        const videoWrite = existingVideo
          ? supabase
              .from('videos')
              .update(videoPayload)
              .eq('id', existingVideo.id)
          : supabase.from('videos').insert(videoPayload);
        const { data: videoRow, error: videoError } = await videoWrite
          .select('id')
          .single();

        if (videoError || !videoRow) {
          console.error('Failed to create video row:', videoError);
          await reconcileEntitlement('failed', 'storage_failed');
          await failJob(
            supabase,
            job.id,
            'storage_failed',
            'Failed to store video metadata',
            leaseToken,
          );
          // §8.6: keep Tier 0 visible and retryable (legacy only).
          return { job_id: job.id, status: 'failed', error: 'storage_failed' };
        }

        await requireVideoJobLease(supabase, job.id, leaseToken);

        // Best-effort default caption insertion. Captions are nice-to-have for
        // accessibility / share-readiness; failures here MUST NOT fail the job.
        try {
          await insertDefaultCaptions(supabase, videoRow.id, battle, job);
        } catch (captionErr) {
          console.error('Caption insertion failed (non-fatal):', captionErr);
        }

        // Invoke post-generation video moderation (blocking for refund logic)
        try {
          const moderationResult = await moderateVideo(
            supabase,
            videoRow.id,
            job.battle_id,
            providerStatus.moderationApproved,
            providerStatus.moderationProvider,
            leaseToken,
          );

          // Only an explicit approval may become playable. Rejected or
          // quarantined/flagged assets stay private and follow the refund path.
          if (moderationResult.status !== 'approved') {
            const moderationErrorCode =
              moderationResult.status === 'rejected'
                ? 'moderation_rejected'
                : 'moderation_not_approved';
            await reconcileEntitlement(
              'moderation_failed',
              moderationErrorCode,
            );
            await failJob(
              supabase,
              job.id,
              moderationErrorCode,
              moderationResult.reason || 'Video did not pass moderation',
              leaseToken,
            );

            // Return battle to result_ready so Tier 0 remains visible (legacy only;
            // per-round jobs leave battle.status alone — Tier 0 is already on
            // battle_rounds.cinematic_asset_url and remains authoritative).

            return {
              job_id: job.id,
              status: 'failed',
              error: moderationErrorCode,
            };
          }
        } catch (modError) {
          if (
            modError instanceof VideoJobLeaseLostError ||
            modError instanceof EntitlementReconciliationError
          )
            throw modError;
          console.error('Video moderation failed:', modError);
          // Fail closed: the stored object stays private and no playable URL is
          // exposed. Paid/grant jobs are reconciled by the normal refund path.
          await reconcileEntitlement(
            'moderation_failed',
            'moderation_unavailable',
          );
          await failJob(
            supabase,
            job.id,
            'moderation_unavailable',
            'Video moderation could not complete',
            leaseToken,
          );
          return {
            job_id: job.id,
            status: 'failed',
            error: 'moderation_unavailable',
          };
        }

        await reconcileEntitlement('succeeded');

        // Publication is fenced on the lease after idempotent entitlement
        // reconciliation. A failed reconciliation leaves the job resumable.
        const submittedAtMs = Date.parse(
          (extended ? job.execution_started_at : (job as any).submitted_at) ??
            (job as any).created_at ??
            '',
        );
        const { data: marked } = await supabase
          .from('video_jobs')
          .update({
            status: 'succeeded',
            // Preserve the amount reserved at enqueue. Automatic/free and
            // subscriber jobs must never be rewritten as a credit spend.
            credits_charged: (job as any).credits_charged ?? 0,
            completed_at: new Date().toISOString(),
            // These columns have existed since 20260822191000 and nothing has
            // ever written them, so daily_provider_costs has reported zero
            // video spend for its whole life -- which is why the 100/day auto
            // cap has never been a priced decision.
            provider_cost_usd: extended
              ? job.base_cost_usd != null && stageCostUsd != null
                ? Number(job.base_cost_usd) + stageCostUsd
                : null
              : stageCostUsd,
            actual_duration_seconds:
              measuredDurationSeconds ?? providerStatus.durationSeconds ?? null,
            provider_latency_ms: Number.isFinite(submittedAtMs)
              ? Date.now() - submittedAtMs
              : null,
          })
          .eq('id', job.id)
          .eq('lease_token', leaseToken)
          .select('id')
          .maybeSingle();

        if (!marked) {
          console.warn(
            `Video job ${job.id} succeeded but the lease was lost; leaving the holder to finish`,
          );
          return { job_id: job.id, status: 'succeeded', error: 'lease_lost' };
        }

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
        if (!extended && job.attempt_count + 1 < MAX_RETRY_ATTEMPTS) {
          // Retry: reset to queued without refunding (only refund on terminal failure)
          await supabase
            .from('video_jobs')
            .update({
              status: 'queued',
              attempt_count: job.attempt_count + 1,
              error_code: providerStatus.errorCode,
              error_message: providerStatus.errorMessage,
            })
            .eq('id', job.id)
            .eq('lease_token', leaseToken);

          return { job_id: job.id, status: 'retry_queued' };
        } else {
          // Max retries, refund based on entitlement source and set battle back to result_ready
          await reconcileEntitlement(
            'failed',
            providerStatus.errorCode || 'provider_failed',
          );
          await failJob(
            supabase,
            job.id,
            providerStatus.errorCode || 'provider_failed',
            providerStatus.errorMessage || 'Provider failed',
            leaseToken,
          );

          // Set battle status back to result_ready so Tier 0 result is visible
          // (legacy only — per-round jobs do not own battle.status).

          return {
            job_id: job.id,
            status: 'failed',
            error: providerStatus.errorCode,
          };
        }
      }
    }

    return { job_id: job.id, status: job.status };
  } catch (error) {
    if (
      error instanceof VideoJobLeaseLostError ||
      error instanceof EntitlementReconciliationError
    )
      throw error;
    // A poll that could not be COMPLETED says nothing about the job -- only
    // about this attempt to ask after it. This catch used to turn every such
    // error into a terminal `processing_error`, so one xAI 429 permanently
    // failed and refunded a job whose video was generating perfectly well.
    //
    // What keeps this bounded is the hard timeout: it is measured from
    // submitted_at, not from poll attempts, so no number of swallowed
    // transient errors can carry a job past TIER1_HARD_TIMEOUT_S.
    if (
      extended &&
      job.status !== 'queued' &&
      !(error instanceof CinematicPreparationError && !error.retryable)
    ) {
      await requireVideoJobLease(supabase, job.id, leaseToken);
      return {
        job_id: job.id,
        status: 'processing',
        error: ['base_submitting', 'extension_submitting'].includes(
          job.execution_stage ?? '',
        )
          ? 'submission_uncertain'
          : 'cinematic_execution_retry',
        transient: true,
      };
    }
    if (error instanceof CinematicPreparationError) {
      if (error.message.includes('lease_lost'))
        return { job_id: job.id, status: job.status, error: 'lease_lost' };
      await requireVideoJobLease(supabase, job.id, leaseToken);
      if (
        error.retryable &&
        job.status === 'queued' &&
        job.attempt_count + 1 < MAX_RETRY_ATTEMPTS
      ) {
        await supabase
          .from('video_jobs')
          .update({
            attempt_count: job.attempt_count + 1,
            error_code: 'cinematic_preparation',
            error_message: error.message,
          })
          .eq('id', job.id)
          .eq('lease_token', leaseToken);
        await supabase.rpc('release_video_job_lease', {
          p_job_id: job.id,
          p_token: leaseToken,
        });
        return {
          job_id: job.id,
          status: 'retry_queued',
          error: 'cinematic_preparation',
        };
      }
    }
    const inFlight = job.status === 'submitted' || job.status === 'processing';
    const startedAt = (job as any).submitted_at ?? (job as any).created_at;
    if (
      error instanceof VideoProviderError &&
      isTransientPollError(error.code) &&
      inFlight &&
      !isPastHardTimeout(startedAt, HARD_TIMEOUT_SECONDS)
    ) {
      console.warn(
        `Transient poll error on video job ${job.id} (${error.code}); leaving in flight`,
      );
      return {
        job_id: job.id,
        status: 'processing',
        error: error.code,
        transient: true,
      };
    }

    console.error(`Error processing video job ${job.id}:`, error);
    await reconcileEntitlement('failed', 'processing_error');
    await failJob(
      supabase,
      job.id,
      'processing_error',
      error instanceof Error ? error.message : 'Unknown error',
      leaseToken,
    );
    return { job_id: job.id, status: 'failed', error: 'processing_error' };
  }
}

/**
 * Mark a video job failed, and always release the battle back to result_ready.
 *
 * The release used to be duplicated at each call site, and three of them missed
 * it -- `missing_provider_job_id`, `moderation_unavailable`, and the top-level
 * submission catch. A legacy (non-round) battle taking the paid upgrade path is
 * moved to `generating_video` by request-video-upgrade, so those three paths
 * left it there permanently: the player saw a spinner forever, even though
 * their Tier 0 result was sitting ready underneath.
 *
 * Doing it here rather than at 13 call sites means no future failure path can
 * forget. The update is scoped to `status = 'generating_video'`, so it is
 * idempotent, cannot clobber a battle in any other state, and is a no-op for
 * the paths that already released it explicitly.
 *
 * Per-round (Bo3) jobs never touch battles.status at all, so they are
 * unaffected -- the `battle_round_id IS NULL` check preserves that.
 */
async function failJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  errorCode: string,
  errorMessage: string,
  leaseToken: string,
): Promise<void> {
  // Fenced on the lease. A worker whose claim lapsed mid-flight (slow
  // provider, cold start) must not be able to write a terminal failure over
  // the result of the worker that took the job from it. No row updated means
  // exactly that happened, and the newer worker owns the outcome.
  const { data: failed } = await supabase
    .from('video_jobs')
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('lease_token', leaseToken)
    .select('battle_id, battle_round_id')
    .maybeSingle();

  if (!failed) {
    console.warn(
      `failJob(${jobId}, ${errorCode}) wrote nothing -- lease no longer held`,
    );
    return;
  }

  if (failed?.battle_id && !failed.battle_round_id) {
    const { error } = await supabase
      .from('battles')
      .update({ status: 'result_ready' })
      .eq('id', failed.battle_id)
      .eq('status', 'generating_video');
    if (error) {
      console.error('Failed to release battle after video failure:', error);
    }
  }
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
  job?: any,
): Promise<void> {
  if (
    ['cinematics-v2', 'cinematics-v3'].includes(job?.duration_policy_version)
  ) {
    const { data, error } = await supabase
      .from('video_job_inputs')
      .select('payload')
      .eq('video_job_id', job.id)
      .maybeSingle();
    if (error || !data?.payload) {
      console.warn(
        'Saved cinematic input unavailable; skipping captions',
        job.id,
      );
      return;
    }
    const lines = buildCinematicCaptions(data.payload);
    const locale = 'en-US';
    const { error: captionError } = await supabase
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
    if (captionError)
      console.error('video_captions upsert error (non-fatal):', captionError);
    return;
  }
  const tier0 = battle?.tier0_reveal_payload ?? null;
  const score = battle?.score_payload ?? null;

  const lines: Array<{ start_ms: number; end_ms: number; text: string }> = [];

  // Line 1 — headline summary.
  let line1Text: string | null = null;
  if (
    tier0 &&
    typeof tier0.summary === 'string' &&
    tier0.summary.trim().length > 0
  ) {
    line1Text = tier0.summary.trim();
  } else if (battle?.is_draw) {
    line1Text = 'Draw';
  } else if (battle?.winner_id) {
    const winnerName =
      battle.winner_id === battle.player_one_id
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
  if (
    score &&
    typeof score.explanation === 'string' &&
    score.explanation.trim().length > 0
  ) {
    const raw = score.explanation.trim();
    // First sentence boundary or 140-char hard cap, whichever is shorter.
    const sentenceMatch = raw.match(/^.+?[.!?](?:\s|$)/);
    const firstSentence = sentenceMatch ? sentenceMatch[0].trim() : raw;
    const line2Text =
      firstSentence.length > 140
        ? firstSentence.slice(0, 140).trimEnd()
        : firstSentence;
    if (line2Text.length > 0) {
      lines.push({ start_ms: 3000, end_ms: 7000, text: line2Text });
    }
  }

  // Line 3 — finisher attribution.
  if (battle?.winner_id) {
    const winnerCharName =
      battle.winner_id === battle.player_one_id
        ? battle.player_one_character?.name
        : battle.is_player_two_bot
          ? battle.bot_persona?.name
          : battle.player_two_character?.name;
    if (winnerCharName) {
      lines.push({
        start_ms: 7000,
        end_ms: 9000,
        text: `Finisher: ${winnerCharName}`,
      });
    }
  }

  if (lines.length === 0) {
    return;
  }

  const locale = 'en-US';
  const { error } = await supabase.from('video_captions').upsert(
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
function normalizeRoundSource(
  stored: string | null | undefined,
): RoundUpgradeSource | null {
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
  leaseToken: string = job.lease_token,
): Promise<void> {
  if (job.trigger === 'auto_free' || job.entitlement_source === 'auto_free')
    return;
  // Round-mode path.
  if (job.battle_round_id) {
    const source = normalizeRoundSource(job.entitlement_source);
    if (!source) {
      console.warn(
        'handleTerminalEntitlement: unknown entitlement_source for round-mode job',
        {
          job_id: job.id,
          entitlement_source: job.entitlement_source,
        },
      );
      return;
    }
    if (!job.requester_profile_id) {
      console.warn('handleTerminalEntitlement: missing requester_profile_id', {
        job_id: job.id,
      });
      return;
    }
    try {
      let roundNumber = job.round_number;
      if (
        !Number.isInteger(roundNumber) ||
        roundNumber < 1 ||
        roundNumber > 3
      ) {
        const { data: round, error } = await supabase
          .from('battle_rounds')
          .select('round_number')
          .eq('id', job.battle_round_id)
          .eq('battle_id', job.battle_id)
          .maybeSingle();
        if (error || !round)
          throw new EntitlementReconciliationError(
            'Recorded billing round unavailable',
          );
        roundNumber = round.round_number;
      }
      await finalizeRoundUpgradeEntitlement(
        {
          reservation_id: job.spend_transaction_id ?? null,
          source,
          profile_id: job.requester_profile_id,
          battle_id: job.battle_id,
          round_number: roundNumber,
          is_full_battle: source === 'subscriber_full',
        },
        outcome,
        supabase as any,
      );
      await requireVideoJobLease(supabase, job.id, leaseToken);
      // Mark refunded for terminal failure outcomes so the legacy path will
      // not double-process this row if invoked later.
      if (outcome !== 'succeeded') {
        await supabase
          .from('video_jobs')
          .update({ refunded: true })
          .eq('id', job.id)
          .eq('lease_token', leaseToken);
      }
    } catch (e) {
      if (e instanceof VideoJobLeaseLostError) throw e;
      throw new EntitlementReconciliationError(
        e instanceof Error ? e.message : 'Round entitlement unavailable',
      );
    }
    return;
  }

  // Legacy path: refunds only on failure, and only for refundable triggers.
  if (outcome === 'succeeded') return;
  if (
    job.trigger === 'auto_free' ||
    !['credits', 'free_grant', 'subscription_allowance'].includes(
      job.entitlement_source,
    )
  )
    return;
  await refundVideoJobOnFailure(
    supabase,
    job.id,
    errorCode ?? outcome,
    leaseToken,
  );
}

/**
 * Refund video job on internal failure (idempotent, source-aware)
 * Separate from provider max-retry refunds
 */
async function refundVideoJobOnFailure(
  supabase: ReturnType<typeof createServiceClient>,
  videoJobId: string,
  errorCode: string,
  leaseToken?: string,
): Promise<void> {
  // Fetch video job with entitlement details
  const { data: job, error: readError } = await supabase
    .from('video_jobs')
    .select(
      'requester_profile_id, entitlement_source, credits_charged, spend_transaction_id, refunded',
    )
    .eq('id', videoJobId)
    .single();

  if (readError || !job)
    throw new EntitlementReconciliationError('Refund funding unavailable');
  if (job.refunded) {
    console.log('Video job already refunded or not found:', videoJobId);
    return;
  }

  if (!job.requester_profile_id || !job.entitlement_source) {
    console.warn(
      'Video job missing requester or entitlement source, cannot refund:',
      videoJobId,
    );
    throw new EntitlementReconciliationError('Refund funding is incomplete');
  }

  const refundIdempotencyKey = `refund-video-${videoJobId}`;

  try {
    switch (job.entitlement_source) {
      case 'credits':
        // Refund credits using grant_credits RPC
        if (job.credits_charged && job.credits_charged > 0) {
          const { error } = await supabase.rpc('grant_credits', {
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
          if (error) throw new EntitlementReconciliationError(error.message);
          console.log(
            `Refunded ${job.credits_charged} credits to profile ${job.requester_profile_id}`,
          );
        }
        break;

      case 'free_grant': {
        // Restore free tier reveal
        const { error: grantError } = await supabase.rpc(
          'restore_free_tier1_reveal',
          {
            p_profile_id: job.requester_profile_id,
            p_video_job_id: videoJobId,
            p_idempotency_key: refundIdempotencyKey,
          },
        );
        if (grantError)
          throw new EntitlementReconciliationError(grantError.message);
        console.log(
          `Restored free Tier 1 reveal to profile ${job.requester_profile_id}`,
        );
        break;
      }

      case 'subscription_allowance': {
        // Restore subscription allowance
        const { error: allowanceError } = await supabase.rpc(
          'restore_subscription_allowance',
          {
            p_profile_id: job.requester_profile_id,
            p_video_job_id: videoJobId,
            p_idempotency_key: refundIdempotencyKey,
          },
        );
        if (allowanceError)
          throw new EntitlementReconciliationError(allowanceError.message);
        console.log(
          `Restored subscription allowance to profile ${job.requester_profile_id}`,
        );
        break;
      }

      default:
        throw new EntitlementReconciliationError(
          'Unknown entitlement source for refund',
        );
    }

    if (leaseToken)
      await requireVideoJobLease(supabase, videoJobId, leaseToken);
    // Mark job as refunded
    const { error: markerError } = await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', videoJobId)
      .eq('lease_token', leaseToken);
    if (markerError)
      throw new EntitlementReconciliationError(markerError.message);
  } catch (error) {
    if (error instanceof VideoJobLeaseLostError) throw error;
    throw error instanceof EntitlementReconciliationError
      ? error
      : new EntitlementReconciliationError(
          error instanceof Error ? error.message : 'Refund unavailable',
        );
  }
}

/**
 * Refund video job based on entitlement source (legacy, used for provider max retries)
 * Handles credits, subscription_allowance, and free_grant sources
 */
async function refundVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  videoJobId: string,
): Promise<void> {
  // Fetch video job with entitlement details
  const { data: job } = await supabase
    .from('video_jobs')
    .select(
      'requester_profile_id, entitlement_source, credits_charged, spend_transaction_id, refunded',
    )
    .eq('id', videoJobId)
    .single();

  if (!job || job.refunded) {
    console.log('Video job already refunded or not found:', videoJobId);
    return;
  }

  if (!job.requester_profile_id || !job.entitlement_source) {
    console.warn(
      'Video job missing requester or entitlement source, cannot refund:',
      videoJobId,
    );
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
              original_transaction_id: job.spend_transaction_id,
            },
          });
          console.log(
            `Refunded ${job.credits_charged} credits to profile ${job.requester_profile_id}`,
          );
        }
        break;

      case 'free_grant':
        // Restore free tier reveal
        await supabase.rpc('restore_free_tier1_reveal', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(
          `Restored free Tier 1 reveal to profile ${job.requester_profile_id}`,
        );
        break;

      case 'subscription_allowance':
        // Restore subscription allowance
        await supabase.rpc('restore_subscription_allowance', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: videoJobId,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(
          `Restored subscription allowance to profile ${job.requester_profile_id}`,
        );
        break;

      default:
        console.warn(
          'Unknown entitlement source for refund:',
          job.entitlement_source,
        );
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
  providerVideoUrl: string,
  leaseToken: string,
  bucket = 'battle-videos',
  privateStoragePath?: string,
  expectedDurationSeconds?: number,
): Promise<{ path: string; durationSeconds: number | null }> {
  // Fetch video from provider URL
  const response = await fetch(providerVideoUrl, {
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch video from provider: ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const durationSeconds =
    expectedDurationSeconds == null
      ? null
      : readCinematicDurationSeconds(bytes);
  if (
    expectedDurationSeconds != null &&
    (durationSeconds == null ||
      Math.abs(durationSeconds - expectedDurationSeconds) > 0.5)
  ) {
    throw new VideoDurationMismatchError(
      'Downloaded cinematic duration mismatch',
    );
  }
  const videoBlob = new Blob([bytes], { type: 'video/mp4' });
  const storagePath =
    privateStoragePath ?? `videos/${battleId}/${videoJobId}.mp4`;

  await requireVideoJobLease(supabase, videoJobId, leaseToken);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, videoBlob, {
      contentType: 'video/mp4',
      // Stable path per job makes retries idempotent after partial failures.
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `Failed to upload video to storage: ${uploadError.message}`,
    );
  }

  return { path: storagePath, durationSeconds };
}

/**
 * Moderate video using moderate-video Edge Function
 */
async function moderateVideo(
  supabase: ReturnType<typeof createServiceClient>,
  videoId: string,
  battleId: string,
  providerModerationApproved?: boolean,
  providerModerationSource?: string,
  leaseToken?: string,
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
      apikey: serviceKey,
    },
    body: JSON.stringify({
      video_id: videoId,
      battle_id: battleId,
      lease_token: leaseToken,
      provider_moderation_approved: providerModerationApproved,
      provider_moderation_source: providerModerationSource,
    }),
  });

  if (response.status === 409) throw new VideoJobLeaseLostError('lease_lost');

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Moderate-video invocation failed:', errorText);
    throw new Error(`Moderate-video failed: ${response.status}`);
  }

  const result = await response.json();
  return { status: result.status, reason: result.reason };
}
