/**
 * Battle list rows: the queries and the pure shaping that the Arena and
 * Battles tabs share.
 *
 * The two screens used to each slice `getMyBattles()`, filter "active" with
 * their own (different) status lists, name the opponent with their own
 * fallbacks and print the raw enum through `replace(/_/g, ' ')`. Everything
 * viewer-relative lives here so it can be pinned by tests without a screen.
 */

import type { Href } from 'expo-router';
import { supabase } from './supabase';
import { FINAL_BATTLE_STATUSES, hasOpponent } from './battles';
import {
  battleOutcomeFor,
  battleStatusView,
  opponentNameFor,
  type BattleOutcome,
  type BattleStatusView,
} from './battleCopy';

export interface BattleListProfile {
  username?: string | null;
  display_name?: string | null;
}

export interface BattleListRound {
  round_number: number;
  player_one_locked_at: string | null;
  player_two_locked_at: string | null;
}

/** The columns a list row reads. Extra columns from `*` are tolerated. */
export interface BattleListRow {
  id: string;
  status: string;
  mode?: string | null;
  format?: string | null;
  theme?: string | null;
  created_at: string;
  current_round?: number | null;
  player_one_id: string;
  player_two_id?: string | null;
  is_player_two_bot?: boolean | null;
  bot_persona_id?: string | null;
  winner_id?: string | null;
  is_draw?: boolean | null;
  /** First-lock timestamps on `battles` (accurate for round 1 only). */
  player_one_locked_at?: string | null;
  player_two_locked_at?: string | null;
  player_one?: BattleListProfile | null;
  player_two?: BattleListProfile | null;
  /** Per-round lock timestamps, for Bo3 rounds after the first. */
  rounds?: BattleListRound[] | null;
}

const BATTLE_LIST_SELECT = [
  '*',
  'player_one:profiles!battles_player_one_id_fkey(username, display_name)',
  'player_two:profiles!battles_player_two_id_fkey(username, display_name)',
  'rounds:battle_rounds(round_number, player_one_locked_at, player_two_locked_at)',
].join(', ');

/** Whether a battle is still live (not in a status it never leaves). */
export function isActiveBattleStatus(status: string): boolean {
  return !(FINAL_BATTLE_STATUSES as readonly string[]).includes(status);
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/**
 * The viewer's live battles, newest first, filtered server-side to the
 * statuses a battle can still leave. Sort with `sortBattlesForList` to put
 * the rows that need the player on top.
 */
export async function getActiveBattles(limit = 10): Promise<BattleListRow[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('battles')
    .select(BATTLE_LIST_SELECT)
    .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
    .not('status', 'in', `(${FINAL_BATTLE_STATUSES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Failed to fetch active battles');
  return (data ?? []) as unknown as BattleListRow[];
}

/** Every battle the viewer took part in, newest first. */
export async function getBattleHistory(limit = 50): Promise<BattleListRow[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('battles')
    .select(BATTLE_LIST_SELECT)
    .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Failed to fetch battles');
  return (data ?? []) as unknown as BattleListRow[];
}

type Side = 'one' | 'two';

function sideOf(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): Side | null {
  if (!myProfileId) return null;
  if (battle.player_one_id === myProfileId) return 'one';
  if (battle.player_two_id === myProfileId) return 'two';
  return null;
}

/**
 * Whether the viewer has locked a prompt for the battle's current round.
 *
 * Round rows carry per-round timestamps; the `battles` columns only record the
 * FIRST lock, so they are trusted for round 1 alone. Without either, the
 * player is assumed not to have locked — "Your turn" is the safer wrong
 * answer, since tapping through lands on a screen that knows the truth.
 */
export function iHaveLockedIn(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): boolean {
  const side = sideOf(battle, myProfileId);
  if (!side) return false;
  const key = side === 'one' ? 'player_one_locked_at' : 'player_two_locked_at';
  const currentRound = battle.current_round ?? 1;
  const round = battle.rounds?.find((r) => r.round_number === currentRound);
  if (round?.[key]) return true;
  if (currentRound === 1) return Boolean(battle[key]);
  return false;
}

export interface BattleRowView {
  opponentName: string;
  status: BattleStatusView;
  outcome: BattleOutcome;
  iHaveLocked: boolean;
}

/** Everything a list row says about a battle, from the viewer's side. */
export function describeBattleRow(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): BattleRowView {
  const side = sideOf(battle, myProfileId);
  const iHaveLocked = iHaveLockedIn(battle, myProfileId);
  const outcome = battleOutcomeFor(battle, myProfileId);
  const status = battleStatusView({
    status: battle.status,
    iHaveLocked,
    outcome,
  });

  // Bots are always player two, so only player one ever faces one.
  const opponentIsBot = side !== 'two' && battle.is_player_two_bot === true;
  const opponent = side === 'two' ? battle.player_one : battle.player_two;
  const opponentName = opponentNameFor({
    isBot: opponentIsBot,
    botName: null,
    opponentName: opponent?.display_name || opponent?.username || null,
    hasOpponent: side === 'two' ? true : hasOpponent(battle),
  });

  return { opponentName, status, outcome, iHaveLocked };
}

/**
 * Rows the player must act on first, then newest first. Stable, so equal
 * rows keep the order the server sent.
 */
export function sortBattlesForList<T extends BattleListRow>(
  rows: readonly T[],
  myProfileId: string | null | undefined,
): T[] {
  return rows
    .map((row, index) => ({
      row,
      index,
      actionable: describeBattleRow(row, myProfileId).status.actionable,
      createdAt: Date.parse(row.created_at) || 0,
    }))
    .sort((a, b) => {
      if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * Where tapping a row goes, or `null` when there is nowhere useful to go
 * (timed-out and cancelled battles have no result to show).
 */
export function battleRouteFor(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): Href | null {
  switch (battle.status) {
    case 'waiting_for_prompts':
      return iHaveLockedIn(battle, myProfileId)
        ? `/(battle)/waiting?battleId=${battle.id}`
        : `/(battle)/move-select?battleId=${battle.id}&round=${battle.current_round ?? 1}`;
    case 'result_ready':
    case 'generating_video':
    case 'completed':
    case 'moderation_failed':
    case 'generation_failed':
      return `/(battle)/result?battleId=${battle.id}`;
    case 'expired':
    case 'canceled':
      return null;
    default:
      return `/(battle)/waiting?battleId=${battle.id}`;
  }
}

/** The themed colour for a status chip's tone. */
export function statusToneColor(
  tone: BattleStatusView['tone'],
  colors: {
    primary: string;
    success: string;
    warning: string;
    error: string;
    textSecondary: string;
  },
): string {
  switch (tone) {
    case 'primary':
      return colors.primary;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'error':
      return colors.error;
    default:
      return colors.textSecondary;
  }
}
