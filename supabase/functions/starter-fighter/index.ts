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
  const { data, error } = await createServiceClient().rpc(
    'create_starter_fighter',
    { p_profile_id: userId },
  );
  return error
    ? err(
        'starter_unavailable',
        'Could not prepare your fighter. Try again.',
        503,
      )
    : ok({ character_id: data.id });
});
