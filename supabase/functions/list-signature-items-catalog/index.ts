// List Signature Items Catalog Edge Function
// Returns active catalog items with public URLs for their icons.

import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from '../_shared/utils.ts';
import { err, ok } from '../_shared/character-creation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await getAuthUserId(req);
  } catch {
    return err('unauthorized', 'authentication required', 401);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('signature_items_catalog')
    .select('id, slug, name, description, item_class, archetype_affinity, image_path, prompt_fragment, min_subscription_tier')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) return err('server_error', error.message, 500);

  const items = (data ?? []).map((row) => {
    let icon_url: string | null = null;
    if (row.image_path) {
      const { data: pub } = supabase.storage
        .from('signature-items-catalog')
        .getPublicUrl(row.image_path);
      icon_url = pub?.publicUrl ?? null;
    }
    return { ...row, icon_url };
  });

  return ok({ items });
});
