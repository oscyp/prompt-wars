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
import { orientSeriesScore } from '@/components/SeriesScoreIndicator';
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
  /** Bo3 series columns; absent or null on legacy single-format rows. */
  best_of?: number | null;
  player_one_rounds_won?: number | null;
  player_two_rounds_won?: number | null;
  is_ko?: boolean | null;
  /** Frozen at resolve time; the one client-readable copy of both fighters. */
  tier0_reveal_payload?: unknown;
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

export interface ArenaBattlePriority<T extends BattleListRow = BattleListRow> {
  /** The single battle promoted to Arena's primary action. */
  primary: T | null;
  /** Every other live battle, in normal list priority order. */
  remaining: T[];
}

/**
 * Promote one actionable battle on Arena without repeating the same row in
 * the list below it. When nothing needs the player, all rows remain visible
 * and the daily-theme battle action stays primary.
 */
export function arenaBattlePriority<T extends BattleListRow>(
  rows: readonly T[],
  myProfileId: string | null | undefined,
): ArenaBattlePriority<T> {
  const sorted = sortBattlesForList(rows, myProfileId);
  const primaryIndex = sorted.findIndex(
    (row) => describeBattleRow(row, myProfileId).status.actionable,
  );
  if (primaryIndex < 0) return { primary: null, remaining: sorted };

  return {
    primary: sorted[primaryIndex],
    remaining: sorted.filter((_, index) => index !== primaryIndex),
  };
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

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type BattleSectionKey = 'yourTurn' | 'inProgress' | 'finished';

export interface BattleListSection<T extends BattleListRow = BattleListRow> {
  key: BattleSectionKey;
  title: string;
  data: T[];
}

export const BATTLE_SECTION_TITLES: Record<BattleSectionKey, string> = {
  yourTurn: 'Your turn',
  inProgress: 'In progress',
  finished: 'Finished',
};

const BATTLE_SECTION_ORDER: readonly BattleSectionKey[] = [
  'yourTurn',
  'inProgress',
  'finished',
];

/**
 * The Battles tab's three sections, in order, each newest first. "Your turn"
 * is every live row the player can act on; "Finished" is every row in a status
 * it never leaves; the rest is "In progress". Empty sections are omitted.
 */
export function groupBattlesForList<T extends BattleListRow>(
  rows: readonly T[],
  myProfileId: string | null | undefined,
): BattleListSection<T>[] {
  const buckets: Record<BattleSectionKey, T[]> = {
    yourTurn: [],
    inProgress: [],
    finished: [],
  };
  for (const row of sortBattlesForList(rows, myProfileId)) {
    if (!isActiveBattleStatus(row.status)) buckets.finished.push(row);
    else if (describeBattleRow(row, myProfileId).status.actionable)
      buckets.yourTurn.push(row);
    else buckets.inProgress.push(row);
  }
  return BATTLE_SECTION_ORDER.filter((key) => buckets[key].length > 0).map(
    (key) => ({ key, title: BATTLE_SECTION_TITLES[key], data: buckets[key] }),
  );
}

/** "Your turn, 2 battles" — the section header as one spoken phrase. */
export function battleSectionLabel(section: {
  title: string;
  data: readonly unknown[];
}): string {
  const n = section.data.length;
  return `${section.title}, ${n} ${n === 1 ? 'battle' : 'battles'}`;
}

// ---------------------------------------------------------------------------
// Series (Bo3)
// ---------------------------------------------------------------------------

export interface SeriesScore {
  mine: number;
  theirs: number;
}

/**
 * Rounds won from the viewer's side, or null for a single-format row, which
 * has no series to score.
 */
export function seriesScoreFor(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): SeriesScore | null {
  if (battle.format !== 'bo3') return null;
  const side = sideOf(battle, myProfileId);
  return orientSeriesScore(
    {
      p1: battle.player_one_rounds_won ?? 0,
      p2: battle.player_two_rounds_won ?? 0,
    },
    side === 'two' ? 'p2' : 'p1',
  );
}

/** "2–0" (en dash), the series score as a row prints it. */
export function seriesLabel(score: SeriesScore): string {
  return `${score.mine}–${score.theirs}`;
}

export interface RoundProgress extends SeriesScore {
  round: number;
  bestOf: number;
}

/**
 * Where a live Bo3 battle stands: the round being played and the series
 * score. Null for single-format rows.
 */
export function roundProgressFor(
  battle: BattleListRow,
  myProfileId: string | null | undefined,
): RoundProgress | null {
  const score = seriesScoreFor(battle, myProfileId);
  if (!score) return null;
  const bestOf = Math.max(1, battle.best_of ?? 3);
  const round = Math.max(1, Math.min(battle.current_round ?? 1, bestOf));
  return { ...score, round, bestOf };
}

/** "Round 2 of 3 · 1–0" */
export function roundProgressText(progress: RoundProgress): string {
  return `Round ${progress.round} of ${progress.bestOf} · ${seriesLabel(progress)}`;
}

/** "Round 2 of 3, 1–0" — the same fact for a screen reader. */
export function roundProgressSpoken(progress: RoundProgress): string {
  return `Round ${progress.round} of ${progress.bestOf}, ${seriesLabel(progress)}`;
}

// ---------------------------------------------------------------------------
// Opponents
// ---------------------------------------------------------------------------

/**
 * The distinct human opponents across a list, for one public-players read.
 * Bots have no profile; a viewer not in a row contributes nothing for it.
 */
export function opponentProfileIds(
  rows: readonly BattleListRow[],
  myProfileId: string | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const side = sideOf(row, myProfileId);
    if (!side) continue;
    if (side === 'one' && row.is_player_two_bot === true) continue;
    const opponentId =
      side === 'two' ? row.player_one_id : (row.player_two_id ?? null);
    if (opponentId && opponentId !== myProfileId) ids.add(opponentId);
  }
  return Array.from(ids);
}
