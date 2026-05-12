// Auto-Resolution Tests
// Tests for automatic battle resolution after prompt lock
// NOTE: This is an integration test that requires:
//   - SUPABASE_URL environment variable
//   - SUPABASE_SECRET_KEYS environment variable
//   - Running Supabase instance

import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getSupabaseSecretKey } from '../_shared/utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = getSupabaseSecretKey();

// Skip tests if environment variables not set
const skipIntegrationTests = !supabaseUrl || !supabaseServiceKey;

Deno.test({
  name: 'Auto-Resolution: lock_prompt sets status to resolving when both prompts submitted',
  ignore: skipIntegrationTests,
  async fn() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Create two test profiles
  const { data: profile1, error: p1Error } = await supabase
    .from('profiles')
    .insert({ username: 'auto_res_p1', display_name: 'Auto Res P1' })
    .select('id')
    .single();
  
  if (p1Error) throw p1Error;
  assertExists(profile1);
  
  const { data: profile2, error: p2Error } = await supabase
    .from('profiles')
    .insert({ username: 'auto_res_p2', display_name: 'Auto Res P2' })
    .select('id')
    .single();
  
  if (p2Error) throw p2Error;
  assertExists(profile2);
  
  // Create characters
  const { data: char1, error: c1Error } = await supabase
    .from('characters')
    .insert({
      profile_id: profile1.id,
      name: 'Character 1',
      archetype: 'strategist',
    })
    .select('id')
    .single();
  
  if (c1Error) throw c1Error;
  assertExists(char1);
  
  const { data: char2, error: c2Error } = await supabase
    .from('characters')
    .insert({
      profile_id: profile2.id,
      name: 'Character 2',
      archetype: 'titan',
    })
    .select('id')
    .single();
  
  if (c2Error) throw c2Error;
  assertExists(char2);
  
  // Create battle
  const { data: battleId, error: battleError } = await supabase.rpc('create_battle', {
    p_player_one_id: profile1.id,
    p_character_id: char1.id,
    p_mode: 'unranked',
  });
  
  if (battleError) throw battleError;
  assertExists(battleId);
  
  // Match with player 2
  const { error: matchError } = await supabase.rpc('match_battle', {
    p_battle_id: battleId,
    p_player_two_id: profile2.id,
    p_player_two_character_id: char2.id,
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
    p_profile_id: profile1.id,
    p_prompt_template_id: null,
    p_custom_prompt_text: 'Player 1 attacks with precision and strategy.',
    p_move_type: 'attack',
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
    p_profile_id: profile2.id,
    p_prompt_template_id: null,
    p_custom_prompt_text: 'Player 2 defends with unbreakable will.',
    p_move_type: 'defense',
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
  
  // Cleanup
  await supabase.from('battle_prompts').delete().in('id', [prompt1Id, prompt2Id]);
  await supabase.from('battles').delete().eq('id', battleId);
  await supabase.from('characters').delete().in('id', [char1.id, char2.id]);
  await supabase.from('profiles').delete().in('id', [profile1.id, profile2.id]);
  },
});
