import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runJudgePipeline } from '../_shared/judge.ts';
import {
  MockJudgeProvider,
  XAIJudgeProvider,
  type JudgeRequest,
} from '../_shared/providers.ts';
import { judgeAppealRound } from '../_shared/appeals-service.ts';

const version = 'v2.0.0-ideas';
const situation = {
  id: 'fixture',
  catalogVersion: 1 as const,
  environmentId: 'flooded-theater',
  text: 'Water rises beneath the stage while the lights flicker. A loose rope hangs from the balcony and a narrow dry ledge remains beside the curtains.',
};
const scores = (n: number) => ({
  clarity: n,
  originality: n,
  specificity: n,
  theme_fit: n,
  archetype_fit: n,
  dramatic_potential: n,
});
const request = {
  promptOne: 'I pull the rope to reach the ledge.',
  promptTwo: 'I pull the rope to reach the ledge.',
  moveTypeOne: 'attack' as const,
  moveTypeTwo: 'attack' as const,
  theme: 'flooded theater',
  seed: 1,
  promptVersion: version,
  situationSnapshot: situation,
};

Deno.test(
  'ideas pipeline removes the word-only penalty while legacy keeps it',
  async () => {
    const provider = {
      getModelId: () => 'fixture',
      judge: (r: JudgeRequest) =>
        Promise.resolve({
          playerOneScores: scores(8),
          playerTwoScores: scores(8),
          explanation: 'Both express the same comprehensible plan.',
          modelId: 'fixture',
          promptVersion: r.promptVersion,
        }),
    };
    const args = [
      provider,
      'short',
      'verbose',
      'attack',
      'attack',
      8,
      200,
      'theme',
    ] as const;
    const run = runJudgePipeline;
    const ideas = await run(...args, version, situation);
    assertEquals(ideas.player_two_normalized_scores.clarity, 8);
    assertEquals(ideas.is_draw, true);
    const legacy = await run(...args, 'v1.0.0-mvp');
    assertEquals(legacy.player_two_normalized_scores.clarity, 6.8);
  },
);

Deno.test(
  'all ideas runs including disagreement tiebreak receive the same frozen situation',
  async () => {
    const received: JudgeRequest[] = [];
    const provider = {
      getModelId: () => 'fixture',
      judge: (r: JudgeRequest) => {
        received.push(r);
        return Promise.resolve({
          playerOneScores: scores(received.length === 2 ? 2 : 8),
          playerTwoScores: scores(5),
          explanation: 'The concrete consequence decides this comparison.',
          modelId: 'fixture',
          promptVersion: r.promptVersion,
        });
      },
    };
    const run = runJudgePipeline;
    const result = await run(
      provider,
      'one',
      'two',
      'attack',
      'attack',
      1,
      1,
      'theme',
      version,
      situation,
    );
    assertEquals(result.calls.length, 3);
    assertEquals(
      received.map((r) => r.situationSnapshot),
      [situation, situation, situation],
    );
    await assertRejects(
      () =>
        run(provider, 'one', 'two', 'attack', 'attack', 1, 1, 'theme', version),
      Error,
      'situation',
    );
  },
);

Deno.test(
  'ideas mock has no writing-length bonus and remains explicitly mock provenance',
  async () => {
    const response = await new MockJudgeProvider().judge({
      ...request,
      promptTwo: 'word '.repeat(80),
    });
    assertEquals(response.playerOneScores, response.playerTwoScores);
    assertStringIncludes(response.modelId, 'mock');
  },
);

Deno.test(
  'real adapter dispatches policy and serializes only frozen scoring inputs',
  async () => {
    const key = Deno.env.get('JUDGE_API_KEY');
    const previousFetch = globalThis.fetch;
    const bodies: Record<string, unknown>[] = [];
    Deno.env.set('JUDGE_API_KEY', 'fixture-only');
    globalThis.fetch = (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'fixture',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    playerOneScores: scores(7),
                    playerTwoScores: scores(7),
                    explanation:
                      'Both plans produce the same concrete consequence.',
                  }),
                },
              },
            ],
          }),
        ),
      );
    };
    try {
      const provider = new XAIJudgeProvider('fixture');
      await provider.judge(
        Object.assign({}, request, {
          authoringSource: 'paid_ai',
          credits: 100,
        }),
      );
      await provider.judge({ ...request, promptVersion: 'v1.0.0-mvp' });
      const modern = bodies[0].messages as { content: string }[];
      const legacy = bodies[1].messages as { content: string }[];
      assertStringIncludes(modern[0].content, 'useful originality');
      assertStringIncludes(
        legacy[0].content,
        'Identical scores should be rare',
      );
      assertStringIncludes(modern[1].content, situation.text);
      assertEquals(JSON.stringify(bodies[0]).includes('paid_ai'), false);
      assertEquals(JSON.stringify(bodies[0]).includes('credits'), false);
      await assertRejects(
        () => provider.judge({ ...request, promptVersion: 'unknown-policy' }),
        Error,
        'Unsupported judge policy',
      );
    } finally {
      globalThis.fetch = previousFetch;
      if (key === undefined) Deno.env.delete('JUDGE_API_KEY');
      else Deno.env.set('JUDGE_API_KEY', key);
    }
  },
);

Deno.test(
  'appeal reuses ideas policy and situation instead of silently applying legacy',
  async () => {
    const requests: JudgeRequest[] = [];
    const provider = {
      getModelId: () => 'review',
      judge: (r: JudgeRequest) => {
        requests.push(r);
        return Promise.resolve({
          playerOneScores: scores(8),
          playerTwoScores: scores(8),
          explanation: 'Both plans have the same clear consequence.',
          modelId: 'review',
          promptVersion: r.promptVersion,
        });
      },
    };
    const p = {
      text: 'Reach the ledge.',
      wordCount: 150,
      moveType: 'defense' as const,
    };
    const review = judgeAppealRound;
    const result = await review(
      provider,
      p,
      p,
      'theme',
      'review',
      ['primary'],
      version,
      situation,
    );
    assertEquals(result.player_one_normalized_scores.clarity, 8);
    assertEquals(
      requests.map((r) => r.promptVersion),
      [version, version],
    );
    assertEquals(requests[0].situationSnapshot, situation);
  },
);
