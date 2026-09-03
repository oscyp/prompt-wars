/**
 * The Stats screen's insight cards, derived from rows the client can already
 * read: the rating trend from `rating_delta_payload`, the move mix and
 * per-move win rate from the player's own prompts and round results, the
 * best-scoring prompts (the concept's prompt journal, computed here because
 * nothing on the server writes that table), and the recent-battles strip.
 *
 * Pure, so every number and every sentence is pinned by tests rather than by
 * a device pass. The screen fetches; this module never does.
 */

import type { Href } from 'expo-router';
import type { MoveType } from './battles';
import {
  battleRouteFor,
  describeBattleRow,
  type BattleListRow,
} from './battleLists';
import {
  modeLabel,
  type BattleOutcome,
  type BattleStatusView,
} from './battleCopy';
import { shortDate } from './walletView';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const MOVES_EMPTY =
  'Lock in a few prompts and your move mix appears here.';
export const BEST_PROMPTS_EMPTY =
  'Your highest-scoring prompts collect here after your first resolved rounds.';
export const TREND_EMPTY =
  'Your rating trend appears after your first ranked battle.';

export const TREND_LIMIT = 10;
export const EXCERPT_MAX = 140;
export const BEST_PROMPTS_LIMIT = 3;
export const RECENT_BATTLES_LIMIT = 5;

export const MOVE_ORDER: readonly MoveType[] = [
  'attack',
  'defense',
  'finisher',
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** `getBattleHistory` selects `*`, so the delta payload is present at runtime. */
export type StatsBattleRow = BattleListRow & { rating_delta_payload?: unknown };

export interface PromptLike {
  battle_id: string;
  round_number: number;
  move_type: MoveType | string;
  custom_prompt_text: string | null;
}

export interface RoundLike {
  battle_id: string;
  round_number: number;
  round_winner_id: string | null;
  is_draw?: boolean | null;
  player_one_score: number | string | null;
  player_two_score: number | string | null;
  is_ko?: boolean | null;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundKey(battleId: string, roundNumber: number): string {
  return `${battleId}#${roundNumber}`;
}

function indexRounds(rounds: readonly RoundLike[]): Map<string, RoundLike> {
  const byKey = new Map<string, RoundLike>();
  for (const r of rounds) byKey.set(roundKey(r.battle_id, r.round_number), r);
  return byKey;
}

/** A round with a verdict: someone won it, or it was called a draw. */
function isResolvedRound(round: RoundLike): boolean {
  return Boolean(round.round_winner_id) || round.is_draw === true;
}

function isMoveType(value: string): value is MoveType {
  return (MOVE_ORDER as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Rating trend
// ---------------------------------------------------------------------------

export interface RatingTrend {
  /** Oldest to newest, ending at the current rating. Empty when unrated. */
  points: number[];
  /** Oldest to newest; `deltas[i]` moves `points[i]` to `points[i + 1]`. */
  deltas: number[];
}

/**
 * The viewer's own delta from a battle's `rating_delta_payload`, which is
 * keyed by profile id (`{ [id]: { delta, rd, vol } }`). Null when the battle
 * carried no rating change for them (casual, bot, gated, or unresolved).
 */
export function myRatingDelta(
  battle: Pick<StatsBattleRow, 'rating_delta_payload'>,
  myId: string,
): number | null {
  const payload = battle.rating_delta_payload;
  if (!payload || typeof payload !== 'object') return null;
  const entry = (payload as Record<string, unknown>)[myId];
  if (!entry || typeof entry !== 'object') return null;
  return numberOrNull((entry as { delta?: unknown }).delta);
}

/**
 * Reconstructs the rating before each of the last `limit` rated battles by
 * walking backwards from the current rating and subtracting each delta. The
 * rating itself is never re-derived on the client — only the path to it.
 */
export function ratingTrend(
  battles: readonly StatsBattleRow[],
  myId: string,
  currentRating: number | null | undefined,
  limit: number = TREND_LIMIT,
): RatingTrend {
  const current = numberOrNull(currentRating);
  if (current === null) return { points: [], deltas: [] };

  const newestFirst = battles
    .filter((b) => b.status === 'completed')
    .map((b) => ({
      delta: myRatingDelta(b, myId),
      at: Date.parse(b.created_at) || 0,
    }))
    .filter((e): e is { delta: number; at: number } => e.delta !== null)
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, limit));

  if (newestFirst.length === 0) return { points: [], deltas: [] };

  const points: number[] = [current];
  let value = current;
  for (const { delta } of newestFirst) {
    value -= delta;
    points.push(value);
  }
  points.reverse();
  const deltas = newestFirst.map((e) => e.delta).reverse();
  return { points, deltas };
}

/** What a screen reader says for the sparkline. */
export function trendAccessibilityLabel(points: readonly number[]): string {
  const n = points.length - 1;
  if (n < 1) return TREND_EMPTY;
  const first = Math.round(points[0]);
  const last = Math.round(points[n]);
  return `Rating over your last ${n} ranked ${n === 1 ? 'battle' : 'battles'}, from ${first} to ${last}`;
}

// ---------------------------------------------------------------------------
// Move usage
// ---------------------------------------------------------------------------

export interface MoveUsage {
  move: MoveType;
  count: number;
  /** 0–1 share of all locked prompts. */
  share: number;
  wins: number;
  /** Rounds with this move that reached a verdict. */
  roundsPlayed: number;
  /** 0–1, or null before any round with this move has been resolved. */
  winRate: number | null;
}

/**
 * How the player fights: one entry per move type, always all three so an
 * unused move reads as "0%" rather than vanishing. A prompt's round counts as
 * played once it has a verdict and as won when the verdict names the player.
 * Sorted by count, ties in attack / defense / finisher order.
 */
export function moveUsage(
  prompts: readonly PromptLike[],
  rounds: readonly RoundLike[],
  myId: string,
): MoveUsage[] {
  const byRound = indexRounds(rounds);
  const tally: Record<MoveType, MoveUsage> = {
    attack: blankUsage('attack'),
    defense: blankUsage('defense'),
    finisher: blankUsage('finisher'),
  };
  let total = 0;

  for (const prompt of prompts) {
    if (!isMoveType(prompt.move_type)) continue;
    const usage = tally[prompt.move_type];
    usage.count += 1;
    total += 1;
    const round = byRound.get(roundKey(prompt.battle_id, prompt.round_number));
    if (round && isResolvedRound(round)) {
      usage.roundsPlayed += 1;
      if (round.round_winner_id === myId) usage.wins += 1;
    }
  }

  return MOVE_ORDER.map((move) => {
    const usage = tally[move];
    return {
      ...usage,
      share: total > 0 ? usage.count / total : 0,
      winRate: usage.roundsPlayed > 0 ? usage.wins / usage.roundsPlayed : null,
    };
  }).sort(
    (a, b) =>
      b.count - a.count ||
      MOVE_ORDER.indexOf(a.move) - MOVE_ORDER.indexOf(b.move),
  );
}

function blankUsage(move: MoveType): MoveUsage {
  return { move, count: 0, share: 0, wins: 0, roundsPlayed: 0, winRate: null };
}

// ---------------------------------------------------------------------------
// Best prompts
// ---------------------------------------------------------------------------

export interface BestPrompt {
  battleId: string;
  roundNumber: number;
  /** The prompt, whitespace collapsed, at most `EXCERPT_MAX` characters. */
  excerpt: string;
  /** The player's own round score. */
  score: number;
  theme: string | null;
  won: boolean;
  ko: boolean;
  route: Href;
}

/** Collapses whitespace and cuts to `max` characters with a single ellipsis. */
export function excerptOf(
  text: string | null | undefined,
  max: number = EXCERPT_MAX,
): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * The player's highest-scoring prompts across resolved rounds. Prompts whose
 * round has no verdict yet, whose battle is not in the list (so the side, and
 * therefore the score column, is unknown) or that were template picks with no
 * text of the player's own are left out.
 */
export function bestPrompts(
  prompts: readonly PromptLike[],
  battles: readonly StatsBattleRow[],
  rounds: readonly RoundLike[],
  myId: string,
  limit: number = BEST_PROMPTS_LIMIT,
): BestPrompt[] {
  const byRound = indexRounds(rounds);
  const byBattle = new Map(battles.map((b) => [b.id, b]));
  const ranked: { row: BestPrompt; at: number }[] = [];

  for (const prompt of prompts) {
    const battle = byBattle.get(prompt.battle_id);
    if (!battle) continue;
    const round = byRound.get(roundKey(prompt.battle_id, prompt.round_number));
    if (!round || !isResolvedRound(round)) continue;
    const mine =
      battle.player_one_id === myId
        ? round.player_one_score
        : battle.player_two_id === myId
          ? round.player_two_score
          : null;
    const score = numberOrNull(mine);
    if (score === null) continue;
    const excerpt = excerptOf(prompt.custom_prompt_text);
    if (!excerpt) continue;

    ranked.push({
      at: Date.parse(battle.created_at) || 0,
      row: {
        battleId: prompt.battle_id,
        roundNumber: prompt.round_number,
        excerpt,
        score,
        theme: battle.theme?.trim() || null,
        won: round.round_winner_id === myId,
        ko: round.is_ko === true,
        route: `/(battle)/result?battleId=${prompt.battle_id}`,
      },
    });
  }

  return ranked
    .sort(
      (a, b) =>
        b.row.score - a.row.score ||
        b.at - a.at ||
        b.row.roundNumber - a.row.roundNumber,
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.row);
}

/** "Round 2 · Space pirates · score 53.9" (theme omitted when unknown). */
export function bestPromptMeta(
  row: Pick<BestPrompt, 'roundNumber' | 'theme' | 'score'>,
): string {
  return [
    `Round ${row.roundNumber}`,
    row.theme,
    `score ${row.score.toFixed(1)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What a screen reader says for a best-prompt row. */
export function bestPromptAccessibilityLabel(row: BestPrompt): string {
  const parts = [`Round ${row.roundNumber}`];
  if (row.theme) parts.push(row.theme);
  parts.push(`score ${row.score.toFixed(1)}`);
  if (row.won) parts.push(row.ko ? 'won by knockout' : 'won');
  else if (row.ko) parts.push('knockout round');
  return `“${row.excerpt}”. ${parts.join(', ')}. Opens the battle result`;
}

// ---------------------------------------------------------------------------
// Recent battles
// ---------------------------------------------------------------------------

export interface RecentBattleRow {
  id: string;
  opponentLabel: string;
  outcome: BattleOutcome;
  /** "Win" / "Loss" / "Draw", or the status word while unresolved. */
  label: string;
  tone: BattleStatusView['tone'];
  modeLabel: string;
  /** Short local date, or '' when the row has no usable timestamp. */
  date: string;
  /** Null when there is nowhere useful to go (timed out, cancelled). */
  route: Href | null;
}

const OUTCOME_LABEL: Record<Exclude<BattleOutcome, 'pending'>, string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
};

const OUTCOME_TONE: Record<
  Exclude<BattleOutcome, 'pending'>,
  BattleStatusView['tone']
> = {
  win: 'success',
  loss: 'error',
  draw: 'warning',
};

/**
 * The first `limit` battles as the Stats strip shows them. Rows keep the
 * order they arrive in (`getBattleHistory` is newest first).
 */
export function recentBattlesView(
  battles: readonly StatsBattleRow[],
  myId: string,
  limit: number = RECENT_BATTLES_LIMIT,
): RecentBattleRow[] {
  return battles.slice(0, Math.max(0, limit)).map((battle) => {
    const view = describeBattleRow(battle, myId);
    const outcome = view.outcome;
    return {
      id: battle.id,
      opponentLabel: view.opponentName,
      outcome,
      label: outcome === 'pending' ? view.status.label : OUTCOME_LABEL[outcome],
      tone: outcome === 'pending' ? view.status.tone : OUTCOME_TONE[outcome],
      modeLabel: modeLabel(battle.mode),
      date: shortDate(battle.created_at) ?? '',
      route: battleRouteFor(battle, myId),
    };
  });
}

/** "Win against Vex, Ranked Battle, 3 Sep 2026. Opens the battle" */
export function recentBattleAccessibilityLabel(row: RecentBattleRow): string {
  const parts = [`${row.label} against ${row.opponentLabel}`, row.modeLabel];
  if (row.date) parts.push(row.date);
  return `${parts.join(', ')}${row.route ? '. Opens the battle' : ''}`;
}
