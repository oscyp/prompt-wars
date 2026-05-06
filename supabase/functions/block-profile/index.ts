// Block Profile Edge Function
// Block another user (prevents matchmaking, hides from feed)

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface BlockProfileRequest {
  blocked_profile_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { blocked_profile_id }: BlockProfileRequest = await req.json();

    if (!blocked_profile_id) {
      return errorResponse('blocked_profile_id required');
    }

    if (blocked_profile_id === userId) {
      return errorResponse('Cannot block yourself', 400);
    }

    const supabase = createServiceClient();

    // Check if blocked profile exists
    const { data: blockedProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', blocked_profile_id)
      .single();

    if (profileError || !blockedProfile) {
      return errorResponse('Profile not found', 404);
    }

    // Insert block (idempotent)
    const { error: blockError } = await supabase.from('blocks').insert({
      blocker_profile_id: userId,
      blocked_profile_id,
    });

    if (blockError && blockError.code !== '23505') {
      // Ignore duplicate key error
      console.error('Failed to block profile:', blockError);
      return errorResponse('Failed to block profile', 500);
    }

    return successResponse({ message: 'Profile blocked successfully' });
  } catch (error) {
    console.error('Block profile error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
