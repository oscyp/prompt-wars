// AI Judge utilities for battle resolution
// Implements LLM-as-judge with rubric, length normalization, calibration, and JSON schema validation

import {
  MoveType,
  JudgeRubricScores,
  JudgeRunResult,
  JudgeCallProvenance,
} from './types.ts';
import { AiJudgeProvider, JudgeResponse } from './providers.ts';

export const JUDGE_PROMPT_VERSION = 'v1.0.0-mvp';

/**
 * Validate judge response against JSON schema
 */
export function validateJudgeResponse(response: unknown): JudgeResponse {
  if (!response || typeof response !== 'object') {
    throw new Error('Judge response must be an object');
  }

  const resp = response as Record<string, unknown>;

  // Validate top-level fields
  if (!resp.playerOneScores || !resp.playerTwoScores || !resp.explanation) {
    throw new Error('Judge response missing required fields');
  }

  // Validate score objects
  const validateScores = (
    scores: unknown,
    label: string,
  ): JudgeRubricScores => {
    if (!scores || typeof scores !== 'object') {
      throw new Error(`${label} must be an object`);
    }

    const s = scores as Record<string, unknown>;
    const required = [
      'clarity',
      'originality',
      'specificity',
      'theme_fit',
      'archetype_fit',
      'dramatic_potential',
    ];

    for (const field of required) {
      if (typeof s[field] !== 'number' || !Number.isFinite(s[field])) {
        throw new Error(`${label}.${field} must be a number`);
      }
      const val = s[field] as number;
      if (val < 0 || val > 10) {
        throw new Error(`${label}.${field} must be between 0 and 10`);
      }
    }

    return {
      clarity: s.clarity as number,
      originality: s.originality as number,
      specificity: s.specificity as number,
      theme_fit: s.theme_fit as number,
      archetype_fit: s.archetype_fit as number,
      dramatic_potential: s.dramatic_potential as number,
    };
  };

  const playerOneScores = validateScores(
    resp.playerOneScores,
    'playerOneScores',
  );
  const playerTwoScores = validateScores(
    resp.playerTwoScores,
    'playerTwoScores',
  );

  if (
    typeof resp.explanation !== 'string' ||
    resp.explanation.length < 10 ||
    resp.explanation.length > 2000
  ) {
    throw new Error(
      'Explanation must be a string between 10 and 2000 characters',
    );
  }

  return {
    playerOneScores,
    playerTwoScores,
    explanation: resp.explanation,
    modelId: (resp as { modelId?: string }).modelId || 'unknown',
    promptVersion:
      (resp as { promptVersion?: string }).promptVersion ||
      JUDGE_PROMPT_VERSION,
  };
}

/**
 * Calculate aggregate score from rubric
 */
export function aggregateScore(scores: JudgeRubricScores): number {
  return (
    scores.clarity +
    scores.originality +
    scores.specificity +
    scores.theme_fit +
    scores.archetype_fit +
    scores.dramatic_potential
  );
}

/**
 * §7.8 quality floor: aggregate of normalized rubric scores (max 60) below
 * which a prompt counts as low quality. Two throwaway prompts must not move
 * ranked ratings (win-trading defense).
 */
export const RATING_QUALITY_FLOOR = 18;

/** True when BOTH prompts fall below the quality floor (§7.8: no rating change). */
export function isBelowQualityFloor(
  playerOneNormalized: JudgeRubricScores,
  playerTwoNormalized: JudgeRubricScores,
): boolean {
  return (
    aggregateScore(playerOneNormalized) < RATING_QUALITY_FLOOR &&
    aggregateScore(playerTwoNormalized) < RATING_QUALITY_FLOOR
  );
}

/**
 * Length normalization: reduce marginal benefit of verbosity
 */
export function normalizeScores(
  rawScores: JudgeRubricScores,
  wordCount: number,
): JudgeRubricScores {
  // Soft target: 80-400 chars ~= 15-80 words
  // Penalty starts above 100 words
  const penalty = wordCount > 100 ? Math.min(0.15, (wordCount - 100) / 500) : 0;

  const normalize = (score: number) => Math.max(0, score * (1 - penalty));

  return {
    clarity: normalize(rawScores.clarity),
    originality: normalize(rawScores.originality),
    specificity: normalize(rawScores.specificity),
    theme_fit: normalize(rawScores.theme_fit),
    archetype_fit: normalize(rawScores.archetype_fit),
    dramatic_potential: normalize(rawScores.dramatic_potential),
  };
}

/**
 * Move-type matchup modifier, in ABSOLUTE aggregate points.
 *
 * Was +12% / -8% multiplicative on the 0-60 aggregate. On a typical base of 40
 * that opened a gap of roughly 8 points between two otherwise equal prompts --
 * well past DRAW_EPSILON (3.0) and past KO_SCORE_GAP_THRESHOLD (7). In other
 * words, the rock-paper-scissors pick, not the writing, decided close rounds,
 * which contradicts §7.1: the modifier "does not override clear quality
 * differences".
 *
 * Absolute points make the modifier a tie-breaker instead:
 *   equal prompts + favourable counter-pick -> gap 1.5  -> DRAW (< 3.0)
 *   5-point quality lead + bad counter-pick  -> gap 3.5  -> better prompt wins
 *   2-point quality lead + bad counter-pick  -> gap 0.5  -> draw (counter-pick
 *                                                          rescues a narrow loss)
 *
 * Scores are floored at 0 so a losing matchup cannot push an aggregate negative.
 *
 * round-resolve/index.ts imports these constants rather than restating them --
 * the two paths drifting apart is exactly how the old comment ("mirrors
 * _shared/judge.ts") stopped being true.
 */
export const MOVE_TYPE_POINTS_WIN = 0.9;
export const MOVE_TYPE_POINTS_LOSE = -0.6;

/** Signed aggregate-point adjustment for a move-type matchup. */
export function moveTypePoints(
  playerMoveType: MoveType,
  opponentMoveType: MoveType,
): number {
  // Rock-paper-scissors: attack > finisher, defense > attack, finisher > defense
  if (
    (playerMoveType === 'attack' && opponentMoveType === 'finisher') ||
    (playerMoveType === 'defense' && opponentMoveType === 'attack') ||
    (playerMoveType === 'finisher' && opponentMoveType === 'defense')
  ) {
    return MOVE_TYPE_POINTS_WIN;
  }

  if (
    (playerMoveType === 'finisher' && opponentMoveType === 'attack') ||
    (playerMoveType === 'attack' && opponentMoveType === 'defense') ||
    (playerMoveType === 'defense' && opponentMoveType === 'finisher')
  ) {
    return MOVE_TYPE_POINTS_LOSE;
  }

  // Same vs same: neutral
  return 0;
}

export function applyMoveTypeModifier(
  normalizedScore: number,
  playerMoveType: MoveType,
  opponentMoveType: MoveType,
): number {
  return Math.max(
    0,
    normalizedScore + moveTypePoints(playerMoveType, opponentMoveType),
  );
}

/**
 * Run full judge pipeline: double-run with tiebreaker if needed
 * Includes JSON schema validation and frozen prompt version
 */
export async function runJudgePipeline(
  provider: AiJudgeProvider,
  promptOne: string,
  promptTwo: string,
  moveTypeOne: MoveType,
  moveTypeTwo: MoveType,
  wordCountOne: number,
  wordCountTwo: number,
  theme: string | null,
  promptVersion = JUDGE_PROMPT_VERSION,
): Promise<JudgeRunResult> {
  const calls: JudgeCallProvenance[] = [];
  const run = async () => {
    const seed = Math.floor(Math.random() * 2147483647);
    const raw = await provider.judge({
      promptOne,
      promptTwo,
      moveTypeOne,
      moveTypeTwo,
      theme,
      seed,
      promptVersion,
    });
    const response = validateJudgeResponse(raw);
    const one = normalizeScores(response.playerOneScores, wordCountOne);
    const two = normalizeScores(response.playerTwoScores, wordCountTwo);
    calls.push({
      response_id: raw.responseId,
      model_id: response.modelId,
      prompt_version: response.promptVersion,
      seed,
      fallback: raw.fallback === true || response.modelId.startsWith('mock'),
      player_one_raw_scores: response.playerOneScores,
      player_two_raw_scores: response.playerTwoScores,
      player_one_normalized_scores: one,
      player_two_normalized_scores: two,
      explanation: response.explanation,
      cost_usd: raw.costUsd,
    });
    const scoreOne = applyMoveTypeModifier(
      aggregateScore(one),
      moveTypeOne,
      moveTypeTwo,
    );
    const scoreTwo = applyMoveTypeModifier(
      aggregateScore(two),
      moveTypeTwo,
      moveTypeOne,
    );
    return { response, one, two, winner: Math.sign(scoreOne - scoreTwo) };
  };
  const first = await run();
  const second = await run();
  const disagreement =
    first.winner !== second.winner && first.winner !== 0 && second.winner !== 0;
  const third = disagreement ? await run() : null;
  const average = (
    one: JudgeRubricScores,
    two: JudgeRubricScores,
  ): JudgeRubricScores =>
    Object.fromEntries(
      Object.keys(one).map((k) => [
        k,
        (one[k as keyof JudgeRubricScores] +
          two[k as keyof JudgeRubricScores]) /
          2,
      ]),
    ) as unknown as JudgeRubricScores;
  const one = third?.one ?? average(first.one, second.one);
  const two = third?.two ?? average(first.two, second.two);
  const scoreOne = applyMoveTypeModifier(
    aggregateScore(one),
    moveTypeOne,
    moveTypeTwo,
  );
  const scoreTwo = applyMoveTypeModifier(
    aggregateScore(two),
    moveTypeTwo,
    moveTypeOne,
  );
  const diff = Math.abs(scoreOne - scoreTwo);
  const isDraw = diff < 3;
  return {
    player_one_raw_scores:
      third?.response.playerOneScores ??
      average(first.response.playerOneScores, second.response.playerOneScores),
    player_two_raw_scores:
      third?.response.playerTwoScores ??
      average(first.response.playerTwoScores, second.response.playerTwoScores),
    player_one_normalized_scores: one,
    player_two_normalized_scores: two,
    winner_profile_id: isDraw ? null : scoreOne > scoreTwo ? 'p1' : 'p2',
    is_draw: isDraw,
    explanation: (third ?? first).response.explanation,
    aggregate_score_diff: diff,
    calls,
    aggregation: third ? 'third_run' : 'mean_agreeing',
    mock_assisted: calls.some((c) => c.fallback),
    total_cost_usd: calls.some((c) => c.cost_usd !== undefined)
      ? calls.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0)
      : undefined,
    provider_calls: calls.length,
  };
}

/**
 * Get current judge prompt version
 */
export function getJudgePromptVersion(): string {
  return JUDGE_PROMPT_VERSION;
}
