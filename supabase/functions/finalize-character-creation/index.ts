// Finalize Character Creation Edge Function
//
// Used by the onboarding flow to apply the final set of field values to a
// character row that was pre-created during the portrait step.
//
// Direct UPDATEs against `characters` are revoked from `authenticated`
// (see migration 20260513120000_character_creation_expansion.sql), so this
// function applies the update with the service-role client after verifying
// ownership and that the character has not yet been finalized.
//
// "Not yet finalized" is gated on the placeholder battle_cry value the
// client uses when pre-creating the draft row. A finalized character will
// have a real battle_cry, so this function will refuse to overwrite it.
// Subsequent edits must flow through `edit-character` (which charges
// credits and enforces cooldowns).

import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from '../_shared/utils.ts';
import { err, ok } from '../_shared/character-creation.ts';

const VIBE = ['heroic', 'sinister', 'mischievous', 'stoic', 'unhinged', 'regal'];
const SILHOUETTE = [
  'lean_duelist',
  'heavy_bruiser',
  'slim_trickster',
  'armored_knight',
  'robed_mystic',
  'sharp_tactician',
];
const ERA = ['ancient', 'industrial', 'modern', 'cyberpunk', 'far_future'];
const EXPRESSION = ['smirk', 'glare', 'calm', 'roar', 'smile', 'thousand_yard'];
const PALETTE = ['ember', 'ocean', 'neon', 'bone', 'forest', 'royal', 'ash', 'gold'];
const ARCHETYPE = ['strategist', 'trickster', 'titan', 'mystic', 'engineer'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Must match PLACEHOLDER_BATTLE_CRY in app/(onboarding)/create-character.tsx.
const PLACEHOLDER_BATTLE_CRY = '…';

interface FinalizeRequest {
  character_id: string;
  name?: string;
  archetype?: string;
  battle_cry?: string;
  signature_color?: string;
  vibe?: string;
  silhouette?: string;
  palette_key?: string;
  era?: string;
  expression?: string;
  signature_item_id?: string;
  portrait_id?: string;
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

  let body: FinalizeRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }

  if (!body.character_id) {
    return err('bad_request', 'character_id required', 400);
  }

  const supabase = createServiceClient();

  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, profile_id, battle_cry')
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  if (character.battle_cry !== PLACEHOLDER_BATTLE_CRY) {
    return err(
      'conflict',
      'character has already been finalized; use edit-character',
      409,
    );
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      return err('bad_request', 'name must be 1-40 chars', 400);
    }
    updates.name = trimmed;
  }
  if (typeof body.archetype === 'string') {
    if (!ARCHETYPE.includes(body.archetype)) {
      return err('bad_request', 'invalid archetype', 400);
    }
    updates.archetype = body.archetype;
  }
  if (typeof body.battle_cry === 'string') {
    const trimmed = body.battle_cry.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      return err('bad_request', 'battle_cry must be 1-60 chars', 400);
    }
    updates.battle_cry = trimmed;
  }
  if (typeof body.signature_color === 'string') {
    if (!HEX_RE.test(body.signature_color)) {
      return err('bad_request', 'signature_color must be #RRGGBB', 400);
    }
    updates.signature_color = body.signature_color;
  }
  if (body.vibe !== undefined) {
    if (!VIBE.includes(body.vibe)) {
      return err('bad_request', 'invalid vibe', 400);
    }
    updates.vibe = body.vibe;
  }
  if (body.silhouette !== undefined) {
    if (!SILHOUETTE.includes(body.silhouette)) {
      return err('bad_request', 'invalid silhouette', 400);
    }
    updates.silhouette = body.silhouette;
  }
  if (body.palette_key !== undefined) {
    if (!PALETTE.includes(body.palette_key)) {
      return err('bad_request', 'invalid palette_key', 400);
    }
    updates.palette_key = body.palette_key;
  }
  if (body.era !== undefined) {
    if (!ERA.includes(body.era)) {
      return err('bad_request', 'invalid era', 400);
    }
    updates.era = body.era;
  }
  if (body.expression !== undefined) {
    if (!EXPRESSION.includes(body.expression)) {
      return err('bad_request', 'invalid expression', 400);
    }
    updates.expression = body.expression;
  }
  if (typeof body.signature_item_id === 'string') {
    updates.signature_item_id = body.signature_item_id;
  }
  if (typeof body.portrait_id === 'string') {
    updates.portrait_id = body.portrait_id;
  }

  if (Object.keys(updates).length === 0) {
    return err('bad_request', 'no fields to update', 400);
  }

  const { error: updErr } = await supabase
    .from('characters')
    .update(updates)
    .eq('id', character.id)
    .eq('profile_id', userId);

  if (updErr) return err('server_error', updErr.message, 500);

  return ok({ character_id: character.id });
});
