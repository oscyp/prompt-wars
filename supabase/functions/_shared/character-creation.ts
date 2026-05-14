// Shared helpers for character creation Edge Functions.
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './utils.ts';

export interface OkResponse<T> {
  ok: true;
  data: T;
}

export interface ErrResponse {
  ok: false;
  error: { code: string; message: string };
}

export function ok<T>(data: T, status = 200): Response {
  const body: OkResponse<T> = { ok: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function err(code: string, message: string, status = 400): Response {
  const body: ErrResponse = { ok: false, error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export interface EditPrice {
  edit_kind: string;
  credits: number;
  cooldown_seconds: number;
}

export async function getEditPrice(
  supabase: SupabaseClient,
  editKind: string,
): Promise<EditPrice | null> {
  const { data } = await supabase
    .from('character_edit_prices')
    .select('edit_kind, credits, cooldown_seconds')
    .eq('edit_kind', editKind)
    .maybeSingle();
  return (data as EditPrice) ?? null;
}

/**
 * Throws if the character's owner has any active (non-final) battle for that
 * character. Final states: completed, expired, canceled, moderation_failed,
 * generation_failed. We treat any other state as locked.
 */
export async function assertNoActiveBattleForCharacter(
  supabase: SupabaseClient,
  characterId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('battles')
    .select('id, status')
    .or(
      `player_one_character_id.eq.${characterId},player_two_character_id.eq.${characterId}`,
    )
    .not(
      'status',
      'in',
      '(completed,expired,canceled,moderation_failed,generation_failed)',
    )
    .limit(1);

  if (error) throw new Error(`battle lookup failed: ${error.message}`);
  if (data && data.length > 0) {
    throw new ActiveBattleError(`character is in an active battle (${data[0].status})`);
  }
}

export class ActiveBattleError extends Error {}
export class CooldownError extends Error {}
export class InsufficientCreditsError extends Error {}
export class ModerationRejectedError extends Error {}

export function decodeBase64(input: string): Uint8Array {
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomPortraitSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
