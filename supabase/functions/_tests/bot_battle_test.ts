// Bot Battle Tests
// Tests for bot battle creation, prompt generation, and resolution
// NOTE: These are integration tests that require:
//   - SUPABASE_URL environment variable
//   - SUPABASE_SECRET_KEYS environment variable
//   - Running Supabase instance with seeded bot_personas and bot_prompt_library

import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getSupabaseSecretKey } from '../_shared/utils.ts';
import { createTestPlayer, deleteTestPlayer } from './integration-helpers.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = getSupabaseSecretKey();

// Skip tests if environment variables not set
const skipIntegrationTests = !supabaseUrl || !supabaseServiceKey;

Deno.test({
  name: 'Bot Battle: create_bot_battle creates battle with bot opponent',
  ignore: skipIntegrationTests,
  async fn() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  
  // Create auth-backed test player with character.
  const player = await createTestPlayer(supabase, {
    displayName: 'Bot Test User',
    archetype: 'strategist',
  });
  
  // Get an active bot persona
  const { data: botPersona, error: botError } = await supabase
    .from('bot_personas')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  
  if (botError) throw botError;
  assertExists(botPersona);
  
  // Create bot battle
  const { data: battleId, error: battleError } = await supabase.rpc('create_bot_battle', {
    p_player_one_id: player.profileId,
    p_character_id: player.characterId,
    p_bot_persona_id: botPersona.id,
    p_mode: 'bot',
    p_theme: 'Test theme: overcome the impossible',
  });
  
  if (battleError) throw battleError;
  assertExists(battleId);
  
  // Verify battle was created correctly
  const { data: battle, error: fetchError } = await supabase
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single();
  
  if (fetchError) throw fetchError;
  assertExists(battle);
  
  assertEquals(battle.is_player_two_bot, true);
  assertEquals(battle.bot_persona_id, botPersona.id);
  assertEquals(battle.status, 'matched');
  assertEquals(battle.theme, 'Test theme: overcome the impossible');
  assertExists(battle.theme_revealed_at);
  assertExists(battle.matched_at);
  
  // Cleanup (auth user delete cascades to profile, character, battle).
  await deleteTestPlayer(supabase, player.profileId);
  },
});

Deno.test({
  name: 'Bot Battle: lock_prompt sets status to resolving for bot battles',
  ignore: skipIntegrationTests,
  async fn() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  
  // Create auth-backed test player with character.
  const player = await createTestPlayer(supabase, {
    displayName: 'Bot Lock Test',
    archetype: 'titan',
  });
  
  // Get an active bot persona
  const { data: botPersona, error: botError } = await supabase
    .from('bot_personas')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  
  if (botError) throw botError;
  assertExists(botPersona);
  
  // Create bot battle
  const { data: battleId, error: battleError } = await supabase.rpc('create_bot_battle', {
    p_player_one_id: player.profileId,
    p_character_id: player.characterId,
    p_bot_persona_id: botPersona.id,
    p_mode: 'bot',
    p_theme: 'Test theme',
  });
  
  if (battleError) throw battleError;
  assertExists(battleId);
  
  // Lock human prompt
  const { data: promptId, error: lockError } = await supabase.rpc('lock_prompt', {
    p_battle_id: battleId,
    p_profile_id: player.profileId,
    p_prompt_template_id: null,
    p_custom_prompt_text: 'A mighty attack that overwhelms the opponent with raw power.',
    p_move_type: 'attack',
    p_moderation_status: 'approved',
  });
  
  if (lockError) throw lockError;
  assertExists(promptId);
  
  // Verify battle status is now 'resolving'
  const { data: battle, error: fetchError } = await supabase
    .from('battles')
    .select('status')
    .eq('id', battleId)
    .single();
  
  if (fetchError) throw fetchError;
  assertExists(battle);
  assertEquals(battle.status, 'resolving');
  
  // Cleanup (auth user delete cascades to profile, character, battle, prompts).
  await deleteTestPlayer(supabase, player.profileId);
  },
});

Deno.test({
  name: 'Bot Battle: bot_prompt_library has prompts for bot personas',
  ignore: skipIntegrationTests,
  async fn() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  
  // Fetch bot personas
  const { data: botPersonas, error: personaError } = await supabase
    .from('bot_personas')
    .select('id, name')
    .eq('is_active', true);
  
  if (personaError) throw personaError;
  assertExists(botPersonas);
  assertEquals(botPersonas.length > 0, true, 'Should have at least one bot persona');
  
  // Verify each bot has prompts
  for (const persona of botPersonas) {
    const { data: prompts, error: promptError } = await supabase
      .from('bot_prompt_library')
      .select('*')
      .eq('bot_persona_id', persona.id);
    
    if (promptError) throw promptError;
    assertExists(prompts);
    assertEquals(prompts.length > 0, true, `Bot persona ${persona.name} should have prompts`);
  }
  },
});
