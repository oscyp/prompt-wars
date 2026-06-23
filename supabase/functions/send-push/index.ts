// Send Push Edge Function
//
// Service-role only dispatcher. Existing battle/video flows deliver pushes
// in-process via _shared/push.ts; this function exposes the same delivery to
// scheduled jobs (daily quest, season-ending) and manual/admin sends.
//
// Auth: requires a Supabase service-role bearer token. Never call from a client.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  hasSupabaseSecretAuthorization,
} from '../_shared/utils.ts';
import { deliverPushToMany, PushCategory } from '../_shared/push.ts';

interface SendPushRequest {
  profile_id?: string;
  profile_ids?: string[];
  category: PushCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!hasSupabaseSecretAuthorization(req.headers.get('Authorization'))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const payload: SendPushRequest = await req.json();
    const { profile_id, profile_ids, category, title, body, data } = payload;

    if (!category || !title || !body) {
      return errorResponse('category, title, and body are required');
    }

    const recipients = profile_ids ?? (profile_id ? [profile_id] : []);
    if (recipients.length === 0) {
      return errorResponse('profile_id or profile_ids required');
    }

    const supabase = createServiceClient();
    await deliverPushToMany(supabase, recipients, { category, title, body, data });

    return successResponse({ success: true, recipients: recipients.length });
  } catch (error) {
    console.error('send-push error:', error);
    return errorResponse('Failed to send push', 500);
  }
});
