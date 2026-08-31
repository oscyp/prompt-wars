/**
 * Battle API Helpers
 * Client-safe wrappers for battle Edge Functions
 */

import {
  FunctionInvokeError,
  invokeAuthenticatedFunction,
  invokeFunctionResult,
  supabase,
} from './supabase';
import { formatCredits } from './credits';
import type { BattleFormat } from '@/types/battle';

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

/**
 * Statuses a battle never leaves. Anything else means the battle is still live.
 *
 * This is the exact list the Edge Functions use to decide whether a character
 * is locked (`assertNoActiveBattleForCharacter`, `edit-character`,
 * `regenerate-portrait`, `restore-portrait`). Client-side checks must use the
 * same list: the home screen's shorter one omits the two failure states, which
 * would leave a character looking locked forever after a moderation failure.
 */
export const FINAL_BATTLE_STATUSES: readonly BattleStatus[] = [
  'completed',
  'expired',
  'canceled',
  'moderation_failed',
  'generation_failed',
];

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
  is_bot_battle?: boolean;
  converted_from_queue?: boolean;
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

export interface LeaveBattleResult {
  success: boolean;
  action?: 'canceled' | 'forfeited' | 'already_terminal';
  winner_id?: string;
  /** 0 when the exit was free, i.e. before this player locked a prompt. */
  credits_charged?: number;
  /** Machine-readable failure, so the UI never matches on prose. */
  code?: 'insufficient_credits' | 'battle_in_progress' | 'not_participant';
  price?: number;
  balance?: number;
  shortfall?: number;
  error?: string;
}

export interface LeaveDialogCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface LeaveDialogArgs {
  format: BattleFormat;
  mode: BattleMode;
  isBot: boolean;
  /** Whether THIS player has locked a prompt — the thing being paid for. */
  isLocked: boolean;
  price: number;
}

/**
 * What the confirm dialog says before someone leaves.
 *
 * Pure so it can be tested without mounting a screen, and so the free-path
 * strings can be pinned byte-for-byte: those two dialogs shipped long before
 * the toll existed and players have learned them, so adding a paid case must
 * not quietly reword the free ones.
 *
 * The price goes in the message, never the title, and always in the `sentence`
 * form ("2 credits", not "2 cr") — these are dialogs, and utils/credits.ts owns
 * that distinction.
 */
export function leaveDialogCopy(args: LeaveDialogArgs): LeaveDialogCopy {
  const isRankedHuman = args.mode === 'ranked' && !args.isBot;

  if (!args.isLocked) {
    if (isRankedHuman) {
      return {
        title: 'Forfeit Ranked Battle?',
        message:
          'This will count as a ranked loss and award the win to your opponent.',
        confirmLabel: 'Forfeit',
      };
    }
    return {
      title: 'Leave Battle?',
      message: 'This will cancel the battle before prompt lock.',
      confirmLabel: 'Leave',
    };
  }

  const cost = formatCredits(args.price, 'sentence');
  const stake =
    args.format === 'bo3'
      ? 'Your opponent takes the whole series and your streak resets.'
      : 'Your opponent takes the win and your streak resets.';
  // Appended as a clause rather than a third sentence: a two-line dialog gets
  // read, a four-line one gets dismissed.
  const rating = isRankedHuman ? ' Your rating will drop.' : '';

  return {
    title: args.format === 'bo3' ? 'Forfeit the series?' : 'Forfeit and leave?',
    message: `You've locked a prompt, so leaving costs ${cost}. ${stake}${rating}`,
    confirmLabel: 'Leave',
  };
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
      is_bot_battle: data.is_bot_battle,
      converted_from_queue: data.converted_from_queue,
    };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Matchmaking error');
  }
}

/**
 * Leave a battle. Free before this player locks a prompt, charged after.
 *
 * Ranked human matches become forfeits that award the opponent the win;
 * unranked, bot and unmatched battles are canceled. The server decides which,
 * and decides the price — this only reports back what happened.
 *
 * A failure is returned rather than thrown, and it carries the structured
 * `code`/`shortfall` off the 402 so the caller can offer the shop instead of
 * matching on the error prose.
 */
export async function leaveBattle(
  battleId: string,
): Promise<LeaveBattleResult> {
  try {
    return await invokeAuthenticatedFunction<LeaveBattleResult>(
      'leave-battle',
      { battle_id: battleId },
    );
  } catch (err) {
    if (err instanceof FunctionInvokeError) {
      const body = (err.body ?? {}) as Record<string, unknown>;
      return {
        success: false,
        error: err.message,
        code: body.code as LeaveBattleResult['code'],
        price: typeof body.price === 'number' ? body.price : undefined,
        balance: typeof body.balance === 'number' ? body.balance : undefined,
        shortfall:
          typeof body.shortfall === 'number' ? body.shortfall : undefined,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to leave battle',
    };
  }
}

/**
 * Submit a prompt for a battle. `roundNumber` is optional and defaults on the
 * server to `battles.current_round`; single-format clients can omit it.
 *
 * Always custom text. The static `prompt_templates` library is retired -- the
 * arena offers per-fighter generated suggestions instead, and a suggestion has
 * no template row to reference. `submit-prompt` still accepts
 * `prompt_template_id` for the battles that were fought with one, but nothing
 * in the app sends it any more.
 */
export async function submitPrompt(
  battleId: string,
  moveType: MoveType,
  customPromptText: string,
  roundNumber?: number,
): Promise<SubmitPromptResult> {
  try {
    const data = await invokeAuthenticatedFunction<SubmitPromptResult>(
      'submit-prompt',
      {
        battle_id: battleId,
        move_type: moveType,
        custom_prompt_text: customPromptText,
        round_number: roundNumber,
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

export interface MoveSuggestion {
  title: string;
  body: string;
}

export interface MoveSuggestionSet {
  id: string;
  suggestions: MoveSuggestion[];
  isPaid: boolean;
  creditsSpent: number;
}

export type MoveSuggestionFailure =
  | 'insufficient_credits'
  | 'rate_limited'
  | 'unavailable'
  | 'failed';

export interface MoveSuggestionResult {
  set: MoveSuggestionSet | null;
  failure: MoveSuggestionFailure | null;
  message: string | null;
}

/**
 * Reads suggestion sets ALREADY generated for this (battle, round, move type).
 *
 * This exists to stop the arena from charging a player for simply walking back
 * into the screen. `generateMoveSuggestions` spends the free slot on its first
 * call and charges a credit on every call after -- so calling it on mount
 * would bill someone for navigating back from prompt-entry and forward again.
 * Mount reads; only an explicit reroll generates.
 *
 * Owner-only under RLS (`move_prompt_suggestions_select_own`), and the client
 * holds SELECT and nothing else, so this cannot be used to see an opponent's
 * suggestions or to forge one.
 */
export async function getMoveSuggestions(
  battleId: string,
  moveType: MoveType,
  roundNumber: number,
): Promise<MoveSuggestion[]> {
  try {
    const { data, error } = await supabase
      .from('move_prompt_suggestions')
      .select('suggestions, created_at, moderation_status')
      .eq('battle_id', battleId)
      .eq('round_number', roundNumber)
      .eq('move_type', moveType)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) {
      if (error) console.error('Move suggestions read error:', error);
      return [];
    }

    const row = data[0] as {
      suggestions?: unknown;
      moderation_status?: string | null;
    };
    // A rejected set must not resurface on a later visit.
    if (row.moderation_status === 'rejected') return [];
    return Array.isArray(row.suggestions)
      ? (row.suggestions as MoveSuggestion[])
      : [];
  } catch (err) {
    console.error('Move suggestions read exception:', err);
    return [];
  }
}

/**
 * Three prompt suggestions written for this player's fighter.
 *
 * The FIRST set per (battle, round, move type) is free; the server decides
 * that, not this call -- there is no "is this free" parameter, because a
 * client-asserted answer would be both racy and trivially forged. The returned
 * `isPaid` reports what actually happened.
 *
 * Failures are classified rather than thrown: the arena has a working fallback
 * (the static templates), so an outage here should degrade the screen, not
 * break it. Only `insufficient_credits` needs a distinct message to the player.
 */
export async function generateMoveSuggestions(
  battleId: string,
  moveType: MoveType,
  roundNumber: number,
): Promise<MoveSuggestionResult> {
  const { data, error } = await invokeFunctionResult<{
    ok?: boolean;
    data?: {
      id: string;
      suggestions: MoveSuggestion[];
      is_paid: boolean;
      credits_spent: number;
    };
    error?: { code?: string; message?: string };
  }>('generate-move-suggestions', {
    battle_id: battleId,
    move_type: moveType,
    round_number: roundNumber,
  });

  if (error || !data) {
    // invokeAuthenticatedFunction surfaces a non-2xx as a thrown error, so a
    // 402 arrives here as a message rather than a parsed body. Match on the
    // code we send so the paywall case stays distinguishable from an outage.
    const message = error?.message ?? 'Suggestions unavailable';
    const failure: MoveSuggestionFailure = message.includes(
      'insufficient_credits',
    )
      ? 'insufficient_credits'
      : message.includes('rate_limited')
        ? 'rate_limited'
        : 'unavailable';
    console.error('Move suggestions error:', message);
    return { set: null, failure, message };
  }

  const payload = data.data;
  if (!payload || !Array.isArray(payload.suggestions)) {
    return {
      set: null,
      failure: 'failed',
      message: data.error?.message ?? 'Suggestions unavailable',
    };
  }

  return {
    set: {
      id: payload.id,
      suggestions: payload.suggestions,
      isPaid: Boolean(payload.is_paid),
      creditsSpent: Number(payload.credits_spent ?? 0),
    },
    failure: null,
    message: null,
  };
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

export interface OpponentMoveProfile {
  recent_moves: MoveType[];
  opponent_archetype: string | null;
  counter_win_rates: Partial<
    Record<MoveType, { total: number; wins: number; win_rate: number }>
  >;
}

/**
 * Opponent move-type profile for a battle (§7.1 legibility): last 5 move
 * types from resolved battles + per-move-type win rates vs their archetype.
 * Server-validated (participants only); returns null on any failure so the
 * prompt screen never blocks on it.
 */
export async function getOpponentMoveProfile(
  battleId: string,
): Promise<OpponentMoveProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_opponent_move_profile', {
      p_battle_id: battleId,
    });

    if (error || !data) {
      if (error) console.error('Opponent move profile error:', error);
      return null;
    }

    return data as OpponentMoveProfile;
  } catch (err) {
    console.error('Opponent move profile exception:', err);
    return null;
  }
}

export interface RivalSummary {
  rivalProfileId: string;
  displayName: string;
  username: string | null;
  battlesCount: number;
  lastBattleAt: string | null;
}

/**
 * Most-played opponents over the last 30 days (concept §5 "Rivals").
 *
 * `apply_post_battle_rewards` has been writing the `rivals` table on every
 * completed non-bot battle since the beginning, and nothing has ever read it --
 * the table, its purpose-built index and its RLS policy all existed with zero
 * client references. This is the read path.
 *
 * Note `battles_count_30d` is a monotonic counter that nothing decays, so the
 * "30d" in its name is aspirational. `last_battle_at` is filtered here so a
 * long-dormant pairing does not sit at the top of the list forever; fixing the
 * counter itself needs a server-side sweep.
 */
export async function getRivals(limit = 5): Promise<RivalSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('rivals')
    .select('rival_profile_id, battles_count_30d, last_battle_at')
    .eq('profile_id', user.id)
    .gte('last_battle_at', since)
    .order('battles_count_30d', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in(
      'id',
      data.map((r) => r.rival_profile_id),
    );

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as Record<string, string>]),
  );

  return data.map((r) => {
    const p = byId.get(r.rival_profile_id);
    return {
      rivalProfileId: r.rival_profile_id,
      displayName: p?.display_name || p?.username || 'Unknown player',
      username: p?.username ?? null,
      battlesCount: r.battles_count_30d ?? 0,
      lastBattleAt: r.last_battle_at ?? null,
    };
  });
}
