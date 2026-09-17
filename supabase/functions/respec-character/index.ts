import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
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
    const { data, error } = await createServiceClient().rpc(
      'apply_character_respec',
      {
        p_profile_id: userId,
        p_character_id: body.character_id,
        p_request_id: body.request_id,
        p_stats: body.stats,
      },
    );
    return error
      ? err('respec_unavailable', error.message, 409)
      : ok({ stats: data });
  } catch {
    return err('bad_request', 'invalid request', 400);
  }
});
