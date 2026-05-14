// Edit Character Edge Function
// Single mutating entrypoint for character edits. Validates ownership, looks up
// price + cooldown, blocks edits when an active battle exists, charges credits,
// applies the update, bumps traits_version, records character_edits row.

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { err, getEditPrice, ok } from '../_shared/character-creation.ts';
import { isTestUser } from '../_shared/test-user.ts';

type EditKind =
  | 'rename'
  | 'archetype'
  | 'signature_color'
  | 'battle_cry'
  | 'palette'
  | 'traits_single_swap'
  | 'traits_full_reroll'
  | 'signature_item_swap';

interface EditRequest {
  character_id: string;
  edit_kind: EditKind;
  // shape varies by edit_kind, validated below
  payload: Record<string, unknown>;
  idempotency_key?: string;
}

const VIBE = ['heroic','sinister','mischievous','stoic','unhinged','regal'];
const SILHOUETTE = [
  'lean_duelist','heavy_bruiser','slim_trickster',
  'armored_knight','robed_mystic','sharp_tactician',
];
const ERA = ['ancient','industrial','modern','cyberpunk','far_future'];
const EXPRESSION = ['smirk','glare','calm','roar','smile','thousand_yard'];
const PALETTE = ['ember','ocean','neon','bone','forest','royal','ash','gold'];
const ARCHETYPE = ['strategist','trickster','titan','mystic','engineer'];

// Maps the price/key edit_kind to the character_edits.edit_kind enum value.
function editLogKind(k: EditKind): string {
  switch (k) {
    case 'rename': return 'name';
    case 'traits_single_swap':
    case 'traits_full_reroll': return 'traits';
    case 'signature_item_swap': return 'signature_item';
    case 'palette': return 'palette';
    case 'archetype': return 'archetype';
    case 'signature_color': return 'signature_color';
    case 'battle_cry': return 'battle_cry';
  }
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

  let body: EditRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }
  if (!body.character_id || !body.edit_kind) {
    return err('bad_request', 'character_id and edit_kind required', 400);
  }

  const supabase = createServiceClient();

  const headerKey = req.headers.get('Idempotency-Key')?.trim() ?? body.idempotency_key;
  const idempotencyKey = headerKey
    ? generateIdempotencyKey(['edit', body.edit_kind, body.character_id, headerKey])
    : null;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('character_edits')
      .select('id, after, credits_spent')
      .eq('profile_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return ok({ idempotent: true, edit_id: existing.id, after: existing.after });
    }
  }

  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, profile_id, name, archetype, battle_cry, signature_color, vibe, silhouette, era, expression, palette_key, signature_item_id, traits_version, last_edited_at',
    )
    .eq('id', body.character_id)
    .maybeSingle();
  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }

  const testUser = await isTestUser(supabase, userId);

  // Block edits if any battle for this character is in a non-final state.
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

  const price = await getEditPrice(supabase, body.edit_kind);
  if (!price) return err('bad_request', `unknown edit_kind: ${body.edit_kind}`, 400);

  // Cooldowns are tracked per edit category through character_edits.
  // Test users bypass cooldowns entirely.
  if (!testUser && price.cooldown_seconds > 0) {
    const { data: latestEdit, error: latestEditErr } = await supabase
      .from('character_edits')
      .select('created_at')
      .eq('character_id', character.id)
      .eq('edit_kind', editLogKind(body.edit_kind))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestEditErr) return err('server_error', latestEditErr.message, 500);

    if (latestEdit?.created_at) {
      const last = new Date(latestEdit.created_at).getTime();
      const next = last + price.cooldown_seconds * 1000;
      if (Date.now() < next) {
        return err('cooldown', `next allowed at ${new Date(next).toISOString()}`, 429);
      }
    }
  }

  // Build update + before/after diff per edit_kind.
  const p = body.payload ?? {};
  const update: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const setField = (col: string, val: unknown, current: unknown) => {
    before[col] = current;
    after[col] = val;
    update[col] = val;
  };

  switch (body.edit_kind) {
    case 'rename': {
      const name = (p.name as string | undefined)?.trim();
      if (!name || name.length < 1 || name.length > 40) {
        return err('bad_request', 'name must be 1-40 chars', 400);
      }
      setField('name', name, character.name);
      break;
    }
    case 'archetype': {
      const a = p.archetype as string;
      if (!ARCHETYPE.includes(a)) return err('bad_request', 'invalid archetype', 400);
      setField('archetype', a, character.archetype);
      break;
    }
    case 'signature_color': {
      const c = p.signature_color as string;
      if (!/^#[0-9a-fA-F]{6}$/.test(c ?? '')) {
        return err('bad_request', 'signature_color must be hex #RRGGBB', 400);
      }
      setField('signature_color', c, character.signature_color);
      break;
    }
    case 'battle_cry': {
      const bc = (p.battle_cry as string | undefined)?.trim();
      if (!bc || bc.length < 1 || bc.length > 60) {
        return err('bad_request', 'battle_cry must be 1-60 chars', 400);
      }
      setField('battle_cry', bc, character.battle_cry);
      break;
    }
    case 'palette': {
      const k = p.palette_key as string;
      if (!PALETTE.includes(k)) return err('bad_request', 'invalid palette_key', 400);
      setField('palette_key', k, character.palette_key);
      break;
    }
    case 'traits_single_swap': {
      const trait = p.trait as string;
      const value = p.value as string;
      const map: Record<string, { col: string; allowed: string[]; current: unknown }> = {
        vibe: { col: 'vibe', allowed: VIBE, current: character.vibe },
        silhouette: { col: 'silhouette', allowed: SILHOUETTE, current: character.silhouette },
        era: { col: 'era', allowed: ERA, current: character.era },
        expression: { col: 'expression', allowed: EXPRESSION, current: character.expression },
      };
      const cfg = map[trait];
      if (!cfg) return err('bad_request', 'invalid trait', 400);
      if (!cfg.allowed.includes(value)) {
        return err('bad_request', `invalid value for ${trait}`, 400);
      }
      setField(cfg.col, value, cfg.current);
      break;
    }
    case 'traits_full_reroll': {
      const v = p.vibe as string;
      const s = p.silhouette as string;
      const e = p.era as string;
      const x = p.expression as string;
      if (!VIBE.includes(v) || !SILHOUETTE.includes(s) || !ERA.includes(e) || !EXPRESSION.includes(x)) {
        return err('bad_request', 'invalid trait values', 400);
      }
      setField('vibe', v, character.vibe);
      setField('silhouette', s, character.silhouette);
      setField('era', e, character.era);
      setField('expression', x, character.expression);
      break;
    }
    case 'signature_item_swap': {
      const sigId = (p.signature_item_id as string | null) ?? null;
      if (sigId !== null) {
        const { data: item } = await supabase
          .from('signature_items')
          .select('id, profile_id, kind, moderation_status')
          .eq('id', sigId)
          .maybeSingle();
        if (!item) return err('bad_request', 'signature item not found', 400);
        if (item.kind === 'custom' && item.profile_id !== userId) {
          return err('forbidden', 'cannot equip another user\'s custom item', 403);
        }
        if (item.moderation_status === 'rejected') {
          return err('bad_request', 'signature item is rejected', 400);
        }
      }
      setField('signature_item_id', sigId, character.signature_item_id);
      break;
    }
  }

  // Charge credits if any.
  let walletTxId: string | null = null;
  if (price.credits > 0) {
    const spendKey = idempotencyKey
      ? `spend_${idempotencyKey}`
      : generateIdempotencyKey(['spend', body.edit_kind, character.id, crypto.randomUUID()]);
    const { data: txId, error: spendErr } = await supabase.rpc('spend_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: body.edit_kind,
      p_idempotency_key: spendKey,
      p_battle_id: null,
      p_video_job_id: null,
      p_metadata: { character_id: character.id, edit_kind: body.edit_kind },
    });
    if (spendErr) {
      if (/Insufficient credits/i.test(spendErr.message ?? '')) {
        return err('insufficient_credits', spendErr.message, 402);
      }
      return err('server_error', spendErr.message, 500);
    }
    walletTxId = (txId as unknown as string) ?? null;
  }

  // Bump traits_version when traits changed.
  if (body.edit_kind === 'traits_single_swap' || body.edit_kind === 'traits_full_reroll') {
    update.traits_version = (character.traits_version ?? 0) + 1;
  }

  const { data: updated, error: updErr } = await supabase
    .from('characters')
    .update(update)
    .eq('id', character.id)
    .select('*')
    .single();
  if (updErr || !updated) {
    // Refund on failure.
    if (walletTxId && price.credits > 0) {
      await supabase.rpc('grant_credits', {
        p_profile_id: userId,
        p_amount: price.credits,
        p_reason: `${body.edit_kind}_refund:update_failed`,
        p_idempotency_key: `refund_${walletTxId}`,
        p_battle_id: null,
        p_purchase_id: null,
        p_metadata: { character_id: character.id },
      });
    }
    return err('server_error', updErr?.message ?? 'update failed', 500);
  }

  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: editLogKind(body.edit_kind),
      before,
      after,
      credits_spent: price.credits,
      wallet_transaction_id: walletTxId,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  return ok({
    character: updated,
    edit_id: edit?.id ?? null,
    credits_spent: price.credits,
  });
});
