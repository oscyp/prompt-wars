import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
  successResponse as ok,
} from '../_shared/utils.ts';
import { err } from '../_shared/character-creation.ts';
import { parseFunnelEvent } from '../_shared/tutorial.ts';
import { parseComposerEvent } from '../_shared/composer-events.ts';
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
    const body = await req.json();
    const composer = parseComposerEvent(body);
    const event = composer ?? parseFunnelEvent(body);
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
    if (composer) {
      const { data: round } = await db
        .from('battle_rounds')
        .select('id')
        .eq('battle_id', composer.battle_id)
        .eq('round_number', composer.round_number)
        .maybeSingle();
      if (!round) return err('bad_request', 'round not available', 400);
      const { error: savedError } = await db
        .from(composer.sequence_number === undefined ? 'composer_events' : 'composer_event_occurrences')
        .upsert(
          { ...composer, profile_id: userId },
          { onConflict: composer.sequence_number === undefined ? 'profile_id,battle_id,round_number,session_id,event' : 'profile_id,battle_id,round_number,session_id,event,sequence_number' },
        );
      return savedError
        ? err('unavailable', 'event unavailable', 503)
        : ok({ recorded: true });
    }
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
