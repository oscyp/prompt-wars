// First-Time-User Offer Edge Function
// Server-owned FTUO eligibility + lifecycle. The client renders whatever this
// returns and reports dismiss; purchase is fulfilled server-side via the
// RevenueCat webhook (fulfill_first_time_offer). Battle integrity never depends
// on purchase state.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface FtuoRequest {
  action?: 'get' | 'dismiss';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const body: FtuoRequest = await req.json().catch(() => ({}));
    const action = body.action ?? 'get';
    const supabase = createServiceClient();

    if (action === 'dismiss') {
      const { data, error } = await supabase.rpc('dismiss_first_time_offer', {
        p_profile_id: userId,
      });
      if (error) {
        console.error('dismiss_first_time_offer error:', error);
        return errorResponse('Failed to dismiss offer', 500);
      }
      return successResponse({ success: true, dismissed: data === true });
    }

    // action === 'get'
    const { data, error } = await supabase.rpc('get_first_time_offer', {
      p_profile_id: userId,
    });
    if (error) {
      console.error('get_first_time_offer error:', error);
      return errorResponse('Failed to load offer', 500);
    }

    return successResponse(data ?? { eligible: false, reason: 'unknown' });
  } catch (error) {
    console.error('First-time-offer error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
