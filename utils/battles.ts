/**
 * Battle API Helpers
 * Client-safe wrappers for battle Edge Functions
 */

import { invokeAuthenticatedFunction, supabase } from './supabase';

export type BattleStatus =
  | 'created'
  | 'matched'
  | 'waiting_for_prompts'
  | 'resolving'
  | 'result_ready'
  | 'generating_video'
  | 'completed'
  | 'expired'
  | 'canceled'
  | 'moderation_failed'
  | 'generation_failed';

export type BattleMode =
  | 'ranked'
  | 'unranked'
  | 'friend_challenge'
  | 'daily_theme'
  | 'bot';
export type MoveType = 'attack' | 'defense' | 'finisher';

export interface MatchmakingResult {
  battle_id: string;
  matched: boolean;
  theme?: string;
  message?: string;
  opponent_name?: string;
}

export interface SubmitPromptResult {
  success: boolean;
  prompt_id?: string;
  battle_status?: BattleStatus;
  message?: string;
  error?: string;
}

export interface AppealBattleResult {
  success: boolean;
  appeal_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface ResolveBattleResult {
  battle_id?: string;
  winner_id?: string | null;
  is_draw?: boolean;
  explanation?: string;
  score_diff?: number;
  error?: string;
}

/**
 * Start matchmaking for a battle
 */
export async function startMatchmaking(
  characterId: string,
  mode: BattleMode = 'ranked',
): Promise<MatchmakingResult> {
  try {
    const data = await invokeAuthenticatedFunction<MatchmakingResult>(
      'matchmaking',
      {
        character_id: characterId,
        mode,
      },
    );

    return {
      battle_id: data.battle_id,
      matched: data.matched,
      theme: data.theme,
      message: data.message,
      opponent_name: data.opponent_name,
    };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Matchmaking error');
  }
}

/**
 * Submit a prompt for a battle
 */
export async function submitPrompt(
  battleId: string,
  moveType: MoveType,
  promptTemplateId?: string,
  customPromptText?: string,
): Promise<SubmitPromptResult> {
  try {
    const data = await invokeAuthenticatedFunction<SubmitPromptResult>(
      'submit-prompt',
      {
        battle_id: battleId,
        move_type: moveType,
        prompt_template_id: promptTemplateId,
        custom_prompt_text: customPromptText,
      },
    );

    return {
      success: data.success ?? false,
      prompt_id: data.prompt_id,
      battle_status: data.battle_status,
      message: data.message,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Appeal a battle result (ranked losses only, 1/day cap)
 */
export async function appealBattle(
  battleId: string,
): Promise<AppealBattleResult> {
  try {
    const data = await invokeAuthenticatedFunction<AppealBattleResult>(
      'appeal-battle',
      {
        battle_id: battleId,
      },
    );

    return {
      success: data.success ?? false,
      appeal_id: data.appeal_id,
      status: data.status,
      message: data.message,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Retry server-side battle resolution for a stuck resolving battle.
 */
export async function retryBattleResolution(
  battleId: string,
): Promise<ResolveBattleResult> {
  try {
    return await invokeAuthenticatedFunction<ResolveBattleResult>(
      'resolve-battle',
      {
        battle_id: battleId,
      },
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resolve battle',
    };
  }
}

/**
 * Get a battle by ID (with RLS)
 */
export async function getBattle(battleId: string) {
  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to fetch battle');
  }

  return data;
}

/**
 * Get battles for current user
 */
export async function getMyBattles(limit = 20) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('battles')
    .select(
      '*, player_one:profiles!battles_player_one_id_fkey(username, display_name), player_two:profiles!battles_player_two_id_fkey(username, display_name)',
    )
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to fetch battles');
  }

  return data;
}

/**
 * Get prompt templates
 */
export async function getPromptTemplates(category?: string) {
  let query = supabase.from('prompt_templates').select('*').order('category');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch templates');
  }

  return data;
}

/**
 * Get daily theme
 */
export async function getDailyTheme() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_themes')
    .select('*')
    .eq('theme_date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Failed to fetch daily theme');
  }

  return data;
}

/**
 * Get daily quests for current user
 */
export async function getDailyQuests() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('player_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('profile_id', user.id)
    .eq('quest_date', today)
    .order('quest_date', { ascending: false });

  if (error) {
    console.error('Failed to fetch daily quests:', error);
    return [];
  }

  return data;
}
