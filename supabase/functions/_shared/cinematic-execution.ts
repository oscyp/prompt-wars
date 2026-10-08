import type { createServiceClient } from './utils.ts';
import type { VideoJobStatus } from './providers.ts';
import {
  VideoModerationProvider,
  type VideoModerationResult,
} from './moderation.ts';
import { CinematicPreparationError } from './cinematic-references.ts';

export const CINEMATIC_STAGE_TIMEOUT_SECONDS = 300;
export const CINEMATIC_TOTAL_TIMEOUT_SECONDS = 600;
export interface CinematicExecutionJob {
  duration_policy_version?: string | null;
  target_duration_seconds?: number | null;
  cinematic_profile?: string | null;
  execution_stage?: string | null;
  execution_started_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
}
export const isExtendedCinematic = (job: CinematicExecutionJob): boolean =>
  job.duration_policy_version === 'cinematics-v3' &&
  job.cinematic_profile === 'plus' &&
  job.target_duration_seconds === 20;

export function cinematicExecutionTimedOut(
  job: CinematicExecutionJob,
  now = Date.now(),
): boolean {
  const elapsed = (value?: string | null) =>
    value ? now - Date.parse(value) : 0;
  return (
    elapsed(job.execution_started_at) >
      CINEMATIC_TOTAL_TIMEOUT_SECONDS * 1000 ||
    elapsed(job.submitted_at ?? job.execution_started_at) >
      CINEMATIC_STAGE_TIMEOUT_SECONDS * 1000
  );
}

/** No video row is created: approved intermediate media must never be playable. */
export async function moderateCinematicBase(
  db: Pick<ReturnType<typeof createServiceClient>, 'from' | 'storage'>,
  jobId: string,
  battleId: string,
  storagePath: string,
  status: VideoJobStatus,
): Promise<VideoModerationResult> {
  let result: VideoModerationResult;
  if (
    status.moderationProvider === 'xai_generation' &&
    typeof status.moderationApproved === 'boolean'
  ) {
    result = {
      status: status.moderationApproved ? 'approved' : 'rejected',
      provider: 'xai_generation',
      confidence: 1,
      reason: 'Cinematic base provider safety verdict',
    };
  } else {
    const { data, error } = await db.storage
      .from('cinematic-work')
      .createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl)
      throw new CinematicPreparationError(
        'Base moderation signing unavailable',
      );
    result = await new VideoModerationProvider().moderate(
      data.signedUrl,
      jobId,
    );
  }
  const { error } = await db.from('moderation_events').insert({
    target_type: 'video',
    target_id: jobId,
    action: result.status,
    reason: result.reason ?? null,
    automated: true,
    provider: result.provider ?? null,
    provider_request_id: result.providerRequestId ?? null,
    confidence_score: result.confidence ?? null,
    flagged_categories: result.flaggedCategories ?? [],
    moderator_notes: JSON.stringify({
      video_job_id: jobId,
      battle_id: battleId,
      stage: 'cinematic_base',
      storage_path: storagePath,
    }),
  });
  if (error)
    throw new CinematicPreparationError('Base moderation audit unavailable');
  return result;
}
