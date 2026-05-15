// Regenerate Portrait Edge Function
// Charges credits, reuses the existing portrait_seed, calls provider, refunds
// on failure or moderation block. Idempotent via Idempotency-Key header.

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import { err, getEditPrice, ok } from '../_shared/character-creation.ts';
import { isTestUser } from '../_shared/test-user.ts';
import {
  generateCharacterPortrait,
  ImageProviderError,
  SafetyRefusedError,
} from '../_shared/image-provider.ts';
import type {
  Archetype,
  ArtStyle,
  PortraitTraits,
} from '../_shared/portrait-prompt-resolver.ts';
import { ART_STYLE_KEYS } from '../_shared/portrait-prompt-resolver.ts';

interface RegenerateRequest {
  character_id: string;
  portrait_prompt_raw?: string; // if provided and differs, uses 'new_portrait' price
  art_style?: ArtStyle; // if provided and differs, uses 'new_portrait' price
}

const PORTRAIT_HISTORY_LIMIT = 3;

interface PortraitHistoryEntry {
  portrait_id: string;
  created_at: string;
}

function buildPortraitHistory(
  existing: unknown,
  priorPortraitId: string | null,
): PortraitHistoryEntry[] {
  if (!priorPortraitId) return Array.isArray(existing) ? (existing as PortraitHistoryEntry[]) : [];
  const list = Array.isArray(existing) ? (existing as PortraitHistoryEntry[]) : [];
  const filtered = list.filter((e) => e?.portrait_id !== priorPortraitId);
  const next: PortraitHistoryEntry[] = [
    { portrait_id: priorPortraitId, created_at: new Date().toISOString() },
    ...filtered,
  ];
  return next.slice(0, PORTRAIT_HISTORY_LIMIT);
}

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

  let body: RegenerateRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }
  if (!body.character_id) return err('bad_request', 'character_id required', 400);
  if (body.portrait_prompt_raw && body.portrait_prompt_raw.length > 200) {
    return err('bad_request', 'portrait_prompt_raw must be <= 200 chars', 400);
  }
  if (body.art_style && !ART_STYLE_KEYS.includes(body.art_style)) {
    return err('bad_request', 'invalid art_style', 400);
  }

  const headerKey = req.headers.get('Idempotency-Key')?.trim();
  const supabase = createServiceClient();

  // Load character; verify ownership and that a seed exists.
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, profile_id, archetype, signature_color, vibe, silhouette, era, expression, palette_key, signature_item_id, portrait_seed, portrait_prompt_raw, portrait_prompt_resolved, portrait_id, art_style, portrait_history',
    )
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  if (character.portrait_seed === null) {
    return err('conflict', 'character has no portrait yet; use generate-portrait', 409);
  }

  const newPrompt = body.portrait_prompt_raw;
  const promptChanged =
    newPrompt !== undefined && newPrompt !== character.portrait_prompt_raw;
  const currentArtStyle =
    ((character as { art_style?: ArtStyle }).art_style ?? 'painterly') as ArtStyle;
  const newArtStyle = (body.art_style as ArtStyle | undefined) ?? currentArtStyle;
  const styleChanged = newArtStyle !== currentArtStyle;
  const priceKey = (promptChanged || styleChanged) ? 'new_portrait' : 'regenerate_portrait';
  const price = await getEditPrice(supabase, priceKey);
  if (!price) return err('server_error', 'price config missing', 500);

  // Idempotency: if we've already recorded a character_edits row for this key,
  // return the current portrait.
  const idempotencyKey = headerKey
    ? generateIdempotencyKey(['regenerate', userId, character.id, headerKey])
    : null;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('character_edits')
      .select('id, after')
      .eq('profile_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return ok({ idempotent: true, edit_id: existing.id, after: existing.after });
    }
  }

  // Reject if there is an active battle for this character (skipped for test users).
  const testUser = await isTestUser(supabase, userId);
  if (!testUser) {
    const { data: activeBattles } = await supabase
      .from('battles')
      .select('id, status')
      .or(
        `player_one_character_id.eq.${character.id},player_two_character_id.eq.${character.id}`,
      )
      .not(
        'status',
        'in',
        '(completed,expired,canceled,moderation_failed,generation_failed)',
      )
      .limit(1);
    if (activeBattles && activeBattles.length > 0) {
      return err('battle_locked', 'character is in an active battle', 409);
    }
  }

  const promptRaw = newPrompt ?? character.portrait_prompt_raw ?? '';

  // Pre-gen text moderation.
  if (promptRaw.trim().length > 0) {
    const moderator = new TextModerationProvider();
    const modResult = await moderator.moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err('moderation_rejected', modResult.reason ?? 'prompt rejected', 422);
    }
  }

  // Charge credits up front; refund on failure.
  let walletTxId: string | null = null;
  if (price.credits > 0) {
    const spendKey = idempotencyKey
      ? `spend_${idempotencyKey}`
      : generateIdempotencyKey(['spend', priceKey, character.id, crypto.randomUUID()]);
    const { data: txId, error: spendErr } = await supabase.rpc('spend_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: priceKey,
      p_idempotency_key: spendKey,
      p_battle_id: null,
      p_video_job_id: null,
      p_metadata: { character_id: character.id },
    });
    if (spendErr) {
      const msg = spendErr.message ?? '';
      if (/Insufficient credits/i.test(msg)) {
        return err('insufficient_credits', msg, 402);
      }
      return err('server_error', msg, 500);
    }
    walletTxId = (txId as unknown as string) ?? null;
  }

  // Look up signature item fragment.
  let itemFragment: string | undefined;
  if (character.signature_item_id) {
    const { data: item } = await supabase
      .from('signature_items')
      .select('prompt_fragment')
      .eq('id', character.signature_item_id)
      .maybeSingle();
    itemFragment = item?.prompt_fragment ?? undefined;
  }

  const traits: PortraitTraits = {
    vibe: character.vibe ?? undefined,
    silhouette: character.silhouette ?? undefined,
    palette: character.palette_key ?? undefined,
    era: character.era ?? undefined,
    expression: character.expression ?? undefined,
  };

  const { data: job } = await supabase
    .from('portrait_jobs')
    .insert({
      character_id: character.id,
      profile_id: userId,
      kind: 'regenerate',
      status: 'running',
      seed: character.portrait_seed as number,
      prompt_payload: {
        raw: promptRaw,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_fragment: itemFragment ?? null,
        art_style: newArtStyle,
      },
      idempotency_key: idempotencyKey,
      attempt: 1,
    })
    .select('id')
    .single();

  const refundIfPaid = async (reason: string): Promise<void> => {
    if (!walletTxId || price.credits <= 0) return;
    const refundKey = `refund_${walletTxId}`;
    await supabase.rpc('grant_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: `${priceKey}_refund:${reason}`,
      p_idempotency_key: refundKey,
      p_battle_id: null,
      p_purchase_id: null,
      p_metadata: { character_id: character.id, original_tx: walletTxId },
    });
  };

  let result;
  try {
    result = await generateCharacterPortrait({
      prompt_raw: promptRaw || undefined,
      traits,
      archetype: character.archetype as Archetype,
      signature_color: character.signature_color,
      signature_item_fragment: itemFragment,
      seed: character.portrait_seed as number,
      art_style: newArtStyle,
    });
  } catch (e) {
    const code = e instanceof SafetyRefusedError
      ? 'moderation_rejected'
      : e instanceof ImageProviderError
        ? e.code
        : 'provider_error';
    await refundIfPaid(code);
    if (job?.id) {
      await supabase
        .from('portrait_jobs')
        .update({
          status: code === 'moderation_rejected' ? 'moderation_rejected' : 'failed',
          error_code: code,
          error_message: e instanceof Error ? e.message : String(e),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    return err(code, e instanceof Error ? e.message : 'provider failure', 502);
  }

  const portraitId = crypto.randomUUID();
  const ext = result.content_type === 'image/png'
    ? 'png'
    : result.content_type === 'image/jpeg'
      ? 'jpg'
      : 'webp';
  const storagePath = `${userId}/${character.id}/${portraitId}.${ext}`;

  const uploadRes = await supabase.storage
    .from('character-portraits')
    .upload(storagePath, result.image_bytes, {
      contentType: result.content_type,
      upsert: false,
    });
  if (uploadRes.error) {
    await refundIfPaid('storage_upload_failed');
    if (job?.id) {
      await supabase
        .from('portrait_jobs')
        .update({
          status: 'failed',
          error_code: 'storage_upload_failed',
          error_message: uploadRes.error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
    return err('storage_error', uploadRes.error.message, 500);
  }

  // Demote prior current portrait.
  await supabase
    .from('character_portraits')
    .update({ is_current: false })
    .eq('character_id', character.id)
    .eq('is_current', true);

  const { data: portrait, error: insertErr } = await supabase
    .from('character_portraits')
    .insert({
      id: portraitId,
      character_id: character.id,
      profile_id: userId,
      image_path: storagePath,
      seed: character.portrait_seed as number,
      provider: result.provider,
      provider_model: result.provider_model,
      prompt_snapshot: {
        raw: promptRaw,
        resolved: result.resolved_prompt,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_id: character.signature_item_id,
      },
      generation_job_id: job?.id ?? null,
      is_current: true,
      moderation_status: 'approved',
    })
    .select('id')
    .single();

  if (insertErr || !portrait) {
    await refundIfPaid('portrait_insert_failed');
    return err('server_error', insertErr?.message ?? 'portrait insert failed', 500);
  }

  await supabase
    .from('characters')
    .update({
      portrait_id: portrait.id,
      portrait_prompt_raw: promptRaw || null,
      portrait_prompt_resolved: result.resolved_prompt,
      art_style: newArtStyle,
      portrait_history: buildPortraitHistory(
        (character as { portrait_history?: unknown }).portrait_history,
        (character as { portrait_id?: string | null }).portrait_id ?? null,
      ),
    })
    .eq('id', character.id);

  if (job?.id) {
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'succeeded',
        provider: result.provider,
        provider_model: result.provider_model,
        result_portrait_id: portrait.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }

  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: priceKey, // 'regenerate_portrait' or 'new_portrait'
      before: { portrait_prompt_raw: character.portrait_prompt_raw },
      after: { portrait_id: portrait.id, portrait_prompt_raw: promptRaw },
      credits_spent: price.credits,
      wallet_transaction_id: walletTxId,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  return ok({
    portrait_id: portrait.id,
    job_id: job?.id ?? null,
    edit_id: edit?.id ?? null,
    credits_spent: price.credits,
    image_path: storagePath,
  });
});
