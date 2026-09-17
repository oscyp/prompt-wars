import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
  getSupabasePublishableKey,
  successResponse as ok,
} from '../_shared/utils.ts';
import { err } from '../_shared/character-creation.ts';
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
    const db = createServiceClient();
    if (body.action === 'dismiss' || body.action === 'complete') {
      const { data, error } = await db.rpc('update_tutorial', {
        p_profile_id: userId,
        p_battle_id: body.battle_id,
        p_hint: body.action === 'dismiss' ? body.hint : null,
        p_complete: body.action === 'complete',
      });
      if (error) return err('tutorial_unavailable', error.message, 409);
      return ok({ state: data });
    }
    if (body.action !== 'start' && body.action !== 'replay')
      return err('bad_request', 'invalid tutorial action', 400);
    const fighter = await db.rpc('create_starter_fighter', {
      p_profile_id: userId,
    });
    if (fighter.error) throw fighter.error;
    const prepared = await db.rpc('prepare_tutorial', {
      p_profile_id: userId,
      p_replay: body.action === 'replay',
    });
    if (prepared.error) throw prepared.error;
    if (prepared.data.battle_id) return ok({ state: prepared.data });
    // Use ordinary Bo3 bot matchmaking: ownership, rate limits and version gate
    // remain in the existing authenticated handler. Durable request survives crashes.
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/matchmaking`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: getSupabasePublishableKey(),
          Authorization: req.headers.get('Authorization')!,
        },
        body: JSON.stringify({
          character_id: fighter.data.id,
          mode: 'bot',
          request_id: prepared.data.request_id,
          client_contract_version: 2,
        }),
      },
    );
    const matched = await response.json();
    if (!response.ok || !matched.battle_id)
      return err(
        'practice_unavailable',
        'Practice could not start. Try again to resume.',
        503,
      );
    const saved = await db.rpc('update_tutorial', {
      p_profile_id: userId,
      p_battle_id: matched.battle_id,
      p_request_id: prepared.data.request_id,
    });
    if (saved.error) throw saved.error;
    return ok({ state: saved.data });
  } catch {
    return err(
      'tutorial_unavailable',
      'Could not load practice. Try again.',
      503,
    );
  }
});
