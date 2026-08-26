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
  mapXAIVideoStatus,
  XAIVideoProvider,
} from '../_shared/providers.ts';
import type { VideoGenerationRequest } from '../_shared/providers.ts';

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

Deno.test('xAI video status preserves post-generation moderation verdict', () => {
  const approved = mapXAIVideoStatus({
    status: 'done',
    video: {
      url: 'https://vidgen.x.ai/example.mp4',
      respect_moderation: true,
    },
  });
  const rejected = mapXAIVideoStatus({
    status: 'done',
    video: {
      url: 'https://vidgen.x.ai/example.mp4',
      respect_moderation: false,
    },
  });

  assertEquals(approved.moderationApproved, true);
  assertEquals(approved.moderationProvider, 'xai_generation');
  assertEquals(rejected.moderationApproved, false);
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

// ---------------------------------------------------------------------------
// XAIVideoProvider — reference images
// ---------------------------------------------------------------------------
//
// These assert on the REQUEST BODY, not on a response, because the whole risk
// of this feature is silent: a wrong model or a dropped key does not error, it
// just produces a video that ignores the fighters' portraits.

function baseVideoRequest(
  referenceImageUrls?: string[],
): VideoGenerationRequest {
  return {
    battleId: 'b-1',
    playerOneCharacterName: 'Ash',
    playerOneArchetype: 'titan',
    playerOnePrompt: 'A blazing uppercut.',
    playerOneMoveType: 'attack',
    playerTwoCharacterName: 'Vex',
    playerTwoArchetype: 'trickster',
    playerTwoPrompt: 'A mirrored feint.',
    playerTwoMoveType: 'defense',
    winnerId: 'p1',
    isDraw: false,
    theme: 'Neon rooftop',
    targetDurationSeconds: 8,
    aspectRatio: '9:16',
    safetyConstraints: ['no_nsfw'],
    referenceImageUrls,
  };
}

/**
 * Runs one submission against a stubbed fetch and returns the parsed body.
 * Restores env and globalThis.fetch unconditionally so a failing assertion
 * cannot leak state into the next test.
 */
async function captureVideoRequestBody(
  env: Record<string, string | undefined>,
  referenceImageUrls?: string[],
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const keys = [
    'XAI_API_KEY',
    'XAI_VIDEO_MODEL',
    'XAI_VIDEO_REFERENCE_MODEL',
    'XAI_VIDEO_REFERENCE_ENABLED',
  ];
  const previous = new Map(keys.map((k) => [k, Deno.env.get(k)]));
  const originalFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  let captured: any = null;

  try {
    for (const k of keys) {
      const v = env[k];
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }

    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? '{}'));
      return Promise.resolve(
        new Response(
          JSON.stringify({ request_id: 'job-1', status: 'pending' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      // deno-lint-ignore no-explicit-any
    }) as any;

    const provider = new XAIVideoProvider();
    await provider.submitVideoGeneration(baseVideoRequest(referenceImageUrls));
    return captured;
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of previous) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test('XAIVideoProvider - no references sends base model, no image key', async () => {
  const body = await captureVideoRequestBody(
    { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
    [],
  );

  assertEquals(body.model, 'grok-imagine-video');
  // Absent, not empty: an empty array could be read by the provider as
  // "reference-to-video with nothing to reference".
  assertEquals('reference_image_urls' in body, false);
});

Deno.test('XAIVideoProvider - references bump the model and are sent', async () => {
  const body = await captureVideoRequestBody(
    { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
    ['https://example.test/a.png?token=x', 'https://example.test/b.png?token=y'],
  );

  assertEquals(body.model, 'grok-imagine-video-1.5');
  assertEquals(body.reference_image_urls.length, 2);
  assertEquals(body.reference_image_urls[0], 'https://example.test/a.png?token=x');
});

Deno.test('XAIVideoProvider - references truncate to the 7-image cap', async () => {
  const nine = Array.from({ length: 9 }, (_, i) => `https://example.test/${i}.png`);
  const body = await captureVideoRequestBody(
    { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
    nine,
  );

  assertEquals(body.reference_image_urls.length, 7);
  assertEquals(body.reference_image_urls[6], 'https://example.test/6.png');
});

Deno.test('XAIVideoProvider - flag off ignores references entirely', async () => {
  // The default state. Until the flag is turned on, passing references must
  // change nothing at all — same model, same body as before this feature.
  const body = await captureVideoRequestBody(
    { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: undefined },
    ['https://example.test/a.png'],
  );

  assertEquals(body.model, 'grok-imagine-video');
  assertEquals('reference_image_urls' in body, false);
});
