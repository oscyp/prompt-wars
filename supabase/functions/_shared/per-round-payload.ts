// Per-round Tier 1 payload composition helper.
//
// Loads frozen `battle_rounds` + `battle_prompts` data and converts it into
// the structured payload consumed by the video provider adapter. Reads outcome
// from `battle_rounds` ONLY (pay-to-win guardrail). Does not call the provider;
// the worker (process-video-job) submits it.
//
// Shared by:
//   - request-video-upgrade (on-demand credit/grant/subscriber)
//   - round-resolve         (auto-enqueue Tier 1 for subscribers)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  composeTier1PerRoundPayload,
  type CharacterSnapshot,
  type PromptSnapshot,
  type SafetyContext,
} from './compose-tier1-payload.ts';

export async function composePerRoundPayload(
  supabase: SupabaseClient,
  battle: Record<string, any>,
  battleRoundId: string,
  roundNumber: number | null,
): Promise<Record<string, unknown>> {
  // Frozen round row.
  const { data: round, error: roundErr } = await supabase
    .from('battle_rounds')
    .select('*')
    .eq('id', battleRoundId)
    .single();
  if (roundErr || !round) {
    throw new Error('battle_rounds row missing for composition');
  }

  // Round-scoped prompts.
  const { data: prompts, error: promptsErr } = await supabase
    .from('battle_prompts')
    .select('*')
    .eq('battle_id', battle.id)
    .eq('round_number', roundNumber ?? round.round_number)
    .eq('is_locked', true);
  if (promptsErr) throw new Error('Failed to load round prompts');

  const p1Row = prompts?.find((p: any) => p.profile_id === battle.player_one_id);
  const p2Row = prompts?.find((p: any) => p.profile_id === battle.player_two_id);

  const promptText = async (row: any | null | undefined): Promise<string> => {
    if (!row) return '';
    if (row.custom_prompt_text) return row.custom_prompt_text;
    if (row.prompt_template_id) {
      const { data: tpl } = await supabase
        .from('prompt_templates')
        .select('body')
        .eq('id', row.prompt_template_id)
        .single();
      return tpl?.body ?? '';
    }
    return '';
  };

  const p1Text = await promptText(p1Row);
  const p2Text = await promptText(p2Row);

  const p1Char: CharacterSnapshot = {
    user_id: battle.player_one_id,
    name: battle.player_one_character?.name ?? 'Player One',
    archetype: battle.player_one_character?.archetype ?? 'neutral',
    signature_color: battle.player_one_character?.signature_color ?? '#6366f1',
    voice_id: battle.player_one_character?.voice_id ?? null,
    portrait_ref: battle.player_one_character?.portrait_signed_url ?? null,
    stats_snapshot: (battle.player_one_stats_snapshot as Record<string, number>) ?? {},
  };
  const p2Char: CharacterSnapshot = {
    user_id: battle.player_two_id,
    name: battle.player_two_character?.name ?? 'Player Two',
    archetype: battle.player_two_character?.archetype ?? 'neutral',
    signature_color: battle.player_two_character?.signature_color ?? '#94a3b8',
    voice_id: battle.player_two_character?.voice_id ?? null,
    portrait_ref: battle.player_two_character?.portrait_signed_url ?? null,
    stats_snapshot: (battle.player_two_stats_snapshot as Record<string, number>) ?? {},
  };

  const p1Prompt: PromptSnapshot = {
    text_moderated: p1Text,
    move_type: p1Row?.move_type ?? 'attack',
    pre_gen_moderation_id: p1Row?.moderation_event_id ?? null,
  };
  const p2Prompt: PromptSnapshot = {
    text_moderated: p2Text,
    move_type: p2Row?.move_type ?? 'attack',
    pre_gen_moderation_id: p2Row?.moderation_event_id ?? null,
  };

  const safety: SafetyContext = {
    pre_gen_moderation_id:
      p1Row?.moderation_event_id ?? p2Row?.moderation_event_id ?? null,
    locale: battle.locale ?? 'en-US',
    blocked_terms_version: 'v1',
  };

  return composeTier1PerRoundPayload({
    battle: {
      id: battle.id,
      player_one_id: battle.player_one_id,
      player_two_id: battle.player_two_id,
      is_player_two_bot: !!battle.is_player_two_bot,
      theme: battle.theme,
      current_round: battle.current_round,
      player_one_rounds_won: battle.player_one_rounds_won ?? 0,
      player_two_rounds_won: battle.player_two_rounds_won ?? 0,
    },
    round: round as any,
    playerOne: p1Char,
    playerTwo: p2Char,
    playerOnePrompt: p1Prompt,
    playerTwoPrompt: p2Prompt,
    safety,
  }) as unknown as Record<string, unknown>;
}
