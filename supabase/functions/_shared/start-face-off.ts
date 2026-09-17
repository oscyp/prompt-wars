// Bo3 face-off writer.
//
// Called once per Bo3 battle after matchmaking finalizes (status 'matched').
// Populates the snapshotted character stats, HP envelopes, the round-1
// `battle_rounds` row, and flips `battles.status` to the round-1 waiting
// state. Idempotent: if `face_off_revealed_at` is already set, the function
// is a no-op. Service-role caller only (writes to battle_rounds and battles).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { roundDeadline } from './combat.ts';
import { resolveCurrentPortrait } from './compose-reveal-payload.ts';

interface CharacterStats {
  id?: string;
  name?: string;
  archetype?: string;
  signature_color?: string;
  battle_cry?: string;
  art_style?: string;
  cosmetic_config?: Record<string, string>;
  stat_strength: number;
  stat_stamina: number;
  stat_agility: number;
  stat_focus: number;
}

function statsSnapshot(c: CharacterStats) {
  return {
    strength: c.stat_strength,
    stamina: c.stat_stamina,
    agility: c.stat_agility,
    focus: c.stat_focus,
  };
}

// HP envelope from stamina. Stamina is 1..10, so this spans 68..140 — exactly
// the `battles.player_*_hp_max` CHECK range (floor lowered to 68 for stamina-1
// in migration 20260525170000_bo3_hp_floor_fix). Keep the formula and that
// constraint in lockstep.
function hpMaxFromStamina(stamina: number): number {
  return 60 + stamina * 8;
}

export interface StartFaceOffResult {
  applied: boolean;
  reason?: string;
}

/**
 * Apply the matched -> face_off transition for a Bo3 battle.
 *
 * Idempotency:
 *   - Returns `{applied:false, reason:'already_revealed'}` if
 *     `face_off_revealed_at IS NOT NULL`.
 *   - The round-1 INSERT uses ON CONFLICT DO NOTHING.
 *
 * Returns `{applied:false, reason:'not_bo3'}` for single-format battles so
 * callers can blindly invoke this after any matchmaking finalization without
 * needing to pre-check the format.
 */
interface BattleRow {
  id: string;
  rules_version?: number;
  is_player_two_bot?: boolean;
  bot_persona_id?: string;
  format: string;
  mode: string | null;
  status: string;
  face_off_revealed_at: string | null;
  player_one_id: string;
  player_two_id: string | null;
  player_one_character_id: string;
  player_two_character_id: string | null;
}

export async function startFaceOff(
  supabase: SupabaseClient,
  battleId: string,
): Promise<StartFaceOffResult> {
  // 1. Load battle + both characters.
  const { data: battleRaw, error: battleErr } = await supabase
    .from('battles')
    .select(
      'id, format, mode, rules_version, is_player_two_bot, bot_persona_id, status, face_off_revealed_at, ' +
        'player_one_id, player_two_id, ' +
        'player_one_character_id, player_two_character_id',
    )
    .eq('id', battleId)
    .single();

  if (battleErr || !battleRaw) {
    return { applied: false, reason: 'battle_not_found' };
  }
  const battle = battleRaw as unknown as BattleRow;
  if (battle.format !== 'bo3') {
    return { applied: false, reason: 'not_bo3' };
  }
  if (battle.face_off_revealed_at) {
    return { applied: false, reason: 'already_revealed' };
  }
  if (!battle.player_one_character_id) {
    return { applied: false, reason: 'missing_player_one_character' };
  }

  // Player two character may be NULL for bot battles; the bot has no
  // `characters` row but we still need stats. We default a bot to all-5s.
  const charIds = [battle.player_one_character_id];
  if (battle.player_two_character_id) {
    charIds.push(battle.player_two_character_id);
  }

  const { data: charactersRaw, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, name, archetype, signature_color, battle_cry, art_style, cosmetic_config, stat_strength, stat_stamina, stat_agility, stat_focus',
    )
    .in('id', charIds);

  if (charErr || !charactersRaw) {
    return { applied: false, reason: 'characters_query_failed' };
  }
  const characters = charactersRaw as unknown as Array<
    { id: string } & CharacterStats
  >;

  const byId = new Map<string, CharacterStats>(
    characters.map((c) => [c.id, c]),
  );
  const p1 = byId.get(battle.player_one_character_id);
  if (!p1) {
    return { applied: false, reason: 'player_one_character_not_found' };
  }
  const p2: CharacterStats = battle.player_two_character_id
    ? (byId.get(battle.player_two_character_id) ?? {
        stat_strength: 5,
        stat_stamina: 5,
        stat_agility: 5,
        stat_focus: 5,
      })
    : {
        // Bot opponent: neutral stats.
        stat_strength: 5,
        stat_stamina: 5,
        stat_agility: 5,
        stat_focus: 5,
      };

  const p1HpMax = hpMaxFromStamina(p1.stat_stamina);
  const p2HpMax = hpMaxFromStamina(p2.stat_stamina);
  const deadlineIso = roundDeadline(
    Date.now(),
    battle.mode,
    !!battle.is_player_two_bot,
    battle.rules_version ?? 1,
    1,
  );
  const freezeIdentity = async (c: CharacterStats) => ({
    id: c.id ?? null,
    name: c.name ?? 'AI Opponent',
    archetype: c.archetype ?? 'strategist',
    signature_color: c.signature_color ?? '#8B5CF6',
    battle_cry: c.battle_cry ?? '',
    art_style: c.art_style ?? null,
    cosmetic_config: c.cosmetic_config ?? null,
    avatar: await resolveCurrentPortrait(supabase, c.id, 'avatar'),
    fighter: await resolveCurrentPortrait(supabase, c.id, 'fighter'),
  });
  let botIdentity: CharacterStats = p2;
  if (battle.is_player_two_bot && battle.bot_persona_id) {
    const { data: persona } = await supabase
      .from('bot_personas')
      .select('name,archetype,signature_color,battle_cry')
      .eq('id', battle.bot_persona_id)
      .maybeSingle();
    botIdentity = { ...p2, ...persona, id: undefined };
  }
  const identitySnapshot = {
    player_one: await freezeIdentity(p1),
    player_two: await freezeIdentity(
      battle.is_player_two_bot ? botIdentity : p2,
    ),
  };

  const { data: applied, error } = await supabase.rpc('start_battle_face_off', {
    p_battle_id: battleId,
    p_identity: identitySnapshot,
    p_one_stats: statsSnapshot(p1),
    p_two_stats: statsSnapshot(p2),
    p_one_hp: p1HpMax,
    p_two_hp: p2HpMax,
    p_deadline: deadlineIso,
  });
  if (error) throw new Error(`start-face-off: ${error.message}`);
  return {
    applied: applied === true,
    ...(applied ? {} : { reason: 'concurrent_or_ineligible' }),
  };
}
