import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
  getSupabaseSecretKey,
} from '../_shared/utils.ts';
import {
  originalModelsFor,
  reviewerAvailability,
} from '../_shared/appeals-service.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getAuthUserId(req);
    const { battle_id, action = 'submit' } = await req.json();
    if (!battle_id) return errorResponse('battle_id required');
    const db = createServiceClient();
    const { data: b, error: be } = await db
      .from('battles')
      .select('player_one_id,player_two_id')
      .eq('id', battle_id)
      .single();
    if (be || !b || ![b.player_one_id, b.player_two_id].includes(userId))
      return errorResponse('Battle unavailable', 403);
    const { data: existing, error: ae } = await db
      .from('appeals')
      .select('id,review_status,last_error,review_metadata,resolved_at')
      .eq('battle_id', battle_id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (ae) throw ae;
    if (existing)
      return successResponse({
        appeal: existing,
        available: false,
        reason: null,
      });
    const availability = await reviewerAvailability(
      db,
      await originalModelsFor(db, battle_id),
    );
    const { data: eligible, error: ee } = await db.rpc('can_appeal', {
      p_profile_id: userId,
      p_battle_id: battle_id,
    });
    if (ee) throw ee;
    const available = availability.available && eligible === true;
    const reason =
      availability.reason ??
      (eligible ? null : 'Appeal allowance used or battle not eligible.');
    if (action === 'status')
      return successResponse({ appeal: null, available, reason });
    if (!available) return errorResponse(reason ?? 'Appeal unavailable', 409);
    const { data: id, error } = await db.rpc('submit_independent_appeal', {
      p_battle_id: battle_id,
      p_profile_id: userId,
    });
    if (error) throw error;
    const key = getSupabaseSecretKey();
    const task = fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/resolve-appeal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          apikey: key,
        },
        body: JSON.stringify({ appeal_id: id }),
      },
    )
      .then((r) => {
        if (!r.ok)
          console.error(
            'Appeal worker will retry on scheduled sweep',
            r.status,
          );
      })
      .catch((e) => console.error('Appeal worker scheduled retry', e));
    const runtime = (
      globalThis as unknown as {
        EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
      }
    ).EdgeRuntime;
    if (runtime) runtime.waitUntil(task);
    else await task;
    return successResponse({
      appeal: { id, review_status: 'pending' },
      available: false,
      reason: null,
    });
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Appeal request failed',
      500,
    );
  }
});
