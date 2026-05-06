// AI Provider Tests
// Tests for judge, image, video, and TTS providers

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  MockJudgeProvider,
  MockImageProvider,
  MockVideoProvider,
  MockTtsProvider,
  createJudgeProvider,
  createImageProvider,
  createVideoProvider,
  createTtsProvider,
} from '../_shared/providers.ts';

Deno.test('MockJudgeProvider - returns valid scores', async () => {
  const provider = new MockJudgeProvider();

  const response = await provider.judge({
    promptOne: 'This is a test prompt with several words to test scoring.',
    promptTwo: 'Another test prompt.',
    moveTypeOne: 'attack',
    moveTypeTwo: 'defense',
    theme: 'Battle theme',
    seed: 12345,
    promptVersion: 'v1.0.0-test',
  });

  assertExists(response);
  assertExists(response.playerOneScores);
  assertExists(response.playerTwoScores);
  assertExists(response.explanation);
  assertEquals(response.modelId, 'mock-judge-v1.0.0');
  assertEquals(response.promptVersion, 'v1.0.0-test');

  // Validate score ranges
  const validateScores = (scores: typeof response.playerOneScores) => {
    assertEquals(typeof scores.clarity, 'number');
    assertEquals(typeof scores.originality, 'number');
    assertEquals(typeof scores.specificity, 'number');
    assertEquals(typeof scores.theme_fit, 'number');
    assertEquals(typeof scores.archetype_fit, 'number');
    assertEquals(typeof scores.dramatic_potential, 'number');

    // All scores 0-10
    Object.values(scores).forEach((score) => {
      assertEquals(score >= 0 && score <= 10, true);
    });
  };

  validateScores(response.playerOneScores);
  validateScores(response.playerTwoScores);
});

Deno.test('MockJudgeProvider - deterministic with same seed', async () => {
  const provider = new MockJudgeProvider();
  const seed = 99999;

  const response1 = await provider.judge({
    promptOne: 'Test prompt',
    promptTwo: 'Another prompt',
    moveTypeOne: 'attack',
    moveTypeTwo: 'defense',
    theme: 'Theme',
    seed,
    promptVersion: 'v1.0.0-test',
  });

  const response2 = await provider.judge({
    promptOne: 'Test prompt',
    promptTwo: 'Another prompt',
    moveTypeOne: 'attack',
    moveTypeTwo: 'defense',
    theme: 'Theme',
    seed,
    promptVersion: 'v1.0.0-test',
  });

  assertEquals(response1.playerOneScores, response2.playerOneScores);
  assertEquals(response1.playerTwoScores, response2.playerTwoScores);
});

Deno.test('MockImageProvider - returns Tier 0 composition metadata', async () => {
  const provider = new MockImageProvider();

  const response = await provider.generateMotionPoster({
    battleId: 'test-battle-123',
    winnerCharacterName: 'Alice',
    winnerArchetype: 'strategist',
    winnerSignatureColor: '#FF5733',
    loserCharacterName: 'Bob',
    loserArchetype: 'titan',
    moveTypeWinner: 'defense',
    moveTypeLoser: 'attack',
    isDraw: false,
  });

  assertExists(response);
  assertEquals(response.compositionType, 'motion_poster');
  assertEquals(response.animationPreset, 'defense_counter_3s'); // defense wins
  assertEquals(response.musicStingId, 'music_tactical_victory'); // strategist
  assertExists(response.metadata);
  assertEquals(response.metadata.winnerArchetype, 'strategist');
  assertEquals(response.metadata.winnerColor, '#FF5733');
});

Deno.test('MockImageProvider - handles draw outcome', async () => {
  const provider = new MockImageProvider();

  const response = await provider.generateMotionPoster({
    battleId: 'test-battle-draw',
    winnerCharacterName: 'Alice',
    winnerArchetype: 'mystic',
    winnerSignatureColor: '#00FFFF',
    loserCharacterName: 'Bob',
    loserArchetype: 'engineer',
    moveTypeWinner: 'attack',
    moveTypeLoser: 'attack',
    isDraw: true,
  });

  assertEquals(response.animationPreset, 'draw_neutral');
  assertEquals(response.musicStingId, 'music_draw_ambiguous');
});

Deno.test('MockVideoProvider - submits video generation', async () => {
  const provider = new MockVideoProvider();

  const submission = await provider.submitVideoGeneration({
    battleId: 'battle-456',
    playerOneCharacterName: 'Alice',
    playerOneArchetype: 'strategist',
    playerOnePrompt: 'My strategic prompt',
    playerOneMoveType: 'defense',
    playerTwoCharacterName: 'Bob',
    playerTwoArchetype: 'titan',
    playerTwoPrompt: 'My powerful attack',
    playerTwoMoveType: 'attack',
    winnerId: 'p1',
    isDraw: false,
    theme: 'Epic battle',
    targetDurationSeconds: 8,
    aspectRatio: '9:16',
    safetyConstraints: ['no_violence', 'no_nsfw'],
  });

  assertExists(submission);
  assertExists(submission.providerJobId);
  assertExists(submission.providerRequestId);
  assertEquals(typeof submission.estimatedCompletionSeconds, 'number');
});

Deno.test('MockVideoProvider - polls video status', async () => {
  const provider = new MockVideoProvider();

  const status = await provider.pollVideoStatus('mock-video-job-123');

  assertExists(status);
  assertEquals(status.status, 'succeeded');
  assertExists(status.videoUrl);
});

Deno.test('MockTtsProvider - generates battle cry metadata', async () => {
  const provider = new MockTtsProvider();

  const response = await provider.generateBattleCry({
    battleCryText: 'Victory is mine!',
    characterArchetype: 'titan',
    voicePreset: '',
  });

  assertExists(response);
  assertEquals(response.voicePreset, 'voice_deep_powerful'); // titan preset
  assertEquals(typeof response.durationMs, 'number');
  assertEquals(response.durationMs > 0, true);
});

Deno.test('Provider factories return correct instances', () => {
  const judgeProvider = createJudgeProvider();
  assertExists(judgeProvider);

  const imageProvider = createImageProvider();
  assertExists(imageProvider);

  const videoProvider = createVideoProvider();
  assertExists(videoProvider);

  const ttsProvider = createTtsProvider();
  assertExists(ttsProvider);
});
