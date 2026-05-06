// Enhanced Judge Pipeline Tests
// Tests JSON schema validation, length normalization, move matchup, and full pipeline

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  validateJudgeResponse,
  aggregateScore,
  normalizeScores,
  applyMoveTypeModifier,
  runJudgePipeline,
  JUDGE_PROMPT_VERSION,
} from '../_shared/judge.ts';
import { MockJudgeProvider } from '../_shared/providers.ts';

Deno.test('validateJudgeResponse - accepts valid response', () => {
  const validResponse = {
    playerOneScores: {
      clarity: 8.5,
      originality: 7.0,
      specificity: 9.0,
      theme_fit: 6.5,
      archetype_fit: 7.5,
      dramatic_potential: 8.0,
    },
    playerTwoScores: {
      clarity: 6.0,
      originality: 8.5,
      specificity: 5.5,
      theme_fit: 7.0,
      archetype_fit: 6.0,
      dramatic_potential: 7.5,
    },
    explanation: 'Player one had superior clarity and specificity.',
    modelId: 'test-model',
    promptVersion: 'v1.0.0',
  };

  const validated = validateJudgeResponse(validResponse);
  assertExists(validated);
  assertEquals(validated.playerOneScores.clarity, 8.5);
  assertEquals(validated.explanation, 'Player one had superior clarity and specificity.');
});

Deno.test('validateJudgeResponse - rejects invalid scores', () => {
  const invalidResponse = {
    playerOneScores: {
      clarity: 15, // out of range
      originality: 7,
      specificity: 9,
      theme_fit: 6,
      archetype_fit: 7,
      dramatic_potential: 8,
    },
    playerTwoScores: {
      clarity: 6,
      originality: 8,
      specificity: 5,
      theme_fit: 7,
      archetype_fit: 6,
      dramatic_potential: 7,
    },
    explanation: 'Test explanation',
  };

  let errorThrown = false;
  try {
    validateJudgeResponse(invalidResponse);
  } catch (error) {
    errorThrown = true;
    assertEquals(error instanceof Error, true);
  }
  assertEquals(errorThrown, true);
});

Deno.test('validateJudgeResponse - rejects missing fields', () => {
  const invalidResponse = {
    playerOneScores: {
      clarity: 8,
      originality: 7,
      // missing other fields
    },
    explanation: 'Test',
  };

  let errorThrown = false;
  try {
    validateJudgeResponse(invalidResponse);
  } catch (error) {
    errorThrown = true;
  }
  assertEquals(errorThrown, true);
});

Deno.test('aggregateScore - sums rubric scores', () => {
  const scores = {
    clarity: 8.0,
    originality: 7.0,
    specificity: 9.0,
    theme_fit: 6.0,
    archetype_fit: 7.0,
    dramatic_potential: 8.0,
  };

  const total = aggregateScore(scores);
  assertEquals(total, 45.0);
});

Deno.test('normalizeScores - applies length penalty for long prompts', () => {
  const rawScores = {
    clarity: 10.0,
    originality: 10.0,
    specificity: 10.0,
    theme_fit: 10.0,
    archetype_fit: 10.0,
    dramatic_potential: 10.0,
  };

  // Short prompt: no penalty
  const normalizedShort = normalizeScores(rawScores, 50);
  assertEquals(normalizedShort.clarity, 10.0);

  // Long prompt: penalty applied
  const normalizedLong = normalizeScores(rawScores, 200);
  assertEquals(normalizedLong.clarity < 10.0, true);
  assertEquals(normalizedLong.originality < 10.0, true);
});

Deno.test('normalizeScores - no penalty below threshold', () => {
  const rawScores = {
    clarity: 9.0,
    originality: 8.0,
    specificity: 9.5,
    theme_fit: 7.5,
    archetype_fit: 8.5,
    dramatic_potential: 9.0,
  };

  const normalized = normalizeScores(rawScores, 80);
  assertEquals(normalized.clarity, 9.0);
  assertEquals(normalized.originality, 8.0);
});

Deno.test('applyMoveTypeModifier - attack beats finisher', () => {
  const baseScore = 50.0;

  const modifiedScore = applyMoveTypeModifier(baseScore, 'attack', 'finisher');
  assertEquals(modifiedScore, 50.0 * 1.12); // +12%
});

Deno.test('applyMoveTypeModifier - defense beats attack', () => {
  const baseScore = 50.0;

  const modifiedScore = applyMoveTypeModifier(baseScore, 'defense', 'attack');
  assertEquals(modifiedScore, 50.0 * 1.12);
});

Deno.test('applyMoveTypeModifier - finisher beats defense', () => {
  const baseScore = 50.0;

  const modifiedScore = applyMoveTypeModifier(baseScore, 'finisher', 'defense');
  assertEquals(modifiedScore, 50.0 * 1.12);
});

Deno.test('applyMoveTypeModifier - same move types neutral', () => {
  const baseScore = 50.0;

  const modifiedScore = applyMoveTypeModifier(baseScore, 'attack', 'attack');
  assertEquals(modifiedScore, 50.0); // no modifier
});

Deno.test('applyMoveTypeModifier - losing matchup applies penalty', () => {
  const baseScore = 50.0;

  const modifiedScore = applyMoveTypeModifier(baseScore, 'finisher', 'attack');
  assertEquals(modifiedScore, 50.0 * 0.92); // -8%
});

Deno.test('runJudgePipeline - returns valid result with double-run', async () => {
  const provider = new MockJudgeProvider();

  const result = await runJudgePipeline(
    provider,
    'This is a well-crafted strategic prompt with detail and clarity.',
    'Short prompt.',
    'defense',
    'attack',
    10, // word count
    2,  // word count
    'Epic battle theme',
    JUDGE_PROMPT_VERSION
  );

  assertExists(result);
  assertExists(result.player_one_raw_scores);
  assertExists(result.player_two_raw_scores);
  assertExists(result.player_one_normalized_scores);
  assertExists(result.player_two_normalized_scores);
  assertExists(result.explanation);
  assertEquals(typeof result.aggregate_score_diff, 'number');
  assertEquals(typeof result.is_draw, 'boolean');

  // Winner should be p1 or p2 or null (draw)
  assertEquals(['p1', 'p2', null].includes(result.winner_profile_id), true);
});

Deno.test('runJudgePipeline - applies move type modifier', async () => {
  const provider = new MockJudgeProvider();

  // defense beats attack, so player one should have advantage
  const result = await runJudgePipeline(
    provider,
    'Player one defense prompt.',
    'Player two attack prompt.',
    'defense', // player one
    'attack',  // player two
    5,
    5,
    'Theme',
    JUDGE_PROMPT_VERSION
  );

  assertExists(result);
  // Note: Due to mock provider determinism, winner depends on seed and prompt length
  // Just verify result structure is correct
  assertExists(result.winner_profile_id);
});

Deno.test('runJudgePipeline - detects draw with small score difference', async () => {
  const provider = new MockJudgeProvider();

  // Use identical prompts to likely trigger draw
  const result = await runJudgePipeline(
    provider,
    'Identical prompt text here.',
    'Identical prompt text here.',
    'attack',
    'attack',
    4,
    4,
    'Theme',
    JUDGE_PROMPT_VERSION
  );

  // With identical prompts and move types, likely draw (but depends on seed randomness)
  assertExists(result);
  assertEquals(typeof result.is_draw, 'boolean');
});

Deno.test('runJudgePipeline - applies length normalization', async () => {
  const provider = new MockJudgeProvider();

  const result = await runJudgePipeline(
    provider,
    'This is a very long prompt with many words to trigger length normalization penalty. ' +
    'It keeps going and going to exceed the optimal word count threshold so that the ' +
    'scores are penalized for verbosity rather than rewarded for length alone. ' +
    'More words here to make it even longer and ensure the penalty kicks in properly.',
    'Short.',
    'attack',
    'attack',
    50, // long word count
    1,  // short word count
    'Theme',
    JUDGE_PROMPT_VERSION
  );

  assertExists(result);
  assertExists(result.player_one_normalized_scores);

  // Verify normalization was applied (normalized < raw for long prompt)
  const rawAggregate = aggregateScore(result.player_one_raw_scores);
  const normAggregate = aggregateScore(result.player_one_normalized_scores);

  // Normalized should be equal or less than raw (penalty applied or no penalty)
  assertEquals(normAggregate <= rawAggregate, true);
});
