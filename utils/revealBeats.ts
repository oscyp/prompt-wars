/**
 * The series-result reveal: which beats play, in what order, and every word
 * they say. Pure, so the choreography can be pinned by tests without mounting
 * the screen.
 *
 * Beats: verdict (score dots fill, knockout stamp) → winner (poster, battle
 * cry, move sting) → judge (both prompts, rubric bars, the judge's line) →
 * payoff (rating, credits, streak, quests). A draw has no winner beat; a
 * battle with no judge data has no judge beat. The payoff never auto-advances:
 * it ends on the player's tap.
 */

import type {
  BattleFormat,
  RewardSummary,
  RubricScoreSet,
} from '@/types/battle';
import { seriesHeadline } from '@/utils/battleCopy';
import { formatCredits } from '@/utils/credits';

export type RevealBeatKind = 'verdict' | 'winner' | 'judge' | 'payoff';
export type RevealOutcome = 'won' | 'lost' | 'draw';

export const REVEAL_BEATS_ORDER: readonly RevealBeatKind[] = [
  'verdict',
  'winner',
  'judge',
  'payoff',
];

/**
 * Auto-advance per beat; 0 means "waits for the player".
 *
 * Generous on purpose: the choreography inside a beat ends within about a
 * second, and the rest is dwell time to actually read it — the judge beat
 * carries two prompts of up to four lines each plus the rubric. Anyone in a
 * hurry taps; nobody can tap to slow down.
 */
export const BEAT_AUTO_ADVANCE_MS: Record<RevealBeatKind, number> = {
  verdict: 4500,
  winner: 6500,
  judge: 10000,
  payoff: 0,
};

export interface RevealBeatsInput {
  outcome: RevealOutcome;
  /** False when there is no rubric and no judge line to show. */
  hasJudge: boolean;
}

export function revealBeatsFor(input: RevealBeatsInput): RevealBeatKind[] {
  return REVEAL_BEATS_ORDER.filter((beat) => {
    if (beat === 'winner') return input.outcome !== 'draw';
    if (beat === 'judge') return input.hasJudge;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export interface VerdictCopy {
  /** Big stamp over the score, e.g. "KNOCKOUT". Null for a points result. */
  stamp: string | null;
  headline: string;
  subline: string | null;
}

export function verdictCopy(input: {
  format: BattleFormat;
  outcome: RevealOutcome;
  mine: number;
  theirs: number;
  isKo: boolean;
}): VerdictCopy {
  const { format, outcome, mine, theirs, isKo } = input;
  const stamp = isKo && outcome !== 'draw' ? 'KNOCKOUT' : null;
  if (format === 'bo3') {
    const headline = seriesHeadline({
      mine,
      theirs,
      isDraw: outcome === 'draw',
      isWinner: outcome === 'won',
    });
    const subline =
      stamp === null
        ? null
        : outcome === 'won'
          ? 'Your opponent’s HP hit zero.'
          : 'Your HP hit zero.';
    return { stamp, headline, subline };
  }
  const headline =
    outcome === 'draw' ? 'Draw' : outcome === 'won' ? 'Victory' : 'Defeat';
  return { stamp, headline, subline: null };
}

// ---------------------------------------------------------------------------
// Winner + move sting
// ---------------------------------------------------------------------------

export type StingPreset = 'attack' | 'defense' | 'finisher';

/**
 * Which canned sting the winner beat plays. The server names one in
 * `reveal_spec.animation_preset` ("finisher_dramatic_3s"); the move type is
 * the fallback for payloads that predate the spec. Null means no sting.
 */
export function stingPresetFor(input: {
  animationPreset?: string | null;
  winnerMoveType?: string | null;
}): StingPreset | null {
  const fromPreset = input.animationPreset?.toLowerCase().split(/[_\-\s]/)[0];
  if (
    fromPreset === 'attack' ||
    fromPreset === 'defense' ||
    fromPreset === 'finisher'
  ) {
    return fromPreset;
  }
  const move = input.winnerMoveType?.toLowerCase();
  if (move === 'attack' || move === 'defense' || move === 'finisher')
    return move;
  return null;
}

export interface WinnerBeatCopy {
  name: string;
  /** "Winner" / "Winner · Knockout" over the name. */
  kicker: string;
  battleCry: string | null;
}

export function winnerBeatCopy(input: {
  name: string | null | undefined;
  isMe: boolean;
  isKo: boolean;
  battleCry: string | null | undefined;
}): WinnerBeatCopy {
  const name = input.name?.trim() || (input.isMe ? 'You' : 'Your opponent');
  const cry = input.battleCry?.trim();
  return {
    name,
    kicker: input.isKo ? 'Winner · Knockout' : 'Winner',
    battleCry: cry ? `“${cry}”` : null,
  };
}

// ---------------------------------------------------------------------------
// Reveal payload (Tier 0) — the subset the beats read
// ---------------------------------------------------------------------------

export interface RevealSide {
  profileId: string | null;
  name: string;
  archetype: string | null;
  signatureColor: string | null;
  battleCry: string | null;
  moveType: string | null;
  promptExcerpt: string | null;
  rubric: Partial<RubricScoreSet> | null;
  portraitUrl: string | null;
}

export interface RevealModel {
  me: RevealSide;
  them: RevealSide;
  winnerProfileId: string | null;
  isDraw: boolean;
  isKo: boolean;
  judgeWhy: string | null;
  animationPreset: string | null;
  winnerColor: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function rubricOf(v: unknown): Partial<RubricScoreSet> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Partial<RubricScoreSet> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n)) {
      (out as Record<string, number>)[k] = n;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sideOf(raw: unknown, fallbackName: string): RevealSide {
  const p = (raw ?? {}) as Record<string, unknown>;
  const portrait = (p.portrait ?? {}) as Record<string, unknown>;
  return {
    profileId: str(p.profile_id),
    name: str(p.character_name) ?? fallbackName,
    archetype: str(p.archetype),
    signatureColor: str(p.signature_color),
    battleCry: str(p.battle_cry),
    moveType: str(p.move_type),
    promptExcerpt: str(p.prompt_excerpt),
    rubric: rubricOf(p.rubric_scores),
    portraitUrl: str(portrait.signed_url),
  };
}

/**
 * Read the server's RevealPayloadV1 from the viewer's side. Tolerates every
 * field being absent: an old or partial payload yields names like "Opponent"
 * and nulls, never a throw.
 */
export function revealModelFrom(
  payload: unknown,
  input: { myProfileId: string | null; isPlayerOne: boolean; isBot: boolean },
): RevealModel {
  const root = (payload ?? {}) as Record<string, unknown>;
  const players = (root.players ?? {}) as Record<string, unknown>;
  const outcome = (root.outcome ?? {}) as Record<string, unknown>;
  const judge = (root.judge ?? {}) as Record<string, unknown>;
  const spec = (root.reveal_spec ?? {}) as Record<string, unknown>;

  const p1 = sideOf(players.player_one, input.isPlayerOne ? 'You' : 'Opponent');
  const p2 = sideOf(
    players.player_two,
    input.isPlayerOne ? (input.isBot ? 'Practice bot' : 'Opponent') : 'You',
  );

  return {
    me: input.isPlayerOne ? p1 : p2,
    them: input.isPlayerOne ? p2 : p1,
    winnerProfileId: str(outcome.winner_profile_id),
    isDraw: outcome.is_draw === true,
    isKo: outcome.is_ko === true,
    judgeWhy: str(judge.why) ?? str(root.summary),
    animationPreset: str(spec.animation_preset),
    winnerColor: str(spec.winner_color),
  };
}

/** Whether there is anything for a judge beat to show. */
export function hasJudgeContent(model: RevealModel): boolean {
  return Boolean(
    model.judgeWhy ||
    model.me.rubric ||
    model.them.rubric ||
    model.me.promptExcerpt,
  );
}

// ---------------------------------------------------------------------------
// Payoff
// ---------------------------------------------------------------------------

export interface PayoffRow {
  key: 'rating' | 'credits' | 'streak' | 'quest';
  label: string;
  /** Static text when there is nothing to count. */
  value: string;
  /** When present the value counts up from 0; `value` is the final text. */
  counter?: { to: number; prefix?: string; suffix?: string };
  tone: 'up' | 'down' | 'neutral';
  detail?: string;
}

export interface PayoffInput {
  outcome: RevealOutcome;
  isBot: boolean;
  mode: string | null | undefined;
  rating: { delta: number | null; line: string | null; gated: boolean };
  reward: RewardSummary | null | undefined;
  /** True once the battle row is `completed`, so a missing payload is final. */
  battleCompleted: boolean;
}

export const REWARDS_PENDING_LINE = 'Tallying your rewards…';
export const REWARDS_UNAVAILABLE_LINE =
  'No reward summary was recorded for this battle.';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function payoffRows(input: PayoffInput): PayoffRow[] {
  const rows: PayoffRow[] = [];
  const { rating, reward } = input;

  // Rating: the one payoff that already existed.
  if (rating.gated) {
    rows.push({
      key: 'rating',
      label: 'Rating',
      value: rating.line ?? 'No change',
      tone: 'neutral',
    });
  } else if (input.isBot || input.mode === 'bot') {
    rows.push({
      key: 'rating',
      label: 'Rating',
      value: 'Practice — no rating change',
      tone: 'neutral',
    });
  } else if (rating.delta !== null && Math.round(rating.delta) !== 0) {
    const delta = Math.round(rating.delta);
    rows.push({
      key: 'rating',
      label: 'Rating',
      value: `${delta > 0 ? '+' : ''}${delta}`,
      counter: { to: Math.abs(delta), prefix: delta > 0 ? '+' : '−' },
      tone: delta > 0 ? 'up' : 'down',
    });
  } else if (rating.line) {
    rows.push({
      key: 'rating',
      label: 'Rating',
      value: rating.line,
      tone: 'neutral',
    });
  }

  if (!reward) return rows;

  // Credits.
  if (reward.credits_granted > 0) {
    rows.push({
      key: 'credits',
      label: 'Credits',
      value: `+${formatCredits(reward.credits_granted, 'chip')}`,
      counter: { to: reward.credits_granted, prefix: '+', suffix: ' cr' },
      tone: 'up',
      detail: reward.streak_milestone
        ? `Win streak ${reward.win_streak_after} milestone`
        : undefined,
    });
  } else if (!reward.credits_eligible) {
    rows.push({
      key: 'credits',
      label: 'Credits',
      value: 'Ranked wins pay streak credits',
      tone: 'neutral',
    });
  } else if (input.outcome === 'won') {
    rows.push({
      key: 'credits',
      label: 'Credits',
      value: 'Next milestone pays out',
      tone: 'neutral',
      detail: nextMilestoneDetail(reward.win_streak_after),
    });
  }

  // Streak.
  if (input.outcome === 'won') {
    const isNewBest =
      reward.win_streak_after > 1 &&
      reward.win_streak_after === reward.best_win_streak;
    rows.push({
      key: 'streak',
      label: 'Win streak',
      value: `${reward.win_streak_after}`,
      counter: { to: reward.win_streak_after },
      tone: 'up',
      detail: isNewBest ? 'New best!' : `Best ${reward.best_win_streak}`,
    });
  } else if (input.outcome === 'lost' && reward.win_streak_after === 0) {
    rows.push({
      key: 'streak',
      label: 'Win streak',
      value: 'Reset',
      tone: 'down',
      detail:
        reward.best_win_streak > 0
          ? `Best ${reward.best_win_streak}`
          : undefined,
    });
  }

  // Quests: the ones this battle finished first, else progress.
  if (reward.quests_completed.length > 0) {
    const total = reward.quests_completed.reduce(
      (s, q) => s + q.reward_credits,
      0,
    );
    rows.push({
      key: 'quest',
      label: plural(
        reward.quests_completed.length,
        'Quest complete',
        'Quests complete',
      ),
      value: reward.quests_completed.map((q) => q.title).join(' · '),
      tone: 'up',
      detail:
        total > 0
          ? `${formatCredits(total, 'sentence')} to claim in the Arena`
          : 'Claim in the Arena',
    });
  } else if (reward.quests_advanced.length > 0) {
    rows.push({
      key: 'quest',
      label: 'Daily quests',
      value: `${reward.quests_advanced.length} ${plural(reward.quests_advanced.length, 'quest', 'quests')} advanced`,
      tone: 'neutral',
    });
  }

  return rows;
}

/** The streak milestones grant_win_streak_reward pays at: 3, 5, 7, then every 5. */
export function nextStreakMilestone(current: number): number {
  if (current < 3) return 3;
  if (current < 5) return 5;
  if (current < 7) return 7;
  return Math.ceil((current + 1) / 5) * 5;
}

function nextMilestoneDetail(current: number): string {
  const next = nextStreakMilestone(current);
  const away = next - current;
  return `${away} more ${plural(away, 'win', 'wins')} to a ${next}-streak reward`;
}

/** What the payoff beat says when there are no rows to show. */
export function payoffFallbackLine(input: {
  reward: RewardSummary | null | undefined;
  battleCompleted: boolean;
}): string | null {
  if (input.reward) return null;
  return input.battleCompleted
    ? REWARDS_UNAVAILABLE_LINE
    : REWARDS_PENDING_LINE;
}

// ---------------------------------------------------------------------------
// Announcements + controls
// ---------------------------------------------------------------------------

export function beatAnnouncement(
  kind: RevealBeatKind,
  copy: { headline?: string },
): string {
  switch (kind) {
    case 'verdict':
      return copy.headline ?? 'Result';
    case 'winner':
      return copy.headline ? `Winner: ${copy.headline}` : 'Winner';
    case 'judge':
      return 'What the judge saw';
    case 'payoff':
      return 'Your rewards';
  }
}

export const REVEAL_SKIP_LABEL = 'Skip to summary';
export const REVEAL_NEXT_LABEL = 'Next';
export const REVEAL_DONE_LABEL = 'See the breakdown';
export const REVEAL_TAP_HINT = 'Tap to continue';
