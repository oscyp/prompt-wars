import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  hasSupabaseSecretAuthorization,
} from '../_shared/utils.ts';
import { processIndependentAppeal } from '../_shared/appeals-service.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (!hasSupabaseSecretAuthorization(req.headers.get('Authorization')))
    return errorResponse('Service role required', 403);
  try {
    const { appeal_id, batch_size = 10 } = await req.json();
    const db = createServiceClient();
    let ids: string[] = appeal_id ? [appeal_id] : [];
    if (!appeal_id) {
      const { data, error } = await db.rpc('list_due_independent_appeals', {
        p_limit: Math.max(1, Math.min(10, Number(batch_size) || 10)),
      });
      if (error) throw error;
      ids = (data ?? []).map((a: { id: string }) => a.id);
    }
    const results = [];
    for (const id of ids)
      results.push({
        appeal_id: id,
        ...(await processIndependentAppeal(db, id)),
      });
    return successResponse({ processed_count: results.length, results });
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Appeal processing failed',
      500,
    );
  }
});
