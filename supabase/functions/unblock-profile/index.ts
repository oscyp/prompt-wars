// Unblock Profile Edge Function
// Remove a block on another user

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface UnblockProfileRequest {
  blocked_profile_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { blocked_profile_id }: UnblockProfileRequest = await req.json();

    if (!blocked_profile_id) {
      return errorResponse('blocked_profile_id required');
    }

    const supabase = createServiceClient();

    // Delete block
    const { error: unblockError } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_profile_id', userId)
      .eq('blocked_profile_id', blocked_profile_id);

    if (unblockError) {
      console.error('Failed to unblock profile:', unblockError);
      return errorResponse('Failed to unblock profile', 500);
    }

    return successResponse({ message: 'Profile unblocked successfully' });
  } catch (error) {
    console.error('Unblock profile error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
