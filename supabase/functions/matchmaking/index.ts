// Matchmaking Edge Function
// Pairs players for battles with newbie bucket, rating bands, and bot fallback

import { createServiceClient, corsHeaders, errorResponse, successResponse, getAuthUserId } from '../_shared/utils.ts';
import { BattleMode } from '../_shared/types.ts';
import { startFaceOff } from '../_shared/start-face-off.ts';

const THEMES = [
  'Overcome an impossible challenge',
  'Turn weakness into strength',
  'The calm before the storm',
  'Victory from the jaws of defeat',
  'Precision over power',
];

const RANKED_FINISHED_STATUSES = [
  'completed',
  'result_ready',
  'generating_video',
  'generation_failed',
];

const QUEUE_MATCH_WINDOW_MS = 5 * 60 * 1000;

function pickTheme(): string {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

async function getRankedBattleCount(
  supabase: ReturnType<typeof createServiceClient>,
  profileId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('battles')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'ranked')
    .in('status', RANKED_FINISHED_STATUSES)
    .or(`player_one_id.eq.${profileId},player_two_id.eq.${profileId}`);

  if (error) {
    console.error('Failed to count ranked battles:', error);
    return 0;
  }

  return count ?? 0;
}

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
  
  const theme = pickTheme();
  
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
  
  const theme = pickTheme();
  
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
    
    // Newbie check is based on ranked battles, not total battles. Total battles
    // includes bots/unranked and can incorrectly push a player out of the
    // ranked newbie bucket.
    const rankedBattleCount = await getRankedBattleCount(supabase, userId);
    const isNewbie = rankedBattleCount < 10;

    // Explicit bot mode starts immediately. Ranked/unranked only fall back to
    // bots after queue timeout and after checking for human candidates.
    if (mode === 'bot') {
      // Create bot battle immediately
      const botBattle = await createBotBattle(supabase, userId, character_id, mode);
      // Bo3 face-off writer (no-op for single-format bot battles).
      await startFaceOff(supabase, botBattle.battle_id);
      return successResponse({
        battle_id: botBattle.battle_id,
        matched: true,
        theme: botBattle.theme,
        is_bot_battle: true,
      });
    }

    const queueCutoffIso = new Date(
      Date.now() - QUEUE_MATCH_WINDOW_MS,
    ).toISOString();
    
    // Check if user already has an active 'created' battle for this mode/character.
    // Do not convert it to a bot yet; first try to claim an eligible human
    // opponent. The previous order caused two waiting users to each convert
    // their own queued battle to a bot at the 60s retry mark.
    const { data: existingBattle } = await supabase
      .from('battles')
      .select('id, created_at, mode, player_one_character_id')
      .eq('player_one_id', userId)
      .eq('status', 'created')
      .eq('mode', mode)
      .eq('player_one_character_id', character_id)
      .gte('created_at', queueCutoffIso)
      .maybeSingle();

    const findWaitingBattle = async (
      createdBefore?: string,
      createdAfter?: string,
    ) => {
      if (mode === 'ranked') {
      // Matchmaking band: ±50 initially, can widen to ±400
      const ratingBand = 50;
      const minRating = profile.rating - ratingBand;
      const maxRating = profile.rating + ratingBand;

      // NOTE: `profiles!inner(...)` is required so PostgREST applies the
      // `gte/lte` predicates to the parent `battles` rows (inner join).
      // Without `!inner`, battles outside the band would still be returned
      // with the embedded profile hidden.
      let query = supabase
        .from('battles')
        .select(`
          id,
          player_one_id,
          player_one_character_id,
          mode,
          created_at,
          profiles!battles_player_one_id_fkey!inner (
            rating,
            total_battles
          )
        `)
        .eq('status', 'created')
        .eq('mode', 'ranked')
        .neq('player_one_id', userId) // Don't match with self
        .gte('created_at', queueCutoffIso)
        .gte('profiles.rating', minRating)
        .lte('profiles.rating', maxRating);

      if (createdBefore) query = query.lt('created_at', createdBefore);
      if (createdAfter) query = query.gt('created_at', createdAfter);

      const { data: waitingBattles } = await query
        .order('created_at', { ascending: true })
        .limit(20); // Fetch more candidates for filtering

      if (waitingBattles && waitingBattles.length > 0) {
        // Filter by newbie constraint, blocks, and opponent diversity
        for (const battle of waitingBattles) {
          const opponentRankedBattleCount = await getRankedBattleCount(
            supabase,
            battle.player_one_id,
          );
          const opponentIsNewbie = opponentRankedBattleCount < 10;

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

          return battle;
        }
      }

      return null;
    }

    if (mode === 'unranked') {
      // Unranked: pair with the oldest waiting unranked battle from any other
      // player. No rating band, no newbie constraint. Still respect blocks.
      let query = supabase
        .from('battles')
        .select('id, player_one_id, player_one_character_id, mode, created_at')
        .eq('status', 'created')
        .eq('mode', 'unranked')
        .neq('player_one_id', userId)
        .gte('created_at', queueCutoffIso);

      if (createdBefore) query = query.lt('created_at', createdBefore);
      if (createdAfter) query = query.gt('created_at', createdAfter);

      const { data: waitingBattles } = await query
        .order('created_at', { ascending: true })
        .limit(20);

      if (waitingBattles && waitingBattles.length > 0) {
        for (const battle of waitingBattles) {
          const { data: blockedData } = await supabase.rpc('is_blocked', {
            p_profile_id: userId,
            p_other_profile_id: battle.player_one_id,
          });
          if (blockedData === true) continue;

          return battle;
        }
      }

      return null;
    }

      return null;
    };

    // If this user already has a queued battle, only claim older waiting rows.
    // This deterministic ordering prevents two users who both have queued rows
    // from cross-matching each other into duplicate battles.
    const matchedBattle = await findWaitingBattle(existingBattle?.created_at);
    
    // If match found, pair players
    if (matchedBattle) {
      const theme = pickTheme();
      
      // Call match_battle function
      const { data: didMatch, error: matchError } = await supabase.rpc('match_battle', {
        p_battle_id: matchedBattle.id,
        p_player_two_id: userId,
        p_player_two_character_id: character_id,
        p_theme: theme,
      });
      
      if (matchError) {
        console.error('Match error:', matchError);
        return errorResponse('Failed to match battle');
      }

      if (didMatch === true) {
        if (existingBattle) {
          await supabase
            .from('battles')
            .update({ status: 'canceled' })
            .eq('id', existingBattle.id)
            .eq('status', 'created');
        }

        // Bo3 face-off writer (no-op for single-format).
        await startFaceOff(supabase, matchedBattle.id);

        return successResponse({
          battle_id: matchedBattle.id,
          matched: true,
          theme,
          is_bot_battle: false,
        });
      }

      console.warn('Candidate battle was no longer claimable:', matchedBattle.id);
    }

    if (existingBattle) {
      const battleAge = Date.now() - new Date(existingBattle.created_at).getTime();
      const ageSeconds = battleAge / 1000;

      if (ageSeconds >= 60) {
        // If a newer eligible player is waiting, keep this older row available
        // so that user's next retry can claim it. Otherwise both sides can
        // convert themselves to bots instead of forming a human match.
        const newerWaitingBattle = await findWaitingBattle(
          undefined,
          existingBattle.created_at,
        );
        if (newerWaitingBattle) {
          return successResponse({
            battle_id: existingBattle.id,
            matched: false,
            theme: null,
            message: 'Opponent found. Waiting for their device to connect...',
          });
        }

        const botBattle = await convertToBotBattle(supabase, existingBattle.id);
        await startFaceOff(supabase, existingBattle.id);
        return successResponse({
          battle_id: existingBattle.id,
          matched: true,
          theme: botBattle.theme,
          is_bot_battle: true,
          converted_from_queue: true,
        });
      }

      return successResponse({
        battle_id: existingBattle.id,
        matched: false,
        theme: null,
        message: `Searching for opponent... (${Math.max(1, Math.floor(60 - ageSeconds))}s remaining)`,
      });
    }
    
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

    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
