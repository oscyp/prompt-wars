import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
  successResponse as ok,
} from '../_shared/utils.ts';
import { err } from '../_shared/character-creation.ts';
import { parseFunnelEvent } from '../_shared/tutorial.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  let userId: string;
  try {
    userId = await getAuthUserId(req);
  } catch {
    return err('unauthorized', 'authentication required', 401);
  }
  try {
    const event = parseFunnelEvent(await req.json());
    if (!event?.battle_id) return err('bad_request', 'invalid event', 400);
    const db = createServiceClient();
    const { data: battle, error } = await db
      .from('battles')
      .select('player_one_id,player_two_id')
      .eq('id', event.battle_id)
      .maybeSingle();
    if (
      error ||
      !battle ||
      (battle.player_one_id !== userId && battle.player_two_id !== userId)
    )
      return err('forbidden', 'battle not available', 403);
    const saved = await db
      .from('funnel_events')
      .upsert(
        { ...event, profile_id: userId },
        { onConflict: 'profile_id,event,battle_id', ignoreDuplicates: true },
      );
    return saved.error
      ? err('unavailable', 'event unavailable', 503)
      : ok({ recorded: true });
  } catch {
    return err('bad_request', 'invalid request', 400);
  }
});
