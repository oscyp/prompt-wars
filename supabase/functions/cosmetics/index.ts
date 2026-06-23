// Cosmetics Shop Edge Function
// Server-owned cosmetic catalog browse + credit purchase + equip + unlock sync.
// Cosmetics are STRICTLY cosmetic: they never touch scoring, matchmaking, or
// ratings. All ownership writes go through SECURITY DEFINER DB functions.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface CosmeticsRequest {
  action?: 'list' | 'purchase' | 'equip' | 'sync';
  cosmetic_slug?: string;
  cosmetic_type?: string;
  character_id?: string;
}

async function listCatalog(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const [{ data: catalog }, { data: owned }] = await Promise.all([
    supabase
      .from('cosmetics_catalog')
      .select(
        'id, slug, name, description, cosmetic_type, rarity, acquisition, price_credits, min_subscription_tier, unlock_rule, value, preview_asset_path, sort_order',
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('player_cosmetics')
      .select('cosmetic_id, acquired_via, acquired_at')
      .eq('profile_id', userId),
  ]);

  const ownedIds = new Set((owned ?? []).map((r) => r.cosmetic_id));

  const items = (catalog ?? []).map((c) => ({
    ...c,
    owned: ownedIds.has(c.id),
  }));

  return { items, owned_count: ownedIds.size };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const body: CosmeticsRequest = await req.json().catch(() => ({}));
    const action = body.action ?? 'list';
    const supabase = createServiceClient();

    if (action === 'purchase') {
      if (!body.cosmetic_slug) {
        return errorResponse('cosmetic_slug required');
      }
      const { data, error } = await supabase.rpc('purchase_cosmetic', {
        p_profile_id: userId,
        p_cosmetic_slug: body.cosmetic_slug,
      });
      if (error) {
        console.error('purchase_cosmetic error:', error);
        return errorResponse('Failed to purchase cosmetic', 500);
      }
      const result = data as { success?: boolean } | null;
      const catalog = await listCatalog(supabase, userId);
      return successResponse({ ...result, ...catalog });
    }

    if (action === 'equip') {
      if (!body.character_id || !body.cosmetic_type) {
        return errorResponse('character_id and cosmetic_type required');
      }
      const { data, error } = await supabase.rpc('equip_cosmetic', {
        p_profile_id: userId,
        p_character_id: body.character_id,
        p_cosmetic_type: body.cosmetic_type,
        p_cosmetic_slug: body.cosmetic_slug ?? null,
      });
      if (error) {
        console.error('equip_cosmetic error:', error);
        return errorResponse('Failed to equip cosmetic', 500);
      }
      return successResponse(data ?? { success: false });
    }

    if (action === 'sync') {
      const { data, error } = await supabase.rpc('sync_unlocked_cosmetics', {
        p_profile_id: userId,
      });
      if (error) {
        console.error('sync_unlocked_cosmetics error:', error);
        return errorResponse('Failed to sync cosmetics', 500);
      }
      const catalog = await listCatalog(supabase, userId);
      return successResponse({ success: true, granted: data ?? 0, ...catalog });
    }

    // action === 'list'
    const catalog = await listCatalog(supabase, userId);
    return successResponse({ success: true, ...catalog });
  } catch (error) {
    console.error('Cosmetics error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
