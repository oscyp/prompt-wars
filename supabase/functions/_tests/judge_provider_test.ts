// Judge provider tests
//
// Covers the property that matters most: a judge outage must degrade to the
// mock rather than throw. round-resolve claims a round into status 'resolving'
// BEFORE calling the judge and nothing sweeps that state, so a throw here
// strands the round permanently instead of merely erroring.

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  FallbackJudgeProvider,
  JudgeProviderError,
  MockJudgeProvider,
  XAIJudgeProvider,
  createJudgeProvider,
  type AiJudgeProvider,
  type JudgeRequest,
  type JudgeResponse,
} from '../_shared/providers.ts';
import { validateJudgeResponse } from '../_shared/judge.ts';

const REQ: JudgeRequest = {
  promptOne: 'A lattice of mirrors folds the arena into a single blinding point.',
  promptTwo: 'I raise a wall of patient stone and wait for the storm to tire.',
  moveTypeOne: 'attack',
  moveTypeTwo: 'defense',
  theme: 'the last light',
  seed: 4242,
  promptVersion: 'v1.0.0-mvp',
};

/** Judge that always fails, standing in for a provider outage. */
class ExplodingJudge implements AiJudgeProvider {
  calls = 0;
  getModelId() {
    return 'exploding-judge';
  }
  judge(_req: JudgeRequest): Promise<JudgeResponse> {
    this.calls++;
    return Promise.reject(new JudgeProviderError('timeout', 'simulated outage'));
  }
}

/** Judge that succeeds, to prove the fallback is not always taken. */
class StubJudge implements AiJudgeProvider {
  calls = 0;
  getModelId() {
    return 'stub-judge-v1';
  }
  judge(req: JudgeRequest): Promise<JudgeResponse> {
    this.calls++;
    const scores = {
      clarity: 7,
      originality: 7,
      specificity: 7,
      theme_fit: 7,
      archetype_fit: 7,
      dramatic_potential: 7,
    };
    return Promise.resolve({
      playerOneScores: scores,
      playerTwoScores: scores,
      explanation: 'Stub judge explanation that is comfortably long enough.',
      modelId: this.getModelId(),
      promptVersion: req.promptVersion,
    });
  }
}

Deno.test('FallbackJudgeProvider - provider failure degrades to mock', async () => {
  const primary = new ExplodingJudge();
  const provider = new FallbackJudgeProvider(primary, new MockJudgeProvider());

  const res = await provider.judge(REQ);

  assertEquals(primary.calls, 1);
  // Auditable: the response carries the mock's model id, so judge_runs rows
  // scored by the fallback can be found and excluded from calibration.
  assertEquals(res.modelId, 'mock-judge-v1.0.0');
  assertEquals(res.promptVersion, REQ.promptVersion);
});

Deno.test('FallbackJudgeProvider - fallback output still passes schema validation', async () => {
  const provider = new FallbackJudgeProvider(
    new ExplodingJudge(),
    new MockJudgeProvider(),
  );

  // The pipeline validates every run; a fallback that produced an invalid
  // shape would throw downstream and strand the round anyway.
  const validated = validateJudgeResponse(await provider.judge(REQ));
  assertExists(validated.playerOneScores);
  assertExists(validated.playerTwoScores);
});

Deno.test('FallbackJudgeProvider - healthy provider is used, mock is not', async () => {
  const primary = new StubJudge();
  const provider = new FallbackJudgeProvider(primary, new MockJudgeProvider());

  const res = await provider.judge(REQ);

  assertEquals(primary.calls, 1);
  assertEquals(res.modelId, 'stub-judge-v1');
});

Deno.test('createJudgeProvider - JUDGE_PROVIDER=xai is wrapped in a fallback', () => {
  const previous = Deno.env.get('JUDGE_PROVIDER');
  Deno.env.set('JUDGE_PROVIDER', 'xai');
  try {
    const provider = createJudgeProvider();
    // Unwrapped XAIJudgeProvider would let an outage strand rounds.
    assertEquals(provider instanceof FallbackJudgeProvider, true);
  } finally {
    if (previous === undefined) Deno.env.delete('JUDGE_PROVIDER');
    else Deno.env.set('JUDGE_PROVIDER', previous);
  }
});

Deno.test('createJudgeProvider - defaults to mock, unknown value falls back', () => {
  const previous = Deno.env.get('JUDGE_PROVIDER');
  try {
    Deno.env.delete('JUDGE_PROVIDER');
    assertEquals(createJudgeProvider() instanceof MockJudgeProvider, true);

    Deno.env.set('JUDGE_PROVIDER', 'not-a-real-provider');
    assertEquals(createJudgeProvider() instanceof MockJudgeProvider, true);
  } finally {
    if (previous === undefined) Deno.env.delete('JUDGE_PROVIDER');
    else Deno.env.set('JUDGE_PROVIDER', previous);
  }
});

Deno.test('XAIJudgeProvider - missing API key fails fast with a typed error', async () => {
  const keys = ['JUDGE_API_KEY', 'XAI_API_KEY'] as const;
  const saved = keys.map((k) => [k, Deno.env.get(k)] as const);
  try {
    for (const k of keys) Deno.env.delete(k);
    const provider = new XAIJudgeProvider();

    let caught: unknown;
    try {
      await provider.judge(REQ);
    } catch (err) {
      caught = err;
    }

    assertEquals(caught instanceof JudgeProviderError, true);
    assertEquals((caught as JudgeProviderError).code, 'no_api_key');
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});

Deno.test('XAIJudgeProvider - model id is env-driven', () => {
  const previous = Deno.env.get('JUDGE_MODEL_ID');
  try {
    Deno.env.set('JUDGE_MODEL_ID', 'grok-test-model');
    assertEquals(new XAIJudgeProvider().getModelId(), 'grok-test-model');
  } finally {
    if (previous === undefined) Deno.env.delete('JUDGE_MODEL_ID');
    else Deno.env.set('JUDGE_MODEL_ID', previous);
  }
});
