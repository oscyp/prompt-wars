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
  const { data: catalogRows, error: catalogError } = await supabase
    .from('signature_items_catalog')
    .select('id, slug, name, description, item_class, archetype_affinity, image_path, prompt_fragment, min_subscription_tier')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (catalogError) return err('server_error', catalogError.message, 500);

  const catalogs = catalogRows ?? [];
  if (catalogs.length === 0) return ok({ items: [] });

  const catalogIds = catalogs.map((row) => row.id);
  const { data: itemRows, error: itemError } = await supabase
    .from('signature_items')
    .select('id, catalog_id')
    .eq('kind', 'catalog')
    .in('catalog_id', catalogIds);

  if (itemError) return err('server_error', itemError.message, 500);

  const itemIdByCatalogId = new Map(
    (itemRows ?? []).map((row) => [row.catalog_id, row.id]),
  );
  if (itemIdByCatalogId.size !== catalogs.length) {
    return err(
      'server_error',
      'signature item catalog instances missing; run migrations',
      500,
    );
  }

  const items = catalogs.map((row) => {
    let iconUrl: string | null = null;
    if (row.image_path) {
      const { data: pub } = supabase.storage
        .from('signature-items-catalog')
        .getPublicUrl(row.image_path);
      iconUrl = pub?.publicUrl ?? null;
    }
    return {
      id: itemIdByCatalogId.get(row.id),
      catalogId: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? '',
      itemClass: row.item_class,
      archetypeAffinity: row.archetype_affinity ?? [],
      iconUrl,
      promptFragment: row.prompt_fragment,
      minSubscriptionTier: row.min_subscription_tier ?? null,
    };
  });

  return ok({ items });
});
