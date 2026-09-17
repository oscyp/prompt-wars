// Initial portraits: three reserved free renders for drafts, retained when a
// starter is finalized. Finalized requests render saved, moderated identity;
// free_only forbids silently crossing into paid rendering. Legacy finalized
// fighters without any portrait retain their existing single initial render.
// Reservation + saved response make retries and quota accounting durable.

import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import {
  err,
  getEditPrice,
  isDraftCharacter,
  ok,
  randomPortraitSeed,
} from '../_shared/character-creation.ts';
import {
  insufficientCreditsResponse,
  isInsufficientCreditsError,
} from '../_shared/credits.ts';
import { renderOnePortrait } from '../_shared/render-portrait.ts';
import type {
  ArtStyle,
  PortraitTraits,
} from '../_shared/portrait-prompt-resolver.ts';
import { ART_STYLE_KEYS } from '../_shared/portrait-prompt-resolver.ts';

interface GeneratePortraitRequest {
  character_id: string;
  request_id?: string;
  free_only?: boolean;
  action?: 'status';
  portrait_prompt_raw?: string;
  art_style?: ArtStyle;
  /**
   * Guided-path traits from the creation screen. They live only in the client's
   * draft until finalize-character-creation writes them, so during creation the
   * request body is the only place they exist -- without them every re-roll
   * renders from archetype alone and the results barely differ.
   */
  traits?: PortraitTraits;
}

const TRAIT_KEYS = [
  'vibe',
  'silhouette',
  'palette',
  'era',
  'expression',
] as const;
const MAX_TRAIT_LEN = 40;

/** Drop undefined entries so a null row column does not mask a body value. */
function stripUndefined(traits: PortraitTraits): PortraitTraits {
  return Object.fromEntries(
    Object.entries(traits).filter(([, v]) => v !== undefined),
  ) as PortraitTraits;
}

/** Keep only known trait keys with short string values; ignore anything else. */
function sanitizeTraits(input: unknown): PortraitTraits {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of TRAIT_KEYS) {
    const value = src[key];
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_TRAIT_LEN
    ) {
      out[key] = value;
    }
  }
  return out as PortraitTraits;
}

/** Free portrait renders while a character is still a draft. */
const DRAFT_FREE_RENDERS = 3;

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
  if (body.art_style && !ART_STYLE_KEYS.includes(body.art_style)) {
    return err('bad_request', 'invalid art_style', 400);
  }

  const supabase = createServiceClient();

  // Load character; verify ownership and that seed is null.
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, profile_id, draft_portrait_renders, archetype, signature_color, vibe, silhouette, era, expression, palette_key, signature_item_id, portrait_seed, portrait_prompt_raw, art_style, finalized_at, appearance_version, starter_asset_key',
    )
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  const requestId = body.request_id ?? crypto.randomUUID();
  if (body.action === 'status') {
    const { data, error } = await supabase.rpc('check_initial_portrait', {
      p_profile_id: userId,
      p_character_id: character.id,
      p_request_id: body.request_id ?? null,
    });
    return error
      ? err('server_error', 'Could not check render. Try again.', 503)
      : ok({ request: data });
  }
  const { data: reservation, error: reserveError } = await supabase.rpc(
    'claim_initial_portrait',
    {
      p_profile_id: userId,
      p_character_id: character.id,
      p_request_id: requestId,
      p_free_only: body.free_only === true,
    },
  );
  if (reserveError) return err('conflict', reserveError.message, 409);
  if (!reservation.worker) {
    if (reservation.status === 'succeeded') return ok(reservation.response);
    return err(
      'conflict',
      reservation.status === 'reserved'
        ? 'Portrait is processing. Check this render again.'
        : 'The render ended without a portrait. Its allowance was returned; start a new render.',
      409,
    );
  }
  const token = reservation.lease_token;
  let committed = false;
  try {
    const isDraft = isDraftCharacter(character.finalized_at as string | null);
    const promptRaw = isDraft
      ? (body.portrait_prompt_raw ?? character.portrait_prompt_raw ?? '')
      : (character.portrait_prompt_raw ?? '');
    const artStyle: ArtStyle =
      (isDraft ? body.art_style : undefined) ??
      character.art_style ??
      'painterly';
    if (promptRaw.trim()) {
      const moderation = await new TextModerationProvider().moderate(promptRaw);
      if (moderation.status !== 'approved')
        return err(
          'moderation_rejected',
          moderation.reason ?? 'Prompt needs review.',
          422,
        );
    }
    const price = reservation.free
      ? { credits: 0 }
      : await getEditPrice(supabase, 'render_look');
    if (!price) return err('server_error', 'price config missing', 500);
    const { data: started, error: startError } = await supabase.rpc(
      'start_initial_portrait_work',
      {
        p_profile_id: userId,
        p_character_id: character.id,
        p_request_id: requestId,
        p_token: token,
        p_prompt: promptRaw,
        p_style: artStyle,
        p_seed: randomPortraitSeed(),
        p_price: price.credits,
      },
    );
    if (startError) {
      if (isInsufficientCreditsError(startError.message))
        return insufficientCreditsResponse(startError.message, price.credits);
      return err('conflict', startError.message, 409);
    }
    // The locked snapshot returned by the start RPC decides whether body traits are allowed.
    const current = started.character;
    const traits: PortraitTraits = {
      ...(isDraftCharacter(current.finalized_at)
        ? sanitizeTraits(body.traits)
        : {}),
      ...stripUndefined({
        vibe: current.vibe ?? undefined,
        silhouette: current.silhouette ?? undefined,
        palette: current.palette_key ?? undefined,
        era: current.era ?? undefined,
        expression: current.expression ?? undefined,
      }),
    };
    let itemFragment: string | undefined;
    if (current.signature_item_id) {
      const { data: item } = await supabase
        .from('signature_items')
        .select('prompt_fragment')
        .eq('id', current.signature_item_id)
        .maybeSingle();
      itemFragment = item?.prompt_fragment;
    }
    const renderInput = {
      supabase,
      userId,
      character: current,
      promptRaw,
      artStyle,
      traits,
      itemFragment,
      seed: started.seed,
      jobKind: 'generate' as const,
      deferPublication: true,
      initialRequestId: requestId,
    };
    const fighter = await renderOnePortrait({
      ...renderInput,
      kind: 'fighter',
      existingJobId: started.job_id,
    });
    if (!fighter.ok) return err(fighter.code, fighter.message, fighter.status);
    const avatar = await renderOnePortrait({ ...renderInput, kind: 'avatar' });
    const response = {
      portrait_id: fighter.portraitId,
      job_id: fighter.jobId,
      image_path: fighter.imagePath,
      provider: fighter.provider,
      provider_model: fighter.providerModel,
      avatar_portrait_id: avatar.ok ? avatar.portraitId : null,
      avatar_image_path: avatar.ok ? avatar.imagePath : null,
      avatar_pending: !avatar.ok,
      credits_spent: price.credits,
      free_renders_left: Math.max(
        0,
        DRAFT_FREE_RENDERS - current.draft_portrait_renders,
      ),
    };
    const { data: accepted, error: commitError } = await supabase.rpc(
      'commit_initial_portrait',
      {
        p_profile_id: userId,
        p_character_id: character.id,
        p_request_id: requestId,
        p_token: token,
        p_fighter_id: fighter.portraitId,
        p_avatar_id: avatar.ok ? avatar.portraitId : null,
        p_response: response,
      },
    );
    if (commitError) {
      // The reply may be lost after commit. Status reconciliation decides; never refund speculatively.
      committed = true;
      return err(
        'server_error',
        'Check this render to recover its result.',
        503,
      );
    }
    if (!accepted)
      return err(
        'conflict',
        'Render expired or your saved look changed. Check this render.',
        409,
      );
    committed = true;
    return ok(response);
  } catch (error) {
    return err(
      'server_error',
      error instanceof Error
        ? error.message
        : 'Portrait unavailable. Try again.',
      503,
    );
  } finally {
    if (!committed)
      await supabase.rpc('fail_initial_portrait', {
        p_profile_id: userId,
        p_character_id: character.id,
        p_request_id: requestId,
        p_token: token,
      });
  }
});
