// Create Custom Signature Item Edge Function
// Accepts a user-authored signature item (text-only or with generated icon).
// - Text moderation, credit charge, optional icon generation
// - Rate limit: 3 custom items per UTC day (skipped for profiles flagged is_test_user).
// - Final moderation_status: approved if text passed; pending if image post-gen
//   moderation has not been wired yet.

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import { err, getEditPrice, ok } from '../_shared/character-creation.ts';
import {
  generateItemIcon,
  ImageProviderError,
  SafetyRefusedError,
} from '../_shared/image-provider.ts';
import { isTestUser } from '../_shared/test-user.ts';

const ITEM_CLASSES = ['tool', 'symbol', 'weaponized_mundane', 'relic', 'instrument'] as const;
type ItemClass = (typeof ITEM_CLASSES)[number];

interface CreateRequest {
  name: string;
  description?: string;
  item_class: ItemClass;
  prompt_fragment: string;
  with_image?: boolean;
}

const DAILY_LIMIT = 3;

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

  let body: CreateRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }

  if (!body.name || body.name.length > 60) {
    return err('bad_request', 'name required (<=60 chars)', 400);
  }
  if (!body.prompt_fragment || body.prompt_fragment.length > 200) {
    return err('bad_request', 'prompt_fragment required (<=200 chars)', 400);
  }
  if (!ITEM_CLASSES.includes(body.item_class)) {
    return err('bad_request', 'invalid item_class', 400);
  }
  if (body.description && body.description.length > 200) {
    return err('bad_request', 'description must be <=200 chars', 400);
  }

  const supabase = createServiceClient();

  // Rate limit: 3 per UTC day. Skipped for test users.
  const testUser = await isTestUser(supabase, userId);
  if (!testUser) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count: todayCount, error: countErr } = await supabase
      .from('signature_items')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId)
      .eq('kind', 'custom')
      .gte('created_at', since.toISOString());
    if (countErr) return err('server_error', countErr.message, 500);
    if ((todayCount ?? 0) >= DAILY_LIMIT) {
      return err('rate_limited', 'daily custom item limit reached', 429);
    }
  }

  // Moderate text.
  const moderator = new TextModerationProvider();
  // Concatenate fields so the moderator sees the full surface.
  const blob = [body.name, body.description ?? '', body.prompt_fragment]
    .join('\n')
    .padEnd(20, ' '); // pad to satisfy 20-char min in TextModerationProvider
  const modResult = await moderator.moderate(blob);
  if (modResult.status === 'rejected') {
    return err('moderation_rejected', modResult.reason ?? 'text rejected', 422);
  }

  const priceKey = body.with_image ? 'custom_item_image' : 'custom_item_text';
  const price = await getEditPrice(supabase, priceKey);
  if (!price) return err('server_error', 'price config missing', 500);

  // Charge credits.
  let walletTxId: string | null = null;
  if (price.credits > 0) {
    const spendKey = generateIdempotencyKey([
      'spend',
      priceKey,
      userId,
      crypto.randomUUID(),
    ]);
    const { data: txId, error: spendErr } = await supabase.rpc('spend_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: priceKey,
      p_idempotency_key: spendKey,
      p_battle_id: null,
      p_video_job_id: null,
      p_metadata: { item_name: body.name },
    });
    if (spendErr) {
      if (/Insufficient credits/i.test(spendErr.message ?? '')) {
        return err('insufficient_credits', spendErr.message, 402);
      }
      return err('server_error', spendErr.message, 500);
    }
    walletTxId = (txId as unknown as string) ?? null;
  }

  // Optionally generate icon.
  let imagePath: string | null = null;
  let moderationStatus: 'approved' | 'pending' = 'approved';

  if (body.with_image) {
    const seedBuf = new Uint32Array(1);
    crypto.getRandomValues(seedBuf);
    const seed = seedBuf[0];

    let icon;
    try {
      icon = await generateItemIcon({
        name: body.name,
        description: body.description ?? '',
        item_class: body.item_class,
        seed,
      });
    } catch (e) {
      // Refund and bail.
      if (walletTxId && price.credits > 0) {
        await supabase.rpc('grant_credits', {
          p_profile_id: userId,
          p_amount: price.credits,
          p_reason: `${priceKey}_refund:provider_error`,
          p_idempotency_key: `refund_${walletTxId}`,
          p_battle_id: null,
          p_purchase_id: null,
          p_metadata: { item_name: body.name },
        });
      }
      const code = e instanceof SafetyRefusedError
        ? 'moderation_rejected'
        : e instanceof ImageProviderError
          ? e.code
          : 'provider_error';
      return err(code, e instanceof Error ? e.message : 'provider failure', 502);
    }

    const itemId = crypto.randomUUID();
    const ext = icon.content_type === 'image/png'
      ? 'png'
      : icon.content_type === 'image/jpeg'
        ? 'jpg'
        : 'webp';
    imagePath = `${userId}/${itemId}.${ext}`;
    const uploadRes = await supabase.storage
      .from('signature-items-custom')
      .upload(imagePath, icon.image_bytes, {
        contentType: icon.content_type,
        upsert: false,
      });
    if (uploadRes.error) {
      if (walletTxId && price.credits > 0) {
        await supabase.rpc('grant_credits', {
          p_profile_id: userId,
          p_amount: price.credits,
          p_reason: `${priceKey}_refund:storage_error`,
          p_idempotency_key: `refund_${walletTxId}`,
          p_battle_id: null,
          p_purchase_id: null,
          p_metadata: { item_name: body.name },
        });
      }
      return err('storage_error', uploadRes.error.message, 500);
    }

    // Image post-gen moderation hook not wired in Phase 1 → mark pending.
    moderationStatus = 'pending';
  }

  const { data: item, error: insertErr } = await supabase
    .from('signature_items')
    .insert({
      profile_id: userId,
      kind: 'custom',
      item_class: body.item_class,
      name: body.name,
      description: body.description ?? null,
      prompt_fragment: body.prompt_fragment,
      image_path: imagePath,
      moderation_status: moderationStatus,
    })
    .select('id, name, item_class, prompt_fragment, image_path, moderation_status')
    .single();

  if (insertErr || !item) {
    return err('server_error', insertErr?.message ?? 'insert failed', 500);
  }

  return ok({
    item,
    credits_spent: price.credits,
    wallet_transaction_id: walletTxId,
  });
});
