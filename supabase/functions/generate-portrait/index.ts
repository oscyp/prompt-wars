// Generate Portrait Edge Function
// First-time portrait for a character. No credit charge.
// - Requires characters.portrait_seed IS NULL
// - Generates a random 32-bit seed and atomically sets it
// - Runs text moderation on portrait_prompt_raw
// - Inserts portrait_jobs(status=queued)
// - Calls image provider, uploads to character-portraits bucket
// - Inserts character_portraits(is_current=TRUE) and updates characters.portrait_id

import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import {
  err,
  ok,
  randomPortraitSeed,
} from '../_shared/character-creation.ts';
import {
  generateCharacterPortrait,
  ImageProviderError,
  SafetyRefusedError,
} from '../_shared/image-provider.ts';
import type {
  Archetype,
  PortraitTraits,
} from '../_shared/portrait-prompt-resolver.ts';

interface GeneratePortraitRequest {
  character_id: string;
  portrait_prompt_raw?: string;
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

  let body: GeneratePortraitRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }

  if (!body.character_id) {
    return err('bad_request', 'character_id required', 400);
  }
  if (body.portrait_prompt_raw && body.portrait_prompt_raw.length > 200) {
    return err('bad_request', 'portrait_prompt_raw must be <= 200 chars', 400);
  }

  const supabase = createServiceClient();

  // Load character; verify ownership and that seed is null.
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, profile_id, archetype, signature_color, vibe, silhouette, era, expression, palette_key, signature_item_id, portrait_seed, portrait_prompt_raw',
    )
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  if (character.portrait_seed !== null) {
    return err(
      'conflict',
      'portrait already initialized; use regenerate-portrait',
      409,
    );
  }

  const promptRaw = body.portrait_prompt_raw ?? character.portrait_prompt_raw ?? '';

  // Moderate raw prompt (skip when empty).
  if (promptRaw.trim().length > 0) {
    const moderator = new TextModerationProvider();
    const modResult = await moderator.moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err('moderation_rejected', modResult.reason ?? 'prompt rejected', 422);
    }
  }

  // Atomically claim a seed (only if still null).
  const seed = randomPortraitSeed();
  const { data: claimed, error: claimErr } = await supabase
    .from('characters')
    .update({
      portrait_seed: seed,
      portrait_prompt_raw: promptRaw || null,
    })
    .eq('id', character.id)
    .is('portrait_seed', null)
    .select('id')
    .maybeSingle();

  if (claimErr) return err('server_error', claimErr.message, 500);
  if (!claimed) {
    return err('conflict', 'portrait_seed already set', 409);
  }

  // Look up signature item fragment if any.
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

  // Create job row in queued state.
  const { data: job, error: jobErr } = await supabase
    .from('portrait_jobs')
    .insert({
      character_id: character.id,
      profile_id: userId,
      kind: 'initial',
      status: 'queued',
      seed,
      prompt_payload: {
        raw: promptRaw,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_fragment: itemFragment ?? null,
      },
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return err('server_error', jobErr?.message ?? 'job insert failed', 500);
  }

  await supabase
    .from('portrait_jobs')
    .update({ status: 'running', attempt: 1, updated_at: new Date().toISOString() })
    .eq('id', job.id);

  // Call provider.
  let result;
  try {
    result = await generateCharacterPortrait({
      prompt_raw: promptRaw || undefined,
      traits,
      archetype: character.archetype as Archetype,
      signature_color: character.signature_color,
      signature_item_fragment: itemFragment,
      seed,
    });
  } catch (e) {
    const code = e instanceof SafetyRefusedError
      ? 'moderation_rejected'
      : e instanceof ImageProviderError
        ? e.code
        : 'provider_error';
    await supabase
      .from('portrait_jobs')
      .update({
        status: code === 'moderation_rejected' ? 'moderation_rejected' : 'failed',
        error_code: code,
        error_message: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return err(code, e instanceof Error ? e.message : 'provider failure', 502);
  }

  // Upload bytes.
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
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'failed',
        error_code: 'storage_upload_failed',
        error_message: uploadRes.error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return err('storage_error', uploadRes.error.message, 500);
  }

  // Insert character_portraits row.
  const { data: portrait, error: portraitErr } = await supabase
    .from('character_portraits')
    .insert({
      id: portraitId,
      character_id: character.id,
      profile_id: userId,
      image_path: storagePath,
      seed,
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
      generation_job_id: job.id,
      is_current: true,
      moderation_status: 'approved',
    })
    .select('id')
    .single();

  if (portraitErr || !portrait) {
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'failed',
        error_code: 'portrait_insert_failed',
        error_message: portraitErr?.message ?? 'unknown',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return err('server_error', portraitErr?.message ?? 'portrait insert failed', 500);
  }

  await supabase
    .from('characters')
    .update({
      portrait_id: portrait.id,
      portrait_prompt_resolved: result.resolved_prompt,
    })
    .eq('id', character.id);

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

  return ok({
    portrait_id: portrait.id,
    job_id: job.id,
    image_path: storagePath,
    provider: result.provider,
    provider_model: result.provider_model,
  });
});
