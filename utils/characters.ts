/**
 * Character + portrait Edge Function wrappers.
 *
 * All calls go through `supabase.functions.invoke()` and pass a client-generated
 * idempotency key. Portrait jobs are polled via a realtime channel on
 * `portrait_jobs` scoped to the current profile.
 *
 * The backend remains the source of truth for pricing, moderation, and
 * trait validity. This module never decides outcomes.
 */

import { invokeAuthenticatedFunction, supabase } from './supabase';
import {
  Vibe,
  Silhouette,
  Era,
  Expression,
  PaletteKey,
  ItemClass,
  ARCHETYPE_INITIAL,
  ITEM_CLASS_GLYPH,
  ArchetypeForTraits,
  ArtStyle,
  PALETTE_HEX,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
} from '@/constants/CharacterTraits';

// ---------------------------------------------------------------------------
// UUID v4 (RN doesn't ship crypto.randomUUID on older runtimes)
// ---------------------------------------------------------------------------

/**
 * RFC4122 v4 UUID using Math.random.
 * Not cryptographically secure; sufficient as an idempotency key.
 */
export function generateIdempotencyKey(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[((Math.random() * 4) | 0) + 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraitSet {
  vibe?: Vibe;
  silhouette?: Silhouette;
  palette?: PaletteKey;
  era?: Era;
  expression?: Expression;
}

export interface GeneratePortraitInput {
  characterId?: string;
  archetype: ArchetypeForTraits;
  mode: 'prompt' | 'guided';
  prompt?: string;
  traits?: TraitSet;
  artStyle?: ArtStyle;
}

export interface PortraitJobResult {
  jobId: string;
  portraitId: string;
  imageUrl: string;
  seed: string;
  status: 'succeeded';
}

export interface RegeneratePortraitInput {
  characterId: string;
  paid?: boolean;
  /**
   * When provided, the backend treats this as a re-prompt and charges the
   * `new_portrait` price instead of `regenerate_portrait`.
   */
  portraitPromptRaw?: string;
  /**
   * When provided and different from the character's current art_style, the
   * backend re-renders and charges the `new_portrait` price tier.
   */
  artStyle?: ArtStyle;
}

export interface CreateCustomSignatureItemInput {
  name: string;
  description: string;
  itemClass: ItemClass;
  generateIcon?: boolean;
}

export interface CustomSignatureItem {
  id: string;
  name: string;
  description: string;
  itemClass: ItemClass;
  iconUrl?: string;
}

export interface CatalogSignatureItem {
  id: string;
  name: string;
  description: string;
  itemClass: ItemClass;
  iconUrl?: string;
}

export interface EditCharacterInput {
  characterId: string;
  changes: {
    battleCry?: string;
    signatureColor?: PaletteKey | string;
    signatureItemId?: string | null;
    regeneratePortrait?: boolean;
    rePromptPortrait?: { prompt: string };
    swapTrait?: { key: keyof TraitSet; value: string };
    rerollAllTraits?: boolean;
  };
}

export interface EditCharacterResult {
  character: {
    id: string;
  };
  edit_id: string | null;
  credits_spent: number;
}

interface FunctionEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

type EditCharacterInvokeRequest = {
  edit_kind:
    | 'battle_cry'
    | 'signature_color'
    | 'signature_item_swap'
    | 'traits_single_swap'
    | 'traits_full_reroll'
    | 'palette';
  payload: Record<string, unknown>;
};

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function toEditCharacterRequest(
  changes: EditCharacterInput['changes'],
): EditCharacterInvokeRequest {
  if (typeof changes.battleCry === 'string') {
    return {
      edit_kind: 'battle_cry',
      payload: { battle_cry: changes.battleCry },
    };
  }

  if (changes.signatureColor != null) {
    const color =
      changes.signatureColor in PALETTE_HEX
        ? PALETTE_HEX[changes.signatureColor as PaletteKey]
        : changes.signatureColor;
    return {
      edit_kind: 'signature_color',
      payload: { signature_color: color },
    };
  }

  if ('signatureItemId' in changes) {
    return {
      edit_kind: 'signature_item_swap',
      payload: { signature_item_id: changes.signatureItemId ?? null },
    };
  }

  if (changes.swapTrait) {
    // Palette lives on its own edit kind in the Edge Function contract.
    if (changes.swapTrait.key === 'palette') {
      return {
        edit_kind: 'palette',
        payload: { palette_key: changes.swapTrait.value },
      };
    }
    return {
      edit_kind: 'traits_single_swap',
      payload: {
        trait: changes.swapTrait.key,
        value: changes.swapTrait.value,
      },
    };
  }

  if (changes.rerollAllTraits) {
    return {
      edit_kind: 'traits_full_reroll',
      payload: {
        vibe: pickRandom(VIBES),
        silhouette: pickRandom(SILHOUETTES),
        era: pickRandom(ERAS),
        expression: pickRandom(EXPRESSIONS),
      },
    };
  }

  if (changes.regeneratePortrait) {
    throw new Error('Portrait regeneration must use the regeneratePortrait function.');
  }

  if (changes.rePromptPortrait) {
    throw new Error('Portrait re-prompting must use generatePortrait with prompt mode.');
  }

  throw new Error('No supported character edit was provided.');
}

// ---------------------------------------------------------------------------
// Portrait job polling via realtime
// ---------------------------------------------------------------------------

const PORTRAIT_JOB_TIMEOUT_MS = 90_000;

type PortraitJobRow = {
  id: string;
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'moderation_rejected'
    | 'cancelled';
  result_portrait_id: string | null;
  seed: string | null;
  error_message: string | null;
};

const PORTRAIT_BUCKET = 'character-portraits';
const SIGNED_URL_TTL_SECONDS = 600;

async function signPortraitUrl(imagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to sign portrait URL.');
  }
  return data.signedUrl;
}

async function resolvePortraitImageUrl(portraitId: string): Promise<string> {
  const { data, error } = await supabase
    .from('character_portraits')
    .select('image_path')
    .eq('id', portraitId)
    .maybeSingle();
  if (error || !data?.image_path) {
    throw new Error(error?.message || 'Portrait record not found.');
  }
  return signPortraitUrl(data.image_path as string);
}

async function waitForPortraitJob(
  profileId: string,
  jobId: string,
): Promise<PortraitJobResult> {
  return new Promise<PortraitJobResult>((resolve, reject) => {
    let settled = false;

    const settleResolve = (result: PortraitJobResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
      resolve(result);
    };
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
      reject(err);
    };

    const handleRow = (row: PortraitJobRow | null) => {
      if (!row || row.id !== jobId) return;
      if (row.status === 'succeeded' && row.result_portrait_id) {
        const portraitId = row.result_portrait_id;
        const seed = row.seed ?? '';
        resolvePortraitImageUrl(portraitId)
          .then((imageUrl) => {
            settleResolve({
              jobId: row.id,
              portraitId,
              imageUrl,
              seed,
              status: 'succeeded',
            });
          })
          .catch((err: Error) => settleReject(err));
      } else if (
        row.status === 'failed' ||
        row.status === 'moderation_rejected' ||
        row.status === 'cancelled'
      ) {
        settleReject(
          new Error(
            row.error_message ||
              (row.status === 'moderation_rejected'
                ? 'Portrait was rejected by moderation.'
                : row.status === 'cancelled'
                  ? 'Portrait generation was cancelled.'
                  : 'Portrait generation failed.'),
          ),
        );
      }
    };

    const channel = supabase
      .channel(`portrait_jobs:${profileId}:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portrait_jobs',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          handleRow(payload.new as PortraitJobRow);
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Catch jobs that already completed before we subscribed.
          const { data, error } = await supabase
            .from('portrait_jobs')
            .select('id,status,result_portrait_id,seed,error_message')
            .eq('id', jobId)
            .maybeSingle();
          if (!error && data) {
            handleRow(data as PortraitJobRow);
          }
        }
      });

    const timeout = setTimeout(() => {
      settleReject(
        new Error(
          "Your portrait is taking longer than usual. We'll keep working on it.",
        ),
      );
    }, PORTRAIT_JOB_TIMEOUT_MS);
  });
}

async function getCurrentProfileId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You must be signed in.');
  }
  return user.id;
}

// ---------------------------------------------------------------------------
// Edge Function wrappers
// ---------------------------------------------------------------------------

interface PortraitJobStartResponse {
  job_id: string;
  portrait_id?: string;
  image_path?: string;
  seed?: string | number;
  provider?: string;
  provider_model?: string;
}

async function startPortraitJob(
  functionName: 'generate-portrait' | 'regenerate-portrait',
  body: Record<string, unknown>,
): Promise<PortraitJobResult> {
  const profileId = await getCurrentProfileId();
  const idempotencyKey = generateIdempotencyKey();

  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<PortraitJobStartResponse>
  >(functionName, {
    ...body,
    idempotency_key: idempotencyKey,
  });

  if (!response.ok || !response.data?.job_id) {
    throw new Error(
      response.error?.message || 'Failed to start portrait generation.',
    );
  }

  const data = response.data;

  // Happy path: the Edge Function returned the completed portrait synchronously.
  if (data.portrait_id && data.image_path) {
    const imageUrl = await signPortraitUrl(data.image_path);
    return {
      jobId: data.job_id,
      portraitId: data.portrait_id,
      imageUrl,
      seed: data.seed != null ? String(data.seed) : '',
      status: 'succeeded',
    };
  }

  // Fallback: HTTP response only included job_id (e.g. async / dropped response).
  return waitForPortraitJob(profileId, data.job_id);
}

export async function generatePortrait(
  input: GeneratePortraitInput,
): Promise<PortraitJobResult> {
  return startPortraitJob('generate-portrait', {
    character_id: input.characterId,
    archetype: input.archetype,
    mode: input.mode,
    prompt: input.prompt,
    traits: input.traits,
    art_style: input.artStyle,
  });
}

export async function regeneratePortrait(
  input: RegeneratePortraitInput,
): Promise<PortraitJobResult> {
  const body: Record<string, unknown> = {
    character_id: input.characterId,
    paid: input.paid ?? false,
  };
  if (typeof input.portraitPromptRaw === 'string') {
    body.portrait_prompt_raw = input.portraitPromptRaw;
  }
  if (input.artStyle) {
    body.art_style = input.artStyle;
  }
  return startPortraitJob('regenerate-portrait', body);
}

export async function createCustomSignatureItem(
  input: CreateCustomSignatureItemInput,
): Promise<CustomSignatureItem> {
  const idempotencyKey = generateIdempotencyKey();
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<{ item: CustomSignatureItem }>
  >('create-custom-signature-item', {
    name: input.name,
    description: input.description,
    item_class: input.itemClass,
    prompt_fragment: input.description,
    with_image: input.generateIcon ?? false,
    idempotency_key: idempotencyKey,
  });
  if (!response.ok || !response.data?.item) {
    throw new Error(
      response.error?.message || 'Failed to create signature item.',
    );
  }
  return response.data.item;
}

export async function editCharacter(
  input: EditCharacterInput,
): Promise<EditCharacterResult> {
  const idempotencyKey = generateIdempotencyKey();
  const request = toEditCharacterRequest(input.changes);
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<EditCharacterResult>
  >('edit-character', {
    character_id: input.characterId,
    edit_kind: request.edit_kind,
    payload: request.payload,
    idempotency_key: idempotencyKey,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error?.message || 'Failed to edit character.');
  }
  return response.data;
}

export async function listSignatureItemsCatalog(): Promise<
  CatalogSignatureItem[]
> {
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<{ items: CatalogSignatureItem[] }>
  >('list-signature-items-catalog', {});
  if (!response.ok || !response.data?.items) {
    throw new Error(
      response.error?.message || 'Failed to load signature items.',
    );
  }
  return response.data.items;
}

// ---------------------------------------------------------------------------
// Fallback portrait
// ---------------------------------------------------------------------------

export interface FallbackPortraitInput {
  archetype: ArchetypeForTraits;
  signatureColor?: PaletteKey | string;
  itemClass?: ItemClass;
}

/**
 * Returns a deterministic data-URI SVG used as the offline/loading placeholder.
 * Colored circle, archetype initial, item-class glyph badge.
 */
export function getPortraitFallbackUri(input: FallbackPortraitInput): string {
  const colorKey = input.signatureColor;
  const tint =
    colorKey && colorKey in PALETTE_HEX
      ? PALETTE_HEX[colorKey as PaletteKey]
      : typeof colorKey === 'string' && colorKey.startsWith('#')
        ? colorKey
        : '#7C3AED';

  const initial = ARCHETYPE_INITIAL[input.archetype] ?? '?';
  const glyph = input.itemClass ? ITEM_CLASS_GLYPH[input.itemClass] : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${tint}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" fill="#111827"/>
  <circle cx="128" cy="128" r="96" fill="url(#g)" stroke="${tint}" stroke-width="4"/>
  <text x="128" y="148" font-family="Helvetica,Arial,sans-serif" font-size="96" font-weight="700" fill="#F9FAFB" text-anchor="middle">${initial}</text>
  ${
    glyph
      ? `<circle cx="200" cy="56" r="26" fill="#111827" stroke="${tint}" stroke-width="3"/>
         <text x="200" y="68" font-family="Helvetica,Arial,sans-serif" font-size="28" fill="${tint}" text-anchor="middle">${glyph}</text>`
      : ''
  }
</svg>`;

  // base64 to be safe for RN `<Image>` data URIs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b64 = (globalThis as any).btoa
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).btoa(unescape(encodeURIComponent(svg)))
    : encodeBase64(svg);
  return `data:image/svg+xml;base64,${b64}`;
}

function encodeBase64(input: string): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str = unescape(encodeURIComponent(input));
  let output = '';
  let i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++);
    const c2 = str.charCodeAt(i++);
    const c3 = str.charCodeAt(i++);
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = isNaN(c3) ? 64 : c3 & 63;
    output +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? '=' : chars.charAt(e3)) +
      (e4 === 64 ? '=' : chars.charAt(e4));
  }
  return output;
}
