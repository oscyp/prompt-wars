// List Signature Items Catalog Edge Function
// Returns active catalog items with public URLs for their icons, followed by
// the caller's own custom items. Custom items live in the same table with
// kind='custom' and no catalog_id, so the catalog join below can never reach
// them -- without the second query a freshly created (and paid for) item never
// appears in the picker.

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

  let userId: string;
  try {
    userId = await getAuthUserId(req);
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

  // The caller's own custom items, newest first. Rejected ones are withheld;
  // 'pending' ones are still shown -- the player paid for them and moderation
  // is asynchronous, so hiding them would look exactly like the bug this
  // query fixes.
  const { data: customRows, error: customError } = await supabase
    .from('signature_items')
    .select('id, name, description, item_class, prompt_fragment, image_path')
    .eq('kind', 'custom')
    .eq('profile_id', userId)
    .neq('moderation_status', 'rejected')
    .order('created_at', { ascending: false });

  if (customError) return err('server_error', customError.message, 500);

  // signature-items-custom is a PRIVATE bucket, unlike the catalog one, so
  // these need signed URLs rather than getPublicUrl.
  const customItems = await Promise.all(
    (customRows ?? []).map(async (row) => {
      let iconUrl: string | null = null;
      if (row.image_path) {
        const { data: signed } = await supabase.storage
          .from('signature-items-custom')
          .createSignedUrl(row.image_path, 60 * 60);
        iconUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        catalogId: null,
        slug: null,
        name: row.name,
        description: row.description ?? '',
        itemClass: row.item_class,
        archetypeAffinity: [],
        iconUrl,
        promptFragment: row.prompt_fragment,
        minSubscriptionTier: null,
        isCustom: true,
      };
    }),
  );

  return ok({ items: [...items, ...customItems] });
});
