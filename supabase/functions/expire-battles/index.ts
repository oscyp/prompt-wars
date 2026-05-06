// Expire Battles Cron Function
// Runs periodically to mark timed-out battles as expired

import { createServiceClient, corsHeaders, successResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabase = createServiceClient();
    
    // Call expire function
    const { data: expiredCount, error } = await supabase.rpc('expire_timed_out_battles');
    
    if (error) {
      console.error('Expire battles error:', error);
      return successResponse({
        success: false,
        error: error.message,
      }, 500);
    }
    
    console.log(`Expired ${expiredCount} battles`);
    
    return successResponse({
      success: true,
      expired_count: expiredCount,
    });
    
  } catch (error) {
    console.error('Expire battles error:', error);
    return successResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Internal error',
    }, 500);
  }
});
