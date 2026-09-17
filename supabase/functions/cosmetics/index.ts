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
import {
  availableToClient,
  catalogFromReads,
  contractVersion,
  equipPolicy,
  purchaseResponse,
} from './policy.ts';

interface CosmeticsRequest {
  action?: 'list' | 'purchase' | 'equip' | 'sync';
  cosmetic_slug?: string;
  cosmetic_type?: string;
  character_id?: string;
  client_contract_version?: number;
}

async function listCatalog(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  version: number,
) {
  const [catalog, owned] = await Promise.all([
    supabase
      .from('cosmetics_catalog')
      .select(
        'id, slug, name, description, cosmetic_type, rarity, acquisition, price_credits, min_subscription_tier, unlock_rule, value, preview_asset_path, sort_order, min_client_contract_version',
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('player_cosmetics')
      .select('cosmetic_id, acquired_via, acquired_at')
      .eq('profile_id', userId),
  ]);

  return catalogFromReads(catalog, owned, version);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const body: CosmeticsRequest = await req.json().catch(() => ({}));
    const action = body.action ?? 'list';
    const version = contractVersion(body.client_contract_version);
    const supabase = createServiceClient();

    if (action === 'purchase') {
      if (!body.cosmetic_slug) {
        return errorResponse('cosmetic_slug required');
      }

      const { data: target, error: targetError } = await supabase
        .from('cosmetics_catalog')
        .select('cosmetic_type, min_client_contract_version')
        .eq('slug', body.cosmetic_slug)
        .eq('is_active', true)
        .maybeSingle();
      if (targetError)
        return errorResponse('Failed to read cosmetic catalog', 500);
      if (!target) return errorResponse('Cosmetic not found', 404);
      if (!availableToClient(target, version))
        return errorResponse('That cosmetic requires a supported client.', 409);

      const { data, error } = await supabase.rpc('purchase_cosmetic', {
        p_profile_id: userId,
        p_cosmetic_slug: body.cosmetic_slug,
        p_client_contract_version: version,
      });
      if (error) {
        console.error('purchase_cosmetic error:', error);
        return errorResponse('Failed to purchase cosmetic', 500);
      }
      return successResponse(
        await purchaseResponse(data, body.cosmetic_slug, () =>
          listCatalog(supabase, userId, version),
        ),
      );
    }

    if (action === 'equip') {
      if (!body.character_id || !body.cosmetic_type) {
        return errorResponse('character_id and cosmetic_type required');
      }
      if (!equipPolicy(body.cosmetic_type))
        return errorResponse(
          'That cosmetic slot cannot be equipped in Shop.',
          409,
        );
      const { data, error } = await supabase.rpc('equip_cosmetic', {
        p_profile_id: userId,
        p_character_id: body.character_id,
        p_cosmetic_type: body.cosmetic_type,
        p_cosmetic_slug: body.cosmetic_slug ?? null,
        p_client_contract_version: version,
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
      const catalog = await listCatalog(supabase, userId, version);
      return successResponse({ success: true, granted: data ?? 0, ...catalog });
    }

    // action === 'list'
    const catalog = await listCatalog(supabase, userId, version);
    return successResponse({ success: true, ...catalog });
  } catch (error) {
    console.error('Cosmetics error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
