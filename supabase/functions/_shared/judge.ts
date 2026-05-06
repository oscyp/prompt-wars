// AI Judge utilities for battle resolution
// Implements LLM-as-judge with rubric, length normalization, calibration, and JSON schema validation

import { MoveType, JudgeRubricScores, JudgeRunResult } from './types.ts';
import { AiJudgeProvider, JudgeRequest, JudgeResponse } from './providers.ts';

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
  const validateScores = (scores: unknown, label: string): JudgeRubricScores => {
    if (!scores || typeof scores !== 'object') {
      throw new Error(`${label} must be an object`);
    }

    const s = scores as Record<string, unknown>;
    const required = ['clarity', 'originality', 'specificity', 'theme_fit', 'archetype_fit', 'dramatic_potential'];

    for (const field of required) {
      if (typeof s[field] !== 'number') {
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

  const playerOneScores = validateScores(resp.playerOneScores, 'playerOneScores');
  const playerTwoScores = validateScores(resp.playerTwoScores, 'playerTwoScores');

  if (typeof resp.explanation !== 'string' || resp.explanation.length < 10 || resp.explanation.length > 2000) {
    throw new Error('Explanation must be a string between 10 and 2000 characters');
  }

  return {
    playerOneScores,
    playerTwoScores,
    explanation: resp.explanation,
    modelId: (resp as { modelId?: string }).modelId || 'unknown',
    promptVersion: (resp as { promptVersion?: string }).promptVersion || JUDGE_PROMPT_VERSION,
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
 * Length normalization: reduce marginal benefit of verbosity
 */
export function normalizeScores(
  rawScores: JudgeRubricScores,
  wordCount: number
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
 * Apply move-type matchup modifier: winning matchup +12%, losing matchup -8%
 * attack > finisher, defense > attack, finisher > defense
 */
export function applyMoveTypeModifier(
  normalizedScore: number,
  playerMoveType: MoveType,
  opponentMoveType: MoveType
): number {
  const WINNING_MODIFIER = 0.12; // +12% for winning matchup
  const LOSING_MODIFIER = 0.08;  // -8% for losing matchup
  
  // Rock-paper-scissors: winning matchups
  if (
    (playerMoveType === 'attack' && opponentMoveType === 'finisher') ||
    (playerMoveType === 'defense' && opponentMoveType === 'attack') ||
    (playerMoveType === 'finisher' && opponentMoveType === 'defense')
  ) {
    return normalizedScore * (1 + WINNING_MODIFIER);
  }
  
  // Losing matchups
  if (
    (playerMoveType === 'finisher' && opponentMoveType === 'attack') ||
    (playerMoveType === 'attack' && opponentMoveType === 'defense') ||
    (playerMoveType === 'defense' && opponentMoveType === 'finisher')
  ) {
    return normalizedScore * (1 - LOSING_MODIFIER);
  }
  
  // Same vs same: neutral
  return normalizedScore;
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
  promptVersion = JUDGE_PROMPT_VERSION
): Promise<JudgeRunResult> {
  const DRAW_EPSILON = 3.0; // Aggregate difference threshold for draw
  
  // First run with frozen prompt version
  const run1Raw = await provider.judge({
    promptOne,
    promptTwo,
    moveTypeOne,
    moveTypeTwo,
    theme,
    seed: Math.floor(Math.random() * 10000),
    promptVersion,
  });
  
  // Validate JSON schema
  const run1 = validateJudgeResponse(run1Raw);
  
  // Normalize both players
  const run1NormOne = normalizeScores(run1.playerOneScores, wordCountOne);
  const run1NormTwo = normalizeScores(run1.playerTwoScores, wordCountTwo);
  
  // Apply move type modifiers
  const run1ScoreOne = applyMoveTypeModifier(aggregateScore(run1NormOne), moveTypeOne, moveTypeTwo);
  const run1ScoreTwo = applyMoveTypeModifier(aggregateScore(run1NormTwo), moveTypeTwo, moveTypeOne);
  
  // Second run with different seed
  const run2Raw = await provider.judge({
    promptOne,
    promptTwo,
    moveTypeOne,
    moveTypeTwo,
    theme,
    seed: Math.floor(Math.random() * 10000),
    promptVersion,
  });
  
  const run2 = validateJudgeResponse(run2Raw);
  const run2NormOne = normalizeScores(run2.playerOneScores, wordCountOne);
  const run2NormTwo = normalizeScores(run2.playerTwoScores, wordCountTwo);
  const run2ScoreOne = applyMoveTypeModifier(aggregateScore(run2NormOne), moveTypeOne, moveTypeTwo);
  const run2ScoreTwo = applyMoveTypeModifier(aggregateScore(run2NormTwo), moveTypeTwo, moveTypeOne);
  
  // Check agreement
  const run1Winner = run1ScoreOne > run1ScoreTwo ? 1 : run1ScoreTwo > run1ScoreOne ? 2 : 0;
  const run2Winner = run2ScoreOne > run2ScoreTwo ? 1 : run2ScoreTwo > run2ScoreOne ? 2 : 0;
  
  // If disagree, run tiebreaker
  if (run1Winner !== run2Winner && run1Winner !== 0 && run2Winner !== 0) {
    const run3Raw = await provider.judge({
      promptOne,
      promptTwo,
      moveTypeOne,
      moveTypeTwo,
      theme,
      seed: Math.floor(Math.random() * 10000),
      promptVersion,
    });
    
    const run3 = validateJudgeResponse(run3Raw);
    const run3NormOne = normalizeScores(run3.playerOneScores, wordCountOne);
    const run3NormTwo = normalizeScores(run3.playerTwoScores, wordCountTwo);
    const finalScoreOne = applyMoveTypeModifier(aggregateScore(run3NormOne), moveTypeOne, moveTypeTwo);
    const finalScoreTwo = applyMoveTypeModifier(aggregateScore(run3NormTwo), moveTypeTwo, moveTypeOne);
    
    const diff = Math.abs(finalScoreOne - finalScoreTwo);
    const isDraw = diff < DRAW_EPSILON;
    
    return {
      player_one_raw_scores: run3.playerOneScores,
      player_two_raw_scores: run3.playerTwoScores,
      player_one_normalized_scores: run3NormOne,
      player_two_normalized_scores: run3NormTwo,
      winner_profile_id: isDraw ? null : finalScoreOne > finalScoreTwo ? 'p1' : 'p2',
      is_draw: isDraw,
      explanation: run3.explanation,
      aggregate_score_diff: Math.abs(finalScoreOne - finalScoreTwo),
    };
  }
  
  // Runs agree, use average
  const avgScoreOne = (run1ScoreOne + run2ScoreOne) / 2;
  const avgScoreTwo = (run1ScoreTwo + run2ScoreTwo) / 2;
  const diff = Math.abs(avgScoreOne - avgScoreTwo);
  const isDraw = diff < DRAW_EPSILON;
  
  // Return run1 scores as representative
  return {
    player_one_raw_scores: run1.playerOneScores,
    player_two_raw_scores: run1.playerTwoScores,
    player_one_normalized_scores: run1NormOne,
    player_two_normalized_scores: run1NormTwo,
    winner_profile_id: isDraw ? null : avgScoreOne > avgScoreTwo ? 'p1' : 'p2',
    is_draw: isDraw,
    explanation: run1.explanation,
    aggregate_score_diff: diff,
  };
}

/**
 * Get current judge prompt version
 */
export function getJudgePromptVersion(): string {
  return JUDGE_PROMPT_VERSION;
}
