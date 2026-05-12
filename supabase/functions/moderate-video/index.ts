// Moderate Video Edge Function
// Post-generation video moderation
// Marks videos approved/rejected/flagged, keeps blurred preview until approved

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import { VideoModerationProvider } from '../_shared/moderation.ts';
import { ModerationStatus } from '../_shared/types.ts';

interface ModerateVideoRequest {
  video_id: string;
  battle_id: string;
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
    
    if (!hasSupabaseSecretAuthorization(authHeader)) {
      return errorResponse('Service role required', 403);
    }

    const { video_id, battle_id }: ModerateVideoRequest = await req.json();

    if (!video_id || !battle_id) {
      return errorResponse('video_id and battle_id required');
    }

    const supabase = createServiceClient();

    // Fetch video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('storage_path, battle_id, moderation_status')
      .eq('id', video_id)
      .single();

    if (videoError || !video) {
      return errorResponse('Video not found', 404);
    }

    if (video.moderation_status !== 'pending') {
      return errorResponse('Video already moderated', 400);
    }

    // Get signed URL for moderation provider (use correct bucket: battle-videos)
    const { data: signedUrlData } = await supabase.storage
      .from('battle-videos')
      .createSignedUrl(video.storage_path, 3600); // 1 hour

    if (!signedUrlData?.signedUrl) {
      return errorResponse('Failed to generate video URL for moderation', 500);
    }

    // Moderate the video
    const moderator = new VideoModerationProvider();
    const result = await moderator.moderate(signedUrlData.signedUrl, video_id);

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
    }

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
      .eq('id', video_id);

    if (updateError) {
      console.error('Failed to update video moderation_status:', updateError);
      return errorResponse('Failed to update video', 500);
    }

    // If rejected, trigger source-aware refund
    const shouldRefund = result.status === 'rejected';
    
    if (shouldRefund) {
      // Fetch video_job to refund based on entitlement source
      // Use video_job_id from videos table, not battle_id query
      const { data: video } = await supabase
        .from('videos')
        .select('video_job_id')
        .eq('id', video_id)
        .single();
      
      if (video?.video_job_id) {
        const { data: videoJob } = await supabase
          .from('video_jobs')
          .select('id, requester_profile_id, entitlement_source, credits_charged, spend_transaction_id, refunded')
          .eq('id', video.video_job_id)
          .single();

        if (videoJob && !videoJob.refunded) {
          // Use source-aware refund logic
          await refundVideoJob(supabase, videoJob);
        }
      }
    }

    const response: ModerateVideoResponse = {
      status: result.status,
      reason: result.reason,
      moderation_event_id: moderationEvent?.id || '',
      should_refund: shouldRefund,
    };

    return successResponse(response);
  } catch (error) {
    console.error('Moderate video error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});

/**
 * Refund video job based on entitlement source
 * Handles credits, subscription_allowance, and free_grant sources
 */
async function refundVideoJob(
  supabase: ReturnType<typeof createServiceClient>,
  job: {
    id: string;
    requester_profile_id: string | null;
    entitlement_source: string | null;
    credits_charged: number | null;
    spend_transaction_id: string | null;
    refunded: boolean;
  }
): Promise<void> {
  if (job.refunded) {
    console.log('Video job already refunded:', job.id);
    return;
  }
  
  if (!job.requester_profile_id || !job.entitlement_source) {
    console.warn('Video job missing requester or entitlement source, cannot refund:', job.id);
    // Mark as refunded to prevent retry loops
    await supabase
      .from('video_jobs')
      .update({ refunded: true })
      .eq('id', job.id);
    return;
  }
  
  const refundIdempotencyKey = `refund-video-${job.id}`;
  
  try {
    switch (job.entitlement_source) {
      case 'credits':
        // Refund credits using grant_credits RPC
        if (job.credits_charged && job.credits_charged > 0) {
          await supabase.rpc('grant_credits', {
            p_profile_id: job.requester_profile_id,
            p_amount: job.credits_charged,
            p_reason: 'video_moderation_refund',
            p_idempotency_key: refundIdempotencyKey,
            p_battle_id: null,
            p_purchase_id: null,
            p_metadata: { 
              video_job_id: job.id,
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
          p_video_job_id: job.id,
          p_idempotency_key: refundIdempotencyKey,
        });
        console.log(`Restored free Tier 1 reveal to profile ${job.requester_profile_id}`);
        break;
      
      case 'subscription_allowance':
        // Restore subscription allowance
        await supabase.rpc('restore_subscription_allowance', {
          p_profile_id: job.requester_profile_id,
          p_video_job_id: job.id,
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
      .eq('id', job.id);
      
  } catch (error) {
    console.error('Refund error for video job:', job.id, error);
    // Don't throw - we'll retry on next moderation invocation
  }
}
