// Bo3 face-off writer.
//
// Called once per Bo3 battle after matchmaking finalizes (status 'matched').
// Populates the snapshotted character stats, HP envelopes, the round-1
// `battle_rounds` row, and flips `battles.status` to the round-1 waiting
// state. Idempotent: if `face_off_revealed_at` is already set, the function
// is a no-op. Service-role caller only (writes to battle_rounds and battles).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/** Lock-in window for round 1 (and subsequent rounds) by mode. */
function lockInWindowMs(mode: string | null | undefined): number {
  // 45 minutes for ranked; 2 hours for friend/unranked/bot.
  if (mode === 'ranked') return 45 * 60 * 1000;
  return 2 * 60 * 60 * 1000;
}

interface CharacterStats {
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
      'id, format, mode, status, face_off_revealed_at, ' +
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
      'id, stat_strength, stat_stamina, stat_agility, stat_focus',
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
    ? byId.get(battle.player_two_character_id) ?? {
      stat_strength: 5,
      stat_stamina: 5,
      stat_agility: 5,
      stat_focus: 5,
    }
    : {
      // Bot opponent: neutral stats.
      stat_strength: 5,
      stat_stamina: 5,
      stat_agility: 5,
      stat_focus: 5,
    };

  const nowIso = new Date().toISOString();
  const p1HpMax = hpMaxFromStamina(p1.stat_stamina);
  const p2HpMax = hpMaxFromStamina(p2.stat_stamina);
  const deadlineIso = new Date(
    Date.now() + lockInWindowMs(battle.mode as string),
  ).toISOString();

  // 2. Atomic-ish battle update guarded on face_off_revealed_at IS NULL
  //    so concurrent matchmakers cannot double-write the snapshot.
  const { data: updated, error: updErr } = await supabase
    .from('battles')
    .update({
      face_off_revealed_at: nowIso,
      player_one_stats_snapshot: statsSnapshot(p1),
      player_two_stats_snapshot: statsSnapshot(p2),
      player_one_hp_max: p1HpMax,
      player_two_hp_max: p2HpMax,
      player_one_hp: p1HpMax,
      player_two_hp: p2HpMax,
      current_round: 1,
      status: 'waiting_for_prompts',
    })
    .eq('id', battleId)
    .eq('format', 'bo3')
    .is('face_off_revealed_at', null)
    .select('id')
    .single();

  if (updErr || !updated) {
    // Either a concurrent writer won, or the battle is no longer eligible.
    // Treat as idempotent no-op.
    return { applied: false, reason: 'concurrent_or_ineligible' };
  }

  // 3. Insert round-1 row (idempotent on the UNIQUE(battle_id, round_number)).
  const { error: roundErr } = await supabase
    .from('battle_rounds')
    .upsert(
      {
        battle_id: battleId,
        round_number: 1,
        status: 'waiting_for_prompts',
        lock_in_deadline: deadlineIso,
      },
      { onConflict: 'battle_id,round_number', ignoreDuplicates: true },
    );

  if (roundErr) {
    console.error('start-face-off: round insert failed', roundErr);
    // The battle face-off snapshot is already committed; the resolver and
    // submit-prompt paths can recover by reading the (existing) row.
  }

  return { applied: true };
}
