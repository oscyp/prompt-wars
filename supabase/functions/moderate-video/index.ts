import { VIDEO_LEASE_SECONDS } from '../_shared/video-constants.ts';
// Moderate Video Edge Function
// Post-generation video moderation
// Marks videos approved/rejected/flagged, keeps blurred preview until approved

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import {
  VideoModerationProvider,
  type VideoModerationResult,
} from '../_shared/moderation.ts';
import { ModerationStatus } from '../_shared/types.ts';

interface ModerateVideoRequest {
  video_id: string;
  lease_token: string;
  battle_id: string;
  provider_moderation_approved?: boolean;
  provider_moderation_source?: string;
}

interface ModerateVideoResponse {
  status: ModerationStatus;
  reason?: string;
  moderation_event_id: string;
  should_refund: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Service-role only (called by video generation pipeline, not client)
    const authHeader = req.headers.get('Authorization');

    if (
      !hasSupabaseSecretAuthorization(authHeader, req.headers.get('apikey'))
    ) {
      return errorResponse('Service role required', 403);
    }

    const {
      video_id,
      battle_id,
      lease_token,
      provider_moderation_approved,
      provider_moderation_source,
    }: ModerateVideoRequest = await req.json();

    if (!video_id || !battle_id || !lease_token) {
      return errorResponse('video_id, battle_id and lease_token required');
    }

    const supabase = createServiceClient();

    // Fetch video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('storage_path, battle_id, moderation_status, video_job_id')
      .eq('id', video_id)
      .single();

    if (videoError || !video) {
      return errorResponse('Video not found', 404);
    }

    if (video.battle_id !== battle_id)
      return errorResponse('Video does not belong to battle', 400);

    if (video.moderation_status !== 'pending') {
      return errorResponse('Video already moderated', 400);
    }

    if (!video.video_job_id) return errorResponse('Video job required', 400);
    const hasCurrentLease = async () => {
      const { data, error } = await supabase.rpc('renew_video_job_lease', {
        p_job_id: video.video_job_id,
        p_token: lease_token,
        p_lease_seconds: VIDEO_LEASE_SECONDS,
      });
      return !error && data === true;
    };
    if (!(await hasCurrentLease()))
      return errorResponse('Video job lease lost', 409);

    let result: VideoModerationResult;
    if (
      provider_moderation_source === 'xai_generation' &&
      typeof provider_moderation_approved === 'boolean'
    ) {
      // xAI returns `respect_moderation` only after generation finishes. Treat
      // that server-to-server verdict as the post-gen moderation result and
      // retain it in the same auditable event/status fields as other providers.
      result = {
        status: provider_moderation_approved ? 'approved' : 'rejected',
        reason: provider_moderation_approved
          ? 'Passed xAI post-generation moderation'
          : 'Rejected by xAI post-generation moderation',
        confidence: 1,
        provider: 'xai_generation',
      };
    } else {
      // Get a signed URL for a separately configured moderation provider.
      const { data: signedUrlData } = await supabase.storage
        .from('battle-videos')
        .createSignedUrl(video.storage_path, 3600);

      if (!signedUrlData?.signedUrl) {
        return errorResponse(
          'Failed to generate video URL for moderation',
          500,
        );
      }

      const moderator = new VideoModerationProvider();
      result = await moderator.moderate(signedUrlData.signedUrl, video_id);
    }

    // Record moderation event
    const { data: moderationEvent, error: eventError } = await supabase
      .from('moderation_events')
      .insert({
        target_type: 'video',
        target_id: video_id,
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
      return errorResponse('Failed to record moderation audit', 500);
    }

    // Match the worker's fresh prewrite check. The lease check and video update
    // are separate requests; a future DB finalization RPC can make them atomic.
    if (!(await hasCurrentLease()))
      return errorResponse('Video job lease lost', 409);

    // Update video moderation status
    const { error: updateError } = await supabase
      .from('videos')
      .update({
        moderation_status: result.status,
        moderation_reason: result.reason,
        moderated_at: new Date().toISOString(),
        moderation_provider: result.provider,
        moderation_confidence: result.confidence,
      })
      .eq('id', video_id)
      .eq('video_job_id', video.video_job_id)
      .eq('moderation_status', 'pending');

    if (updateError) {
      console.error('Failed to update video moderation_status:', updateError);
      return errorResponse('Failed to update video', 500);
    }

    // If rejected, trigger source-aware refund
    const shouldRefund = result.status === 'rejected';

    // process-video-job is the sole funding finalizer. Its owned lease and
    // reservation-aware reconciliation prevent a second credit/grant refund.

    const response: ModerateVideoResponse = {
      status: result.status,
      reason: result.reason,
      moderation_event_id: moderationEvent?.id || '',
      should_refund: shouldRefund,
    };

    return successResponse(response);
  } catch (error) {
    console.error('Moderate video error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
