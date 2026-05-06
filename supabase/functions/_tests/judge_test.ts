// Tests for judge utilities
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  aggregateScore,
  normalizeScores,
  applyMoveTypeModifier,
} from '../_shared/judge.ts';
import { MockJudgeProvider } from '../_shared/providers.ts';
import type { JudgeRubricScores } from '../_shared/types.ts';

Deno.test('Judge: Aggregate score calculation', () => {
  const scores: JudgeRubricScores = {
    clarity: 8,
    originality: 7,
    specificity: 6,
    theme_fit: 9,
    archetype_fit: 7,
    dramatic_potential: 8,
  };
  
  const total = aggregateScore(scores);
  assertEquals(total, 45);
});

Deno.test('Judge: Length normalization penalizes verbosity', () => {
  const scores: JudgeRubricScores = {
    clarity: 10,
    originality: 10,
    specificity: 10,
    theme_fit: 10,
    archetype_fit: 10,
    dramatic_potential: 10,
  };
  
  const normalizedShort = normalizeScores(scores, 50); // 50 words
  const normalizedLong = normalizeScores(scores, 200); // 200 words (over 100 threshold)
  
  assertEquals(
    aggregateScore(normalizedShort) > aggregateScore(normalizedLong),
    true,
    'Long prompts should be penalized'
  );
});

Deno.test('Judge: Move type modifier - attack beats finisher', () => {
  const baseScore = 50;
  const modifiedScore = applyMoveTypeModifier(baseScore, 'attack', 'finisher');
  
  assertEquals(modifiedScore > baseScore, true, 'Attack should beat finisher');
  assertEquals(modifiedScore, baseScore * 1.12, 'Should apply 12% bonus');
});

Deno.test('Judge: Move type modifier - defense beats attack', () => {
  const baseScore = 50;
  const modifiedScore = applyMoveTypeModifier(baseScore, 'defense', 'attack');
  
  assertEquals(modifiedScore, baseScore * 1.12);
});

Deno.test('Judge: Move type modifier - finisher beats defense', () => {
  const baseScore = 50;
  const modifiedScore = applyMoveTypeModifier(baseScore, 'finisher', 'defense');
  
  assertEquals(modifiedScore, baseScore * 1.12);
});

Deno.test('Judge: Move type modifier - same vs same is neutral', () => {
  const baseScore = 50;
  const modifiedScore = applyMoveTypeModifier(baseScore, 'attack', 'attack');
  
  assertEquals(modifiedScore, baseScore, 'Same move types should be neutral');
});

Deno.test('Judge: Mock provider returns valid scores', async () => {
  const provider = new MockJudgeProvider();
  const result = await provider.judge({
    promptOne: 'A swift and decisive strike that catches the opponent off guard.',
    promptTwo: 'Block',
    moveTypeOne: 'attack',
    moveTypeTwo: 'defense',
    theme: 'speed',
    seed: 12345,    promptVersion: 'v1.0.0-mvp',  });
  
  assertEquals(typeof result.playerOneScores.clarity, 'number');
  assertEquals(typeof result.playerTwoScores.clarity, 'number');
  assertEquals(typeof result.explanation, 'string');
  assertEquals(result.playerOneScores.clarity >= 0, true);
  assertEquals(result.playerOneScores.clarity <= 10, true);
});
