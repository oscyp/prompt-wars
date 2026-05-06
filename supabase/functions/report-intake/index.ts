// Report Intake Edge Function
// Validates authenticated user, inserts report, applies block if requested
// Records SLA due time (24h), idempotent on reporter + target

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
  generateIdempotencyKey,
} from '../_shared/utils.ts';

interface ReportIntakeRequest {
  reported_type: 'battle' | 'video' | 'profile';
  reported_id: string;
  reported_profile_id?: string;
  reason: 'inappropriate' | 'harassment' | 'cheating' | 'spam';
  description?: string;
  apply_block?: boolean; // Also block the reported user
}

interface ReportIntakeResponse {
  report_id: string;
  blocked: boolean;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const {
      reported_type,
      reported_id,
      reported_profile_id,
      reason,
      description,
      apply_block = false,
    }: ReportIntakeRequest = await req.json();

    if (!reported_type || !reported_id || !reason) {
      return errorResponse('reported_type, reported_id, and reason required');
    }

    const supabase = createServiceClient();

    // Get reporter's profile_id from auth.users
    const { data: reporterProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (profileError || !reporterProfile) {
      return errorResponse('Reporter profile not found', 404);
    }

    // Idempotency: check if this reporter already reported this target
    const idempotencyKey = generateIdempotencyKey([
      reporterProfile.id,
      reported_type,
      reported_id,
    ]);

    const { data: existingReport } = await supabase
      .from('reports')
      .select('id, status')
      .eq('reporter_profile_id', reporterProfile.id)
      .eq('reported_type', reported_type)
      .eq('reported_id', reported_id)
      .single();

    if (existingReport) {
      return successResponse({
        report_id: existingReport.id,
        blocked: false,
        message: 'Report already submitted',
      });
    }

    // Rate limit: max 5 reports per 24h per user
    const { count: recentReportsCount } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_profile_id', reporterProfile.id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((recentReportsCount || 0) >= 5) {
      return errorResponse('Report rate limit exceeded (max 5 per 24h)', 429);
    }

    // Determine reported_profile_id if not provided
    let targetProfileId = reported_profile_id;
    
    if (!targetProfileId) {
      if (reported_type === 'profile') {
        targetProfileId = reported_id;
      } else if (reported_type === 'battle') {
        // Fetch battle to find opponent
        const { data: battle } = await supabase
          .from('battles')
          .select('player_one_id, player_two_id')
          .eq('id', reported_id)
          .single();

        if (battle) {
          targetProfileId =
            battle.player_one_id === reporterProfile.id
              ? battle.player_two_id
              : battle.player_one_id;
        }
      } else if (reported_type === 'video') {
        // Fetch video -> battle -> opponent
        const { data: video } = await supabase
          .from('videos')
          .select('battle_id')
          .eq('id', reported_id)
          .single();

        if (video) {
          const { data: battle } = await supabase
            .from('battles')
            .select('player_one_id, player_two_id')
            .eq('id', video.battle_id)
            .single();

          if (battle) {
            targetProfileId =
              battle.player_one_id === reporterProfile.id
                ? battle.player_two_id
                : battle.player_one_id;
          }
        }
      }
    }

    // Insert report with SLA due_at = now + 24h
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        reporter_profile_id: reporterProfile.id,
        reported_type,
        reported_id,
        reported_profile_id: targetProfileId,
        reason,
        description: description || null,
        status: 'pending',
        due_at: dueAt,
      })
      .select('id')
      .single();

    if (reportError) {
      console.error('Failed to insert report:', reportError);
      return errorResponse('Failed to submit report', 500);
    }

    // Update abuse signals for reporter (track report count)
    const { error: abuseError } = await supabase.rpc('increment_abuse_counter', {
      p_profile_id: reporterProfile.id,
      p_counter: 'reports_submitted_24h',
    });

    if (abuseError) {
      console.error('Failed to update abuse signals:', abuseError);
    }

    // Apply block if requested and target profile identified
    let blocked = false;
    if (apply_block && targetProfileId) {
      const { error: blockError } = await supabase.from('blocks').insert({
        blocker_profile_id: reporterProfile.id,
        blocked_profile_id: targetProfileId,
      });

      if (!blockError) {
        blocked = true;
      } else if (blockError.code !== '23505') {
        // Ignore duplicate key error (already blocked)
        console.error('Failed to apply block:', blockError);
      } else {
        blocked = true; // Already blocked
      }
    }

    const response: ReportIntakeResponse = {
      report_id: report.id,
      blocked,
      message: 'Report submitted successfully',
    };

    return successResponse(response);
  } catch (error) {
    console.error('Report intake error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
