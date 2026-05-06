// Appeal Battle Edge Function
// Allows player to appeal a ranked loss (1/day cap)

import { createServiceClient, corsHeaders, errorResponse, successResponse, getAuthUserId } from '../_shared/utils.ts';

interface AppealRequest {
  battle_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const userId = await getAuthUserId(req);
    const { battle_id }: AppealRequest = await req.json();
    
    if (!battle_id) {
      return errorResponse('battle_id required');
    }
    
    const supabase = createServiceClient();
    
    // Check eligibility
    const { data: canAppeal, error: eligibilityError } = await supabase.rpc('can_appeal', {
      p_profile_id: userId,
      p_battle_id: battle_id,
    });
    
    if (eligibilityError) {
      console.error('Eligibility check error:', eligibilityError);
      return errorResponse('Failed to check eligibility', 500);
    }
    
    if (!canAppeal) {
      return errorResponse('Appeal not eligible (daily cap or battle constraints)', 403);
    }
    
    // Submit appeal
    const { data: appealId, error: appealError } = await supabase.rpc('submit_appeal', {
      p_battle_id: battle_id,
      p_profile_id: userId,
    });
    
    if (appealError) {
      console.error('Submit appeal error:', appealError);
      return errorResponse(appealError.message || 'Failed to submit appeal', 400);
    }
    
    return successResponse({
      appeal_id: appealId,
      status: 'pending',
      message: 'Appeal submitted. Independent judge review in progress.',
    });
    
  } catch (error) {
    console.error('Appeal battle error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
