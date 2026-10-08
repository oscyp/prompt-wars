// AI Provider Tests
// Tests for judge, image, video, and TTS providers

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  VideoProviderError,
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
import { buildCinematicInput } from '../_shared/cinematic-inputs.ts';
import { resolveCinematicReferences } from '../_shared/cinematic-references.ts';
import { cinematicSource } from './fixtures/cinematic.ts';
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
    promptVersion: 'v1.0.0-mvp',
  });

  assertExists(response);
  assertExists(response.playerOneScores);
  assertExists(response.playerTwoScores);
  assertExists(response.explanation);
  assertEquals(response.modelId, 'mock-judge-v1.0.0');
  assertEquals(response.promptVersion, 'v1.0.0-mvp');

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
    promptVersion: 'v1.0.0-mvp',
  });

  const response2 = await provider.judge({
    promptOne: 'Test prompt',
    promptTwo: 'Another prompt',
    moveTypeOne: 'attack',
    moveTypeTwo: 'defense',
    theme: 'Theme',
    seed,
    promptVersion: 'v1.0.0-mvp',
  });

  assertEquals(response1.playerOneScores, response2.playerOneScores);
  assertEquals(response1.playerTwoScores, response2.playerTwoScores);
});

Deno.test(
  'MockImageProvider - returns Tier 0 composition metadata',
  async () => {
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
  },
);

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

Deno.test(
  'xAI video status preserves post-generation moderation verdict',
  () => {
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
  },
);

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
  overrides: Partial<VideoGenerationRequest> = {},
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
    await provider.submitVideoGeneration({
      ...baseVideoRequest(referenceImageUrls),
      ...overrides,
    });
    return captured;
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of previous) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test(
  'XAIVideoProvider - no references sends base model, no image key',
  async () => {
    const body = await captureVideoRequestBody(
      { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
      [],
    );

    assertEquals(body.model, 'grok-imagine-video');
    // Absent, not empty: an empty array could be read by the provider as
    // "reference-to-video with nothing to reference".
    assertEquals('reference_images' in body, false);
  },
);

Deno.test(
  'XAIVideoProvider - references bump the model and are sent',
  async () => {
    const body = await captureVideoRequestBody(
      { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
      [
        'https://example.test/a.png?token=x',
        'https://example.test/b.png?token=y',
      ],
    );

    assertEquals(body.model, 'grok-imagine-video-1.5');
    assertEquals(body.reference_images.length, 2);
    assertEquals(
      body.reference_images[0].url,
      'https://example.test/a.png?token=x',
    );
  },
);

Deno.test(
  'XAIVideoProvider - references truncate to the 7-image cap',
  async () => {
    const nine = Array.from(
      { length: 9 },
      (_, i) => `https://example.test/${i}.png`,
    );
    const body = await captureVideoRequestBody(
      { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: 'true' },
      nine,
    );

    assertEquals(body.reference_images.length, 7);
    assertEquals(body.reference_images[6].url, 'https://example.test/6.png');
  },
);

Deno.test(
  'XAIVideoProvider - flag off ignores references entirely',
  async () => {
    // The default state. Until the flag is turned on, passing references must
    // change nothing at all — same model, same body as before this feature.
    const body = await captureVideoRequestBody(
      { XAI_API_KEY: 'k', XAI_VIDEO_REFERENCE_ENABLED: undefined },
      ['https://example.test/a.png'],
    );

    assertEquals(body.model, 'grok-imagine-video');
    assertEquals('reference_images' in body, false);
  },
);

// --- poll error classification ---------------------------------------------
//
// pollVideoStatus used to throw a bare Error on any non-2xx, which the
// worker's catch-all turned into a terminal `processing_error`. So a single
// rate limit permanently failed -- and refunded -- a job whose video was
// generating perfectly well. The code on the error is what lets the worker
// tell "ask again later" from "this job is over".

async function pollWithStatus(status: number): Promise<VideoProviderError> {
  const originalFetch = globalThis.fetch;
  const hadKey = Deno.env.get('XAI_API_KEY');
  Deno.env.set('XAI_API_KEY', 'test-key');
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('upstream said no', { status }),
      // deno-lint-ignore no-explicit-any
    )) as any;
  try {
    const provider = new XAIVideoProvider();
    return (await assertRejects(
      () => provider.pollVideoStatus('job-1'),
      VideoProviderError,
    )) as VideoProviderError;
  } finally {
    globalThis.fetch = originalFetch;
    if (hadKey === undefined) Deno.env.delete('XAI_API_KEY');
    else Deno.env.set('XAI_API_KEY', hadKey);
  }
}

Deno.test('XAIVideoProvider - a rate-limited poll is transient', async () => {
  const err = await pollWithStatus(429);
  assertEquals(err.code, 'rate_limited');
  assertEquals(err.status, 429);
});

Deno.test('XAIVideoProvider - an upstream outage is transient', async () => {
  assertEquals((await pollWithStatus(503)).code, 'server_error');
});

Deno.test(
  'XAIVideoProvider - a 4xx is the provider having the last word',
  async () => {
    assertEquals((await pollWithStatus(404)).code, 'client_error');
  },
);

Deno.test('XAIVideoProvider - a transport failure is transient', async () => {
  const originalFetch = globalThis.fetch;
  const hadKey = Deno.env.get('XAI_API_KEY');
  Deno.env.set('XAI_API_KEY', 'test-key');
  globalThis.fetch = (() =>
    // deno-lint-ignore no-explicit-any
    Promise.reject(new TypeError('connection reset'))) as any;
  try {
    const provider = new XAIVideoProvider();
    const err = (await assertRejects(
      () => provider.pollVideoStatus('job-1'),
      VideoProviderError,
    )) as VideoProviderError;
    assertEquals(err.code, 'network');
  } finally {
    globalThis.fetch = originalFetch;
    if (hadKey === undefined) Deno.env.delete('XAI_API_KEY');
    else Deno.env.set('XAI_API_KEY', hadKey);
  }
});

Deno.test('XAIVideoProvider - a healthy poll still maps normally', async () => {
  const originalFetch = globalThis.fetch;
  const hadKey = Deno.env.get('XAI_API_KEY');
  Deno.env.set('XAI_API_KEY', 'test-key');
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ status: 'done', video: { url: 'https://v/1.mp4' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
      // deno-lint-ignore no-explicit-any
    )) as any;
  try {
    const status = await new XAIVideoProvider().pollVideoStatus('job-1');
    assertEquals(status.status, 'succeeded');
    assertEquals(status.videoUrl, 'https://v/1.mp4');
  } finally {
    globalThis.fetch = originalFetch;
    if (hadKey === undefined) Deno.env.delete('XAI_API_KEY');
    else Deno.env.set('XAI_API_KEY', hadKey);
  }
});

Deno.test('xAI video status records actual output length', () => {
  assertEquals(
    mapXAIVideoStatus({
      status: 'done',
      video: { url: 'https://v/1.mp4', duration: 14.9 },
    } as any).durationSeconds,
    14.9,
  );
});

Deno.test(
  'immutable cinematic input sends both references, moves, 15 seconds and 720p even after rollout is disabled',
  async () => {
    const cinematicInput = buildCinematicInput(cinematicSource());
    const cinematicReferences = await resolveCinematicReferences(
      cinematicInput,
      {
        isApproved: async () => true,
        sign: async (ref) => `https://assets.test/${ref.path}`,
      },
    );
    const body = await captureVideoRequestBody({ XAI_API_KEY: 'k' }, [], {
      cinematicInput,
      cinematicReferences,
      targetDurationSeconds: 15,
    });
    assertEquals(body.duration, 15);
    assertEquals(body.resolution, '720p');
    assertEquals(body.generate_audio, true);
    assertEquals(
      body.prompt.includes('synchronized ambient and action sound effects'),
      true,
    );
    assertEquals(/silent visual|no audio track/i.test(body.prompt), false);
    assertEquals(body.model, 'grok-imagine-video-1.5');
    assertEquals(body.reference_images.length, 2);
    assertEquals(body.prompt.includes('P2 uses <IMAGE_1>'), true);
    assertEquals(
      body.prompt.includes('I pull the rope to tilt the bridge.'),
      true,
    );
    assertEquals('reference_image_urls' in body, false);
  },
);
Deno.test(
  'provider rejects unsupported length rather than silently shortening a paid clip',
  async () => {
    await assertRejects(
      () =>
        captureVideoRequestBody({ XAI_API_KEY: 'k' }, [], {
          targetDurationSeconds: 20,
        }),
      Error,
      'duration',
    );
  },
);

Deno.test(
  'provider refuses malformed cinematic reference ownership and indices before any paid request',
  async () => {
    const input = buildCinematicInput(cinematicSource());
    const references = await resolveCinematicReferences(input, {
      isApproved: async () => true,
      sign: async (ref) => `https://assets.test/${ref.path}`,
    });
    const cases: Array<(refs: any[]) => void> = [
      (refs) => {
        delete refs[0].referenceIndex;
      },
      (refs) => {
        refs[0].referenceIndex = 1;
      },
      (refs) => {
        refs[1].referenceIndex = 0;
      },
      (refs) => {
        refs[0].side = 'outsider';
      },
      (refs) => {
        refs[1].side = 'p1';
      },
      (refs) => {
        refs[0].side = 'p2';
        refs[1].side = 'p1';
      },
      (refs) => {
        refs[0].url = 'http://insecure.test/reference';
      },
      (refs) => {
        refs[0].url = 'data:image/png;base64,';
      },
      (refs) => {
        refs[0].url = 'data:image/png;base64,@@@@';
      },
      (refs) => {
        refs[0].url = 'data:image/svg+xml;base64,AQID';
      },
      (refs) => {
        refs[0].url = 'data:image/png;base64,AQID===';
      },
      (refs) => {
        for (let i = 2; i < 8; i++)
          refs.push({ ...refs[0], kind: 'item', referenceIndex: i });
      },
    ];
    const previousKey = Deno.env.get('XAI_API_KEY');
    const previousFetch = globalThis.fetch;
    let paidCalls = 0;
    Deno.env.set('XAI_API_KEY', 'test-key');
    globalThis.fetch = (() => {
      paidCalls++;
      return Promise.resolve(Response.json({ request_id: 'paid-job' }));
    }) as typeof fetch;
    try {
      for (const change of cases) {
        const refs = structuredClone(references);
        change(refs);
        await assertRejects(
          () =>
            new XAIVideoProvider().submitVideoGeneration({
              battleId: 'battle',
              targetDurationSeconds: 15,
              aspectRatio: '9:16',
              cinematicInput: input,
              cinematicReferences: refs,
            } as any),
          Error,
          'reference',
        );
      }
      assertEquals(paidCalls, 0);
    } finally {
      globalThis.fetch = previousFetch;
      previousKey === undefined
        ? Deno.env.delete('XAI_API_KEY')
        : Deno.env.set('XAI_API_KEY', previousKey);
    }
  },
);

Deno.test(
  'cinematic references accept valid inline raster data URLs for verified smoke fixtures',
  async () => {
    const input = buildCinematicInput(cinematicSource());
    const refs = await resolveCinematicReferences(input, {
      isApproved: async () => true,
      sign: async (ref) => `https://assets.test/${ref.path}`,
    });
    for (const mime of ['jpeg', 'png', 'webp']) {
      refs[0].url = `data:image/${mime};base64,AQID`;
      const body = await captureVideoRequestBody(
        { XAI_API_KEY: 'test-key' },
        [],
        {
          cinematicInput: input,
          cinematicReferences: refs,
          targetDurationSeconds: 15,
        },
      );
      assertEquals(body.reference_images[0].url, refs[0].url);
      assertEquals(body.prompt.includes('P1 uses <IMAGE_0>'), true);
    }
  },
);

Deno.test(
  'Plus 20-second v3 requests a 15-second reference base, never an unsupported 20-second generation',
  async () => {
    const input = buildCinematicInput(cinematicSource());
    input.policy.duration_policy_version = 'cinematics-v3';
    input.policy.target_duration_seconds = 20;
    const refs = await resolveCinematicReferences(input, {
      isApproved: () => Promise.resolve(true),
      sign: (ref) => Promise.resolve(`https://assets.test/${ref.path}`),
    });
    const body = await captureVideoRequestBody(
      { XAI_API_KEY: 'test-key' },
      [],
      {
        cinematicInput: input,
        cinematicReferences: refs,
        targetDurationSeconds: 20,
      },
    );
    assertEquals(body.duration, 15);
    assertEquals(body.reference_images.length, 2);
    assertEquals(body.resolution, '720p');
    assertEquals(body.generate_audio, true);
    assertEquals(
      body.prompt.includes('synchronized ambient and action sound effects'),
      true,
    );
    assertEquals(/silent visual|no audio track/i.test(body.prompt), false);
  },
);

Deno.test(
  'Plus extension uses exactly five added seconds and the documented extension endpoint',
  async () => {
    const previousKey = Deno.env.get('XAI_API_KEY');
    const previousFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    Deno.env.set('XAI_API_KEY', 'test-key');
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(Response.json({ request_id: 'extension-job' }));
    }) as typeof fetch;
    try {
      const result = await (new XAIVideoProvider() as any).submitVideoExtension(
        {
          videoUrl: 'https://storage.test/base.mp4',
          prompt: 'Continue the recorded outcome without changing the winner.',
          durationSeconds: 5,
        },
      );
      assertEquals(calls, [
        {
          url: 'https://api.x.ai/v1/videos/extensions',
          body: {
            model: 'grok-imagine-video',
            video: { url: 'https://storage.test/base.mp4' },
            duration: 5,
            prompt:
              'Continue the recorded outcome without changing the winner.',
          },
        },
      ]);
      assertEquals(result.providerJobId, 'extension-job');
      assertEquals(result.durationSeconds, 5);
      for (const durationSeconds of [0, 1, 11, 20])
        await assertRejects(
          () =>
            (new XAIVideoProvider() as any).submitVideoExtension({
              videoUrl: 'https://storage.test/base.mp4',
              prompt: 'Continue',
              durationSeconds,
            }),
          Error,
        );
      assertEquals(calls.length, 1);
    } finally {
      globalThis.fetch = previousFetch;
      previousKey === undefined
        ? Deno.env.delete('XAI_API_KEY')
        : Deno.env.set('XAI_API_KEY', previousKey);
    }
  },
);

Deno.test(
  'xAI completed video maps exact billed cost ticks including video input charges',
  () => {
    assertEquals(
      (
        mapXAIVideoStatus({
          status: 'done',
          video: { url: 'https://video.test/20.mp4', duration: 20 },
          usage: { cost_in_usd_ticks: 12340000000 },
        } as any) as any
      ).costUsd,
      1.234,
    );
    for (const cost_in_usd_ticks of [-1, Number.NaN, '1000'])
      assertEquals(
        (
          mapXAIVideoStatus({
            status: 'done',
            usage: { cost_in_usd_ticks },
          } as any) as any
        ).costUsd,
        undefined,
      );
  },
);
