/**
 * Layout arithmetic and small pure helpers for the series reveal, kept out of
 * the beats so the choreography's numbers and labels can be pinned without
 * mounting a screen. Words the beats say live in `utils/revealBeats.ts`; this
 * file only holds what the *screen* needs to place and time them.
 */

import { Spacing } from '@/constants/DesignTokens';
import { moveLabel } from '@/utils/battleCopy';
import type {
  PayoffRow,
  RevealModel,
  RevealSide,
  StingPreset,
} from '@/utils/revealBeats';

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** Height of the transparent (battle) header the reveal must stay below. */
export const REVEAL_HEADER_OFFSET = 44;
/** The progress dots + Skip row: one 44pt target tall. */
export const REVEAL_TOP_BAR_HEIGHT = 44;
/** The Next / See-the-breakdown button or the tap hint. */
export const REVEAL_BOTTOM_BAR_HEIGHT = 48;

export interface RevealInsets {
  top: number;
  bottom: number;
}

/**
 * Where a beat may draw without sitting under the overlaid controls. Beats fill
 * the screen (the poster is full-bleed); their *content* pads by this much.
 */
export function revealContentInsets(safe: {
  top: number;
  bottom: number;
}): RevealInsets {
  return {
    top: safe.top + REVEAL_HEADER_OFFSET + REVEAL_TOP_BAR_HEIGHT + Spacing.md,
    bottom: safe.bottom + REVEAL_BOTTOM_BAR_HEIGHT + Spacing.lg * 2,
  };
}

/** Below this width the judge beat stacks its two prompt cards. */
export const JUDGE_CARDS_STACK_BELOW = 360;

export function judgeCardsStacked(width: number): boolean {
  return width < JUDGE_CARDS_STACK_BELOW;
}

/** The caption zone's share of the poster height on the winner beat. */
export const POSTER_CAPTION_RATIO = 0.45;

// ---------------------------------------------------------------------------
// Imagery
// ---------------------------------------------------------------------------

/**
 * Ordered, de-duplicated image candidates. The winner beat renders the first
 * and steps down the list on load error; when the list runs out it falls back
 * to the bundled archetype illustration, so the poster never goes blank.
 */
export function imageSourceChain(
  candidates: readonly (string | null | undefined)[],
): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0 && !out.includes(c)) {
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** One score dot lands every this-many ms on the verdict beat. */
export const VERDICT_DOT_STEP_MS = 180;
/** Pause between the last dot and the headline. */
export const VERDICT_HEADLINE_GAP_MS = 120;
/** Pause between the headline and the KNOCKOUT stamp. */
export const VERDICT_STAMP_GAP_MS = 260;

export interface VerdictTimeline {
  /** Delay before each dot pops, in dot order. */
  dotDelays: number[];
  headlineAt: number;
  /** Null when there is no stamp to slam. */
  stampAt: number | null;
  /** When the outcome haptic fires: with the stamp when there is one. */
  outcomeAt: number;
}

export function verdictTimeline(input: {
  dots: number;
  hasStamp: boolean;
  reduceMotion: boolean;
}): VerdictTimeline {
  const dots = Math.max(0, Math.floor(input.dots));
  if (input.reduceMotion) {
    return {
      dotDelays: Array.from({ length: dots }, () => 0),
      headlineAt: 0,
      stampAt: input.hasStamp ? 0 : null,
      outcomeAt: 0,
    };
  }
  const dotDelays = Array.from(
    { length: dots },
    (_, i) => i * VERDICT_DOT_STEP_MS,
  );
  const dotsDoneAt = dots > 0 ? dots * VERDICT_DOT_STEP_MS : 0;
  const headlineAt = dotsDoneAt + VERDICT_HEADLINE_GAP_MS;
  const stampAt = input.hasStamp ? headlineAt + VERDICT_STAMP_GAP_MS : null;
  return { dotDelays, headlineAt, stampAt, outcomeAt: stampAt ?? headlineAt };
}

/** The Ken Burns drift on the winner poster; the beat itself runs 3.8s. */
export const KEN_BURNS_MS = 3600;
/** The sting starts once the poster has had a moment to settle. */
export const STING_DELAY_MS = 350;
/** Every canned sting runs this long. */
export const STING_DURATION_MS = 900;
/** The impact moment of each sting, from its start, for the haptic. */
export const STING_LANDING_MS: Record<StingPreset, number> = {
  attack: 380,
  defense: 180,
  finisher: 80,
};

// ---------------------------------------------------------------------------
// Words the layout owns
// ---------------------------------------------------------------------------

export const PROMPT_UNAVAILABLE_LINE = 'Prompt not recorded.';

/**
 * Join fragments into one utterance, ending each with a full stop unless it
 * already ends in terminal punctuation, so a judge line that ends in a period
 * is not read out as two.
 */
export function joinSentences(parts: readonly string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

function sideLabel(side: RevealSide): string {
  const move = side.moveType ? `, ${moveLabel(side.moveType)}` : '';
  return `${side.name}${move}: ${side.promptExcerpt ?? PROMPT_UNAVAILABLE_LINE}`;
}

/** What a screen reader hears for the whole judge beat. */
export function judgeBeatLabel(model: RevealModel): string {
  const parts = ['What the judge saw'];
  if (model.judgeWhy) parts.push(`Judge: ${model.judgeWhy}`);
  parts.push(sideLabel(model.me), sideLabel(model.them));
  return joinSentences(parts);
}

/** What a screen reader hears for the whole payoff beat. */
export function payoffBeatLabel(
  rows: readonly PayoffRow[],
  fallbackLine: string | null,
): string {
  const parts = ['Your rewards'];
  for (const row of rows) {
    parts.push(
      `${row.label}: ${row.value}${row.detail ? `, ${row.detail}` : ''}`,
    );
  }
  if (fallbackLine) parts.push(fallbackLine);
  return joinSentences(parts);
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

/** AsyncStorage key under which the result screen remembers a seen reveal. */
export function revealSeenKey(battleId: string): string {
  return `pw:reveal-seen:${battleId}`;
}

/**
 * The judge's line on the summary. The reveal already says it, and on Bo3 the
 * last round's card usually repeats it, so the summary only shows it when the
 * battle-level explanation adds something the last round did not.
 */
export function summaryJudgeLine(input: {
  battleExplanation: string | null | undefined;
  lastRoundExplanation: string | null | undefined;
}): string | null {
  const battle = input.battleExplanation?.trim() ?? '';
  if (!battle) return null;
  const round = input.lastRoundExplanation?.trim() ?? '';
  return battle === round ? null : battle;
}
