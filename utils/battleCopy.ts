/**
 * Player-facing words for the battle flow, kept pure so they can be pinned.
 *
 * Three habits this module exists to break: developer prose reaching the
 * player ("Round not accepting prompts (status=resolving)"), the same thing
 * being called by several names (a mode is `unranked`, "Casual Battle" and
 * "UNRANKED MODE" on three consecutive screens), and outcomes described from
 * the server's point of view instead of the viewer's.
 */

import { BATTLE_MODES } from '@/constants/BattleModes';
import type { MoveType } from '@/utils/battles';

/** "Casual Battle", "Practice vs Bot", … — one name per mode, everywhere. */
export function modeLabel(mode: string | null | undefined): string {
  const known = BATTLE_MODES.find((m) => m.mode === mode);
  if (known) return known.title;
  switch (mode) {
    case 'friend_challenge':
      return 'Friend Challenge';
    case 'daily_theme':
      return 'Daily Theme';
    default:
      return 'Battle';
  }
}

/**
 * Time left to lock in, as a player reads it: "1h 05m", "5m 03s", "42s",
 * or "Time’s up". Shared by the versus strip and the waiting screen so the
 * clock reads the same wherever it appears.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Time’s up';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/** "Attack", "Defense", "Finisher". */
export function moveLabel(move: MoveType | string | null | undefined): string {
  if (!move) return '';
  return move.charAt(0).toUpperCase() + move.slice(1);
}

export interface SubmitErrorCopy {
  title: string;
  message: string;
  /** The round or battle has moved on; the screen should follow it. */
  roundClosed: boolean;
}

/**
 * What to tell a player whose lock-in was refused.
 *
 * Keyed on status and code, never on the server's message, except for the
 * moderation reason, which is written for players.
 */
export function describeSubmitError(input: {
  status?: number;
  code?: string;
  message?: string;
}): SubmitErrorCopy {
  const { status, code, message } = input;
  if (code === 'moderation_review') {
    // The classifier was unsure, not certain: the prompt is held, not judged.
    // Say what usually trips it so the rewrite is not a guess.
    return {
      title: 'Held for review',
      message:
        'Our filter wasn’t sure about this one. Keep the action inside the fight — no real people or places, nothing graphic — reword it, and try again.',
      roundClosed: false,
    };
  }
  if (status === 403 || code === 'moderation_rejected') {
    const reason = message?.replace(/^Prompt rejected:\s*/i, '').trim();
    const hasReason =
      reason &&
      reason.length > 0 &&
      !/^Content policy violation$/i.test(reason);
    return {
      title: 'Not allowed by moderation',
      message: hasReason
        ? `${reason}. Edit your prompt and try again.`
        : 'Your prompt didn’t pass moderation. Edit it and try again.',
      roundClosed: false,
    };
  }
  if (status === 409) {
    return {
      title: 'This round has closed',
      message: 'The round moved on while you were writing. Let’s catch you up.',
      roundClosed: true,
    };
  }
  if (status === 429) {
    return {
      title: 'Too many attempts',
      message:
        'You’ve locked in a lot of prompts recently. Wait a few minutes and try again.',
      roundClosed: false,
    };
  }
  if (status === 503) {
    return {
      title: 'Couldn’t check your limits',
      message: 'Please try again in a moment. Your prompt is still here.',
      roundClosed: false,
    };
  }
  return {
    title: 'Couldn’t lock in',
    message: 'Your prompt is still here. Check your connection and try again.',
    roundClosed: false,
  };
}

export type RoundOutcome = 'won' | 'lost' | 'draw' | 'pending';

/** The round outcome from the viewer's side. */
export function roundOutcomeFor(input: {
  status: string;
  isDraw: boolean;
  roundWinnerId: string | null;
  myProfileId: string | null | undefined;
}): RoundOutcome {
  if (input.status !== 'result_ready') return 'pending';
  if (input.isDraw) return 'draw';
  if (!input.roundWinnerId || !input.myProfileId) return 'pending';
  return input.roundWinnerId === input.myProfileId ? 'won' : 'lost';
}

export interface RoundOutcomeCopy {
  title: string;
  subtitle: string;
}

/** The headline for a round result screen. */
export function roundOutcomeCopy(input: {
  outcome: RoundOutcome;
  roundNumber: number;
  isKo: boolean;
  seriesComplete: boolean;
  mine: number;
  theirs: number;
}): RoundOutcomeCopy {
  const { outcome, roundNumber, isKo, seriesComplete, mine, theirs } = input;
  const score = `Series ${mine}–${theirs}`;
  switch (outcome) {
    case 'won':
      return {
        title: isKo
          ? `Knockout! Round ${roundNumber} is yours`
          : `Round ${roundNumber} won`,
        subtitle: seriesComplete ? `${score} · you take the series` : score,
      };
    case 'lost':
      return {
        title: isKo
          ? `Knocked out in round ${roundNumber}`
          : `Round ${roundNumber} lost`,
        subtitle: seriesComplete ? `${score} · the series is theirs` : score,
      };
    case 'draw':
      return {
        title: `Round ${roundNumber} drawn`,
        subtitle: `${score} · no damage dealt`,
      };
    default:
      return {
        title: `Round ${roundNumber}`,
        subtitle: 'Waiting for the judge…',
      };
  }
}

/** "You won the series 2–1" and friends, for the final result header. */
export function seriesHeadline(input: {
  mine: number;
  theirs: number;
  isDraw: boolean;
  isWinner: boolean;
}): string {
  const { mine, theirs, isDraw, isWinner } = input;
  if (isDraw) return `Series drawn ${mine}–${theirs}`;
  return isWinner
    ? `You won the series ${mine}–${theirs}`
    : `You lost the series ${mine}–${theirs}`;
}

export type BattleOutcome = 'win' | 'loss' | 'draw' | 'pending';

/** Terminal statuses that carry a result the player can read. */
const RESOLVED_STATUSES = new Set([
  'result_ready',
  'generating_video',
  'completed',
]);

/**
 * The battle outcome from the viewer's side.
 *
 * Only resolved battles have one: an in-progress, expired or cancelled battle
 * is `pending`, never `loss` — the stats screen used to label every unfinished
 * battle a loss because it keyed on `winner_id` alone.
 */
export function battleOutcomeFor(
  battle: {
    status: string;
    is_draw?: boolean | null;
    winner_id?: string | null;
  },
  myProfileId: string | null | undefined,
): BattleOutcome {
  if (!RESOLVED_STATUSES.has(battle.status)) return 'pending';
  if (battle.is_draw) return 'draw';
  if (!battle.winner_id || !myProfileId) return 'pending';
  return battle.winner_id === myProfileId ? 'win' : 'loss';
}

export interface BattleStatusView {
  label: string;
  /** Whether the player has something to do on this battle right now. */
  actionable: boolean;
  tone: 'primary' | 'neutral' | 'success' | 'warning' | 'error';
}

export interface ArenaPrimaryActionCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
}

/**
 * Copy for the one battle Arena promotes above everything else. Actionable
 * result states share the same visual treatment as a turn, but must never be
 * announced as if the player still needs to submit a prompt.
 */
export function arenaPrimaryActionCopy(
  statusLabel: BattleStatusView['label'],
  theme?: string | null,
): ArenaPrimaryActionCopy {
  const themeSuffix = theme ? `: ${theme}` : '';
  if (statusLabel === 'Your turn') {
    return {
      eyebrow: 'YOUR TURN',
      title: 'Continue your battle',
      subtitle: theme ?? 'Choose your next move',
      accessibilityLabel: `Your turn. Continue battle${themeSuffix}`,
    };
  }
  if (statusLabel === 'Cinematic on the way') {
    return {
      eyebrow: 'BATTLE RESULT',
      title: 'View your result',
      subtitle: theme ? `${theme} · Cinematic on the way` : statusLabel,
      accessibilityLabel: `Cinematic on the way. View battle result${themeSuffix}`,
    };
  }
  return {
    eyebrow: statusLabel.toUpperCase(),
    title: 'Reveal your battle',
    subtitle: theme ?? 'See who won',
    accessibilityLabel: `${statusLabel}. Reveal battle${themeSuffix}`,
  };
}

/**
 * A battle's status as a list row should say it.
 *
 * `waiting_for_prompts` splits on whether the viewer has locked: "Your turn"
 * is the one row a player is looking for; everything else is context. The raw
 * enum ("Waiting for prompts", "Result ready", "Generating video") used to ship
 * through a `replace(/_/g, ' ')`.
 */
export function battleStatusView(input: {
  status: string;
  iHaveLocked?: boolean;
  outcome?: BattleOutcome;
}): BattleStatusView {
  const { status, iHaveLocked = false, outcome = 'pending' } = input;
  switch (status) {
    case 'created':
    case 'matched':
      return {
        label: 'Finding an opponent',
        actionable: false,
        tone: 'neutral',
      };
    case 'waiting_for_prompts':
      return iHaveLocked
        ? { label: 'Waiting for opponent', actionable: false, tone: 'neutral' }
        : { label: 'Your turn', actionable: true, tone: 'primary' };
    case 'resolving':
      return { label: 'Judging', actionable: false, tone: 'neutral' };
    case 'result_ready':
      return { label: 'Result ready', actionable: true, tone: 'primary' };
    case 'generating_video':
      return {
        label: 'Cinematic on the way',
        actionable: true,
        tone: 'primary',
      };
    case 'completed':
      return outcome === 'win'
        ? { label: 'Victory', actionable: false, tone: 'success' }
        : outcome === 'loss'
          ? { label: 'Defeat', actionable: false, tone: 'error' }
          : outcome === 'draw'
            ? { label: 'Draw', actionable: false, tone: 'warning' }
            : { label: 'Finished', actionable: false, tone: 'neutral' };
    case 'expired':
      return { label: 'Timed out', actionable: false, tone: 'warning' };
    case 'canceled':
      return { label: 'Cancelled', actionable: false, tone: 'neutral' };
    case 'moderation_failed':
      return { label: 'Prompt rejected', actionable: false, tone: 'error' };
    case 'generation_failed':
      return { label: 'Result ready', actionable: true, tone: 'primary' };
    default:
      return { label: 'In progress', actionable: false, tone: 'neutral' };
  }
}

/**
 * The opponent's display name for a battle row.
 *
 * One fallback vocabulary: three screens used to say "Finding opponent...",
 * "Waiting..." and "opponent" for the same state.
 */
export function opponentNameFor(input: {
  isBot?: boolean | null;
  botName?: string | null;
  opponentName?: string | null;
  hasOpponent: boolean;
}): string {
  if (input.isBot) return input.botName?.trim() || 'Practice bot';
  if (input.opponentName?.trim()) return input.opponentName.trim();
  return input.hasOpponent ? 'Opponent' : 'No opponent yet';
}

/** A Glicko rating change as the player reads it. */
export function ratingDeltaLabel(
  delta: number | null | undefined,
): string | null {
  if (delta === null || delta === undefined || !Number.isFinite(delta))
    return null;
  const rounded = Math.round(delta);
  if (rounded === 0) return 'Rating unchanged';
  return rounded > 0 ? `Rating +${rounded}` : `Rating ${rounded}`;
}
