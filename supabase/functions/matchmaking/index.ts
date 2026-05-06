// Matchmaking Edge Function
// Pairs players for battles with newbie bucket, rating bands, and bot fallback

import { createServiceClient, corsHeaders, errorResponse, successResponse, getAuthUserId } from '../_shared/utils.ts';
import { BattleMode } from '../_shared/types.ts';

/**
 * Create a bot battle (for mode='bot' or first battle)
 */
async function createBotBattle(
  supabase: ReturnType<typeof createServiceClient>,
  playerId: string,
  characterId: string,
  mode: BattleMode
): Promise<{ battle_id: string; theme: string }> {
  // Select random active bot persona
  const { data: botPersonas, error: botError } = await supabase
    .from('bot_personas')
    .select('id')
    .eq('is_active', true);
  
  if (botError || !botPersonas || botPersonas.length === 0) {
    throw new Error('No active bot personas found');
  }
  
  const randomBot = botPersonas[Math.floor(Math.random() * botPersonas.length)];
  
  // Generate theme
  const themes = [
    'Overcome an impossible challenge',
    'Turn weakness into strength',
    'The calm before the storm',
    'Victory from the jaws of defeat',
    'Precision over power',
  ];
  const theme = themes[Math.floor(Math.random() * themes.length)];
  
  // Create battle with bot opponent
  const { data: battleId, error: createError } = await supabase.rpc('create_bot_battle', {
    p_player_one_id: playerId,
    p_character_id: characterId,
    p_bot_persona_id: randomBot.id,
    p_mode: mode,
    p_theme: theme,
  });
  
  if (createError || !battleId) {
    console.error('Failed to create bot battle:', createError);
    throw new Error('Failed to create bot battle');
  }
  
  return { battle_id: battleId, theme };
}

/**
 * Convert an existing 'created' battle to a bot battle (60s+ fallback)
 */
async function convertToBotBattle(
  supabase: ReturnType<typeof createServiceClient>,
  battleId: string
): Promise<{ theme: string }> {
  // Select random active bot persona
  const { data: botPersonas, error: botError } = await supabase
    .from('bot_personas')
    .select('id')
    .eq('is_active', true);
  
  if (botError || !botPersonas || botPersonas.length === 0) {
    throw new Error('No active bot personas found');
  }
  
  const randomBot = botPersonas[Math.floor(Math.random() * botPersonas.length)];
  
  // Generate theme
  const themes = [
    'Overcome an impossible challenge',
    'Turn weakness into strength',
    'The calm before the storm',
    'Victory from the jaws of defeat',
    'Precision over power',
  ];
  const theme = themes[Math.floor(Math.random() * themes.length)];
  
  // Convert battle to bot battle (idempotent: only updates if status is still 'created')
  const { data: battle, error: updateError } = await supabase
    .from('battles')
    .update({
      is_player_two_bot: true,
      bot_persona_id: randomBot.id,
      status: 'matched',
      theme,
      theme_revealed_at: new Date().toISOString(),
      matched_at: new Date().toISOString(),
      player_one_prompt_deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h for ranked
    })
    .eq('id', battleId)
    .eq('status', 'created') // Only convert if still in created state
    .select('id')
    .single();
  
  if (updateError || !battle) {
    // Battle may have been matched to a human in the meantime, fetch and return current state
    const { data: currentBattle } = await supabase
      .from('battles')
      .select('theme')
      .eq('id', battleId)
      .single();
    
    return { theme: currentBattle?.theme || theme };
  }
  
  return { theme };
}

interface MatchmakingRequest {
  character_id: string;
  mode?: BattleMode;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const userId = await getAuthUserId(req);
    const { character_id, mode = 'ranked' }: MatchmakingRequest = await req.json();
    
    if (!character_id) {
      return errorResponse('character_id required');
    }
    
    const supabase = createServiceClient();
    
    // Validate character belongs to user
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('*')
      .eq('id', character_id)
      .eq('profile_id', userId)
      .single();
    
    if (charError || !character) {
      return errorResponse('Invalid character');
    }
    
    // Get user profile for matchmaking
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, rating, rating_deviation, total_battles')
      .eq('id', userId)
      .single();
    
    if (profileError || !profile) {
      return errorResponse('Profile not found');
    }
    
    // Newbie check (under 10 ranked battles)
    const isNewbie = profile.total_battles < 10;
    
    // Check if bot battle required (explicit mode='bot' or first battle)
    const requiresBotBattle = mode === 'bot' || profile.total_battles === 0;
    
    if (requiresBotBattle) {
      // Create bot battle immediately
      const botBattle = await createBotBattle(supabase, userId, character_id, mode);
      return successResponse({
        battle_id: botBattle.battle_id,
        matched: true,
        theme: botBattle.theme,
        is_bot_battle: true,
      });
    }
    
    // Check if user already has an active 'created' battle for this mode/character
    const { data: existingBattle } = await supabase
      .from('battles')
      .select('id, created_at, mode, player_one_character_id')
      .eq('player_one_id', userId)
      .eq('status', 'created')
      .eq('mode', mode)
      .eq('player_one_character_id', character_id)
      .single();
    
    if (existingBattle) {
      const battleAge = Date.now() - new Date(existingBattle.created_at).getTime();
      const ageSeconds = battleAge / 1000;
      
      if (ageSeconds >= 60) {
        // Battle is 60+ seconds old, convert to bot battle
        const botBattle = await convertToBotBattle(supabase, existingBattle.id);
        return successResponse({
          battle_id: existingBattle.id,
          matched: true,
          theme: botBattle.theme,
          is_bot_battle: true,
          converted_from_queue: true,
        });
      } else {
        // Battle is younger than 60 seconds, return it for client to continue waiting
        return successResponse({
          battle_id: existingBattle.id,
          matched: false,
          theme: null,
          message: `Searching for opponent... (${Math.floor(60 - ageSeconds)}s remaining)`,
        });
      }
    }
    
    // Try to find existing battle in "created" status from other players
    let matchedBattle = null;
    
    if (mode === 'ranked') {
      // Matchmaking band: ±50 initially, can widen to ±400
      const ratingBand = 50;
      const minRating = profile.rating - ratingBand;
      const maxRating = profile.rating + ratingBand;
      
      const { data: waitingBattles } = await supabase
        .from('battles')
        .select(`
          id,
          player_one_id,
          player_one_character_id,
          mode,
          created_at,
          profiles!battles_player_one_id_fkey (
            rating,
            total_battles
          )
        `)
        .eq('status', 'created')
        .eq('mode', 'ranked')
        .neq('player_one_id', userId) // Don't match with self
        .gte('profiles.rating', minRating)
        .lte('profiles.rating', maxRating)
        .order('created_at', { ascending: true })
        .limit(20); // Fetch more candidates for filtering
      
      if (waitingBattles && waitingBattles.length > 0) {
        // Filter by newbie constraint, blocks, and opponent diversity
        const eligibleCandidates = [];
        
        for (const battle of waitingBattles) {
          const opponentProfile = battle.profiles as unknown as { rating: number; total_battles: number };
          const opponentIsNewbie = opponentProfile.total_battles < 10;
          
          // Newbies only match with newbies
          if (isNewbie && !opponentIsNewbie) continue;
          if (!isNewbie && opponentIsNewbie) continue;
          
          // Check if users have blocked each other
          const { data: blockedData } = await supabase.rpc('is_blocked', {
            p_profile_id: userId,
            p_other_profile_id: battle.player_one_id,
          });
          
          if (blockedData === true) continue; // Skip blocked opponents
          
          // Check opponent diversity (max 3 ranked battles vs same opponent in 24h)
          const { data: recentBattles } = await supabase.rpc('ranked_battles_vs_opponent_24h', {
            p_profile_id: userId,
            p_opponent_id: battle.player_one_id,
          });
          
          if (recentBattles && recentBattles >= 3) continue; // Skip over-matched opponents
          
          eligibleCandidates.push(battle);
        }
        
        if (eligibleCandidates.length > 0) {
          matchedBattle = eligibleCandidates[0];
        }
      }
    }
    
    // If match found, pair players
    if (matchedBattle) {
      // Generate theme
      const themes = [
        'Overcome an impossible challenge',
        'Turn weakness into strength',
        'The calm before the storm',
        'Victory from the jaws of defeat',
        'Precision over power',
      ];
      const theme = themes[Math.floor(Math.random() * themes.length)];
      
      // Call match_battle function
      const { error: matchError } = await supabase.rpc('match_battle', {
        p_battle_id: matchedBattle.id,
        p_player_two_id: userId,
        p_player_two_character_id: character_id,
        p_theme: theme,
      });
      
      if (matchError) {
        console.error('Match error:', matchError);
        return errorResponse('Failed to match battle');
      }
      
      return successResponse({
        battle_id: matchedBattle.id,
        matched: true,
        theme,
      });
    }
    
    // No match found within 60s window, fallback to bot or create new battle
    // For MVP, always create a new battle and let another function handle bot assignment
    
    // Generate theme for new battle
    const themes = [
      'Overcome an impossible challenge',
      'Turn weakness into strength',
      'The calm before the storm',
      'Victory from the jaws of defeat',
      'Precision over power',
    ];
    const theme = themes[Math.floor(Math.random() * themes.length)];
    
    // Create battle
    const { data: battleId, error: createError } = await supabase.rpc('create_battle', {
      p_player_one_id: userId,
      p_character_id: character_id,
      p_mode: mode,
      p_friend_challenge_id: null,
    });
    
    if (createError) {
      console.error('Create battle error:', createError);
      return errorResponse('Failed to create battle');
    }
    
    return successResponse({
      battle_id: battleId,
      matched: false,
      theme: null, // Theme revealed on match
      message: 'Searching for opponent...',
    });
    
  } catch (error) {
    console.error('Matchmaking error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
