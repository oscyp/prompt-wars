/**
 * View-model helpers for the result and round-result screens.
 *
 * Both screens read server-owned rows (`battles`, `battle_rounds`,
 * `video_jobs`) and turn them into copy and outcome states. Everything that
 * can be wrong from the viewer's side -- who won, whose score is whose, what a
 * video job's status means for the upgrade button -- lives here, pure, so it
 * can be pinned by tests without mounting a screen. The server still decides
 * outcomes, scores and charges; this only phrases them.
 */

import type { BattleFormat, BattleRound } from '@/types/battle';
import type { EntitlementCheck } from '@/utils/monetization';
import { spendRows, type SpendRow } from '@/utils/editDialogCopy';
import { insufficientCreditsMessage } from '@/utils/credits';
import {
  moveLabel,
  ratingDeltaLabel,
  roundOutcomeFor,
  seriesHeadline,
  type RoundOutcome,
} from '@/utils/battleCopy';
import type { Tier0Payload } from '@/components/RoundResultCinematic';

/** How long the screens wait on a silent fetch before offering a retry. */
export const RESULT_LOAD_TIMEOUT_MS = 8000;

// --- Battle outcome ---------------------------------------------------------

export type BattleOutcome = 'won' | 'lost' | 'draw';

/** The battle outcome from the viewer's side. */
export function battleOutcomeFor(input: {
  winnerId: string | null | undefined;
  isDraw: boolean | null | undefined;
  myProfileId: string | null | undefined;
}): BattleOutcome {
  if (input.isDraw) return 'draw';
  return input.winnerId && input.winnerId === input.myProfileId
    ? 'won'
    : 'lost';
}

/**
 * The headline on the final result. Bo3 says the series score from the
 * viewer's side ("You won the series 2–1"); single has no score to show, so
 * it is one title-case word.
 */
export function outcomeHeadline(input: {
  format: BattleFormat;
  outcome: BattleOutcome;
  mine: number;
  theirs: number;
}): string {
  const { format, outcome, mine, theirs } = input;
  if (format === 'bo3') {
    return seriesHeadline({
      mine,
      theirs,
      isDraw: outcome === 'draw',
      isWinner: outcome === 'won',
    });
  }
  return outcome === 'draw' ? 'Draw' : outcome === 'won' ? 'Victory' : 'Defeat';
}

/** What the 64pt outcome icon is, for screen readers. */
export function outcomeIconLabel(outcome: BattleOutcome): string {
  switch (outcome) {
    case 'won':
      return 'Trophy';
    case 'lost':
      return 'Broken heart';
    default:
      return 'Handshake';
  }
}

/** The one-shot announcement when the resolved battle first appears. */
export function outcomeAnnouncement(input: {
  headline: string;
  ratingLine: string | null;
}): string {
  return input.ratingLine
    ? `${input.headline}. ${input.ratingLine}.`
    : `${input.headline}.`;
}

// --- Rating -----------------------------------------------------------------

export const QUALITY_FLOOR_NOTE =
  'No rating change — both prompts were below the quality floor.';

export interface RatingSummary {
  /** The sentence to show, or null when there is nothing to say. */
  line: string | null;
  /** The raw delta when one applies; null when gated or absent. */
  delta: number | null;
  /** True when §7.8's quality floor withheld the rating change. */
  gated: boolean;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The viewer's rating change for this battle.
 *
 * `rating_delta_payload` is keyed by profile id (`{ [id]: { delta, rd, vol } }`,
 * see `resolve_battle` in the migrations); `score_payload.rating_gated` is
 * stamped when a gate withheld the change, and wins over any delta present.
 */
export function ratingSummary(input: {
  ratingDeltaPayload:
    | Record<string, { delta?: unknown } | undefined>
    | null
    | undefined;
  scorePayload: { rating_gated?: unknown } | null | undefined;
  myProfileId: string | null | undefined;
}): RatingSummary {
  if (input.scorePayload?.rating_gated === 'quality_floor') {
    return { line: QUALITY_FLOOR_NOTE, delta: null, gated: true };
  }
  const entry = input.myProfileId
    ? input.ratingDeltaPayload?.[input.myProfileId]
    : undefined;
  const delta = numberOrNull(entry?.delta);
  return { line: ratingDeltaLabel(delta), delta, gated: false };
}

// --- Round-by-round mini cards ---------------------------------------------

export interface RoundMiniView {
  outcome: RoundOutcome;
  /** "You won", "Opponent won", "Draw", "Pending". */
  status: string;
  /** "8.2 vs 6.1" from the viewer's side, or null before scores exist. */
  scoreLine: string | null;
  /** "HP after: 70 vs 100" from the viewer's side. */
  hpLine: string;
}

/**
 * One round as the viewer reads it. Won/lost come from `round_winner_id`, the
 * server's verdict, never from comparing scores -- a round can be won on
 * forfeit with no scores at all, and a draw is a draw whatever the numbers.
 */
export function roundMiniView(
  round: BattleRound,
  viewer: {
    myProfileId: string | null | undefined;
    playerOneId: string | null | undefined;
  },
): RoundMiniView {
  const isPlayerOne =
    Boolean(viewer.myProfileId) && viewer.playerOneId === viewer.myProfileId;
  const myScore = isPlayerOne ? round.player_one_score : round.player_two_score;
  const oppScore = isPlayerOne
    ? round.player_two_score
    : round.player_one_score;
  const myHp = isPlayerOne
    ? round.player_one_hp_after
    : round.player_two_hp_after;
  const oppHp = isPlayerOne
    ? round.player_two_hp_after
    : round.player_one_hp_after;

  const outcome = roundOutcomeFor({
    status: round.status,
    isDraw: Boolean(round.is_draw),
    roundWinnerId: round.round_winner_id,
    myProfileId: viewer.myProfileId,
  });

  const status =
    outcome === 'won'
      ? 'You won'
      : outcome === 'lost'
        ? 'Opponent won'
        : outcome === 'draw'
          ? 'Draw'
          : 'Pending';

  const scoreLine =
    myScore != null && oppScore != null
      ? `${Number(myScore).toFixed(1)} vs ${Number(oppScore).toFixed(1)}`
      : null;

  return {
    outcome,
    status,
    scoreLine,
    hpLine: `HP after: ${myHp ?? '—'} vs ${oppHp ?? '—'}`,
  };
}

// --- Tier 1 video -----------------------------------------------------------

export type VideoJobLike = { status: string } | null | undefined;

/**
 * Whether to show the "get the video" call to action.
 *
 * A failed job counts as no job: `request-video-upgrade` deletes a refunded
 * failure and accepts a fresh request (§8.6), so the button belongs back on
 * screen. Bot battles never offer video.
 */
export function canOfferVideoUpgrade(input: {
  job: VideoJobLike;
  battleStatus: string;
  mode: string;
}): boolean {
  if (!['result_ready', 'completed'].includes(input.battleStatus)) return false;
  if (input.mode === 'bot') return false;
  return !input.job || input.job.status === 'failed';
}

export interface VideoStatusCopy {
  title: string;
  body: string;
  tone: 'pending' | 'error';
}

/**
 * The status card for a job that is not yet playable. Null once the video is
 * ready and signed, because the player takes over. Statuses are the DB enum
 * `video_job_status` (queued / submitted / processing / succeeded / failed).
 */
export function videoStatusCopy(input: {
  status: string;
  hasUrl: boolean;
}): VideoStatusCopy | null {
  switch (input.status) {
    case 'failed':
      return {
        title: 'Video didn’t generate',
        body: 'You weren’t charged for this attempt.',
        tone: 'error',
      };
    case 'succeeded':
      return input.hasUrl
        ? null
        : { title: 'Cinematic video', body: 'Finishing up…', tone: 'pending' };
    default:
      return {
        title: 'Cinematic video',
        body: 'Generating your cinematic… usually a few minutes',
        tone: 'pending',
      };
  }
}

export interface UpgradeSheetCopy {
  title: string;
  subtitle: string;
  lines: string[];
  rows: SpendRow[];
  confirmLabel: string;
}

/**
 * The confirm sheet before a Tier 1 request. The cost is always stated here,
 * before anything is spent: credit rows when it costs credits, the allowance
 * line when a subscription covers it, "Free" for a welcome grant.
 *
 * `balance` is the client's cached wallet reading; the server's
 * `credits_balance` wins when the preview carried one.
 */
export function upgradeSheetCopy(
  check: EntitlementCheck | null | undefined,
  balance: number | null,
): UpgradeSheetCopy {
  const base = {
    title: 'Cinematic video',
    subtitle: 'A short AI-generated clip of this battle.',
    confirmLabel: 'Get the video',
  };
  const effectiveBalance =
    typeof check?.credits_balance === 'number'
      ? check.credits_balance
      : balance;

  if (check?.method === 'subscription_allowance') {
    const remaining = Math.max(1, check.allowance_remaining ?? 1);
    return {
      ...base,
      lines: [`Uses 1 of ${remaining} monthly video reveals`],
      rows: [],
    };
  }
  if (check?.method === 'free_grant') {
    return {
      ...base,
      lines: ['Included with your welcome grant.'],
      rows: spendRows(0, effectiveBalance),
    };
  }
  return {
    ...base,
    lines: [],
    rows: spendRows(check?.cost_credits ?? 0, effectiveBalance),
  };
}

export interface UpgradeBlockedCopy {
  title: string;
  message: string;
}

/**
 * The alert when the preview says no. The only remedy the app can offer is
 * the wallet, so the copy is the shared insufficient-credits sentence; the
 * shortfall is named when the server sent both numbers.
 */
export function upgradeBlockedCopy(
  check: EntitlementCheck | null | undefined,
  balance: number | null,
): UpgradeBlockedCopy {
  const have =
    typeof check?.credits_balance === 'number'
      ? check.credits_balance
      : balance;
  const cost = check?.cost_credits;
  const shortfall =
    typeof cost === 'number' && have !== null && Number.isFinite(have)
      ? Math.max(0, cost - have)
      : undefined;
  return {
    title: 'Not enough credits',
    message: insufficientCreditsMessage(shortfall),
  };
}

// --- Judge ------------------------------------------------------------------

/** Fallback when the judge payload has no explanation. */
export function judgeNotesUnavailable(scope: 'battle' | 'round'): string {
  return `The judge’s notes aren’t available for this ${scope}.`;
}

/**
 * §7.1: the result must state any move-type matchup, even in single format
 * where it carries no modifier. Null when either move is unknown.
 */
export function singleMatchupNote(
  myMove: string | null | undefined,
  oppMove: string | null | undefined,
): string | null {
  if (!myMove || !oppMove) return null;
  return `Your ${moveLabel(myMove)} vs their ${moveLabel(oppMove)}. Move types don’t change the score in single battles.`;
}

// --- Fighters ---------------------------------------------------------------

/**
 * The character name for one side of the reveal payload, or `fallback` when
 * the payload predates `character_name` or is missing. Takes the side rather
 * than a profile id because bots have no profile id to match on.
 */
export function fighterNameFor(
  tier0: Tier0Payload | null | undefined,
  side: 'player_one' | 'player_two',
  fallback: string,
): string {
  const name = tier0?.players?.[side]?.character_name;
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

// --- Numbers ----------------------------------------------------------------

const MINUS = '−';

/**
 * Move-type modifier is stored in ABSOLUTE aggregate points, not as a fraction
 * (migration 20260822170000). Rendering it as a percentage would show the
 * +0.9 bonus as "+90%".
 *
 * Rounds resolved before that migration hold the old fractional values
 * (+0.12 / -0.08). Those are shown as-is; the magnitude reads as a small point
 * value, which is close enough to the truth not to warrant a backfill.
 */
export function formatPoints(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '0.0 pts';
  const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
  return `${sign}${Math.abs(v).toFixed(1)} pts`;
}

/** A fractional stat modifier as a signed percentage. */
export function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '0.0%';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? MINUS : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** "Your Attack vs their Defense · +0.9 pts" */
export function moveMatchupLine(
  myMove: string,
  oppMove: string,
  moveModifier: number | null | undefined,
): string {
  return `Your ${moveLabel(myMove)} vs their ${moveLabel(oppMove)} · ${formatPoints(moveModifier)}`;
}
