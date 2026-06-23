// Auto-Resolution Tests
// Tests for automatic battle resolution after prompt lock
// NOTE: This is an integration test that requires:
//   - SUPABASE_URL environment variable
//   - SUPABASE_SECRET_KEYS environment variable
//   - Running Supabase instance

import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getSupabaseSecretKey } from '../_shared/utils.ts';
import { createTestPlayer, deleteTestPlayer } from './integration-helpers.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = getSupabaseSecretKey();

// Skip tests if environment variables not set
const skipIntegrationTests = !supabaseUrl || !supabaseServiceKey;

Deno.test({
  name: 'Auto-Resolution: lock_prompt sets status to resolving when both prompts submitted',
  ignore: skipIntegrationTests,
  async fn() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  
  // Create two auth-backed test players (profiles are created by the
  // on_auth_user_created trigger) with characters.
  const player1 = await createTestPlayer(supabase, {
    displayName: 'Auto Res P1',
    archetype: 'strategist',
    characterName: 'Character 1',
  });
  const player2 = await createTestPlayer(supabase, {
    displayName: 'Auto Res P2',
    archetype: 'titan',
    characterName: 'Character 2',
  });
  
  // Create battle
  const { data: battleId, error: battleError } = await supabase.rpc('create_battle', {
    p_player_one_id: player1.profileId,
    p_character_id: player1.characterId,
    p_mode: 'unranked',
  });
  
  if (battleError) throw battleError;
  assertExists(battleId);
  
  // Match with player 2
  const { error: matchError } = await supabase.rpc('match_battle', {
    p_battle_id: battleId,
    p_player_two_id: player2.profileId,
    p_player_two_character_id: player2.characterId,
    p_theme: 'Test theme for auto-resolution',
  });
  
  if (matchError) throw matchError;
  
  // Verify status is 'matched'
  let { data: battle, error: fetchError } = await supabase
    .from('battles')
    .select('status')
    .eq('id', battleId)
    .single();
  
  if (fetchError) throw fetchError;
  assertExists(battle);
  assertEquals(battle.status, 'matched');
  
  // Player 1 locks prompt
  const { data: prompt1Id, error: lock1Error } = await supabase.rpc('lock_prompt', {
    p_battle_id: battleId,
    p_profile_id: player1.profileId,
    p_prompt_template_id: null,
    p_custom_prompt_text: 'Player 1 attacks with precision and strategy.',
    p_move_type: 'attack',
    p_moderation_status: 'approved',
  });
  
  if (lock1Error) throw lock1Error;
  assertExists(prompt1Id);
  
  // Verify status is 'waiting_for_prompts'
  ({ data: battle, error: fetchError } = await supabase
    .from('battles')
    .select('status')
    .eq('id', battleId)
    .single());
  
  if (fetchError) throw fetchError;
  assertExists(battle);
  assertEquals(battle.status, 'waiting_for_prompts');
  
  // Player 2 locks prompt
  const { data: prompt2Id, error: lock2Error } = await supabase.rpc('lock_prompt', {
    p_battle_id: battleId,
    p_profile_id: player2.profileId,
    p_prompt_template_id: null,
    p_custom_prompt_text: 'Player 2 defends with unbreakable will.',
    p_move_type: 'defense',
    p_moderation_status: 'approved',
  });
  
  if (lock2Error) throw lock2Error;
  assertExists(prompt2Id);
  
  // Verify status is now 'resolving'
  ({ data: battle, error: fetchError } = await supabase
    .from('battles')
    .select('status')
    .eq('id', battleId)
    .single());
  
  if (fetchError) throw fetchError;
  assertExists(battle);
  assertEquals(battle.status, 'resolving', 'Battle should be in resolving status after both prompts locked');
  
  // Cleanup (deleting the auth users cascades to profiles, characters,
  // battles, and battle_prompts).
  await deleteTestPlayer(supabase, player1.profileId);
  await deleteTestPlayer(supabase, player2.profileId);
  },
});
