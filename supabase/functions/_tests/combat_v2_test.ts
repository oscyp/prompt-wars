import {
  matchmakingRulesVersion,
  requiresCombatClientUpdate,
} from '../_shared/combat-rollout.ts';
import {
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  statModifier,
  combatDamage,
  resolveCombatRound,
  resolveCombatSeries,
  roundDeadline,
} from '../_shared/combat.ts';
import { runJudgePipeline } from '../_shared/judge.ts';
import type { JudgeRubricScores } from '../_shared/types.ts';
const stats = { strength: 5, stamina: 5, agility: 5, focus: 5 };
const rubric = (n: number): JudgeRubricScores => ({
  clarity: n,
  originality: n,
  specificity: n,
  theme_fit: n,
  archetype_fit: n,
  dramatic_potential: n,
});
Deno.test('v2 stat increments, symmetric cap and legacy formula', () => {
  assertAlmostEquals(statModifier({ ...stats, strength: 6 }, stats, 2), 0.005);
  assertAlmostEquals(statModifier({ ...stats, focus: 6 }, stats, 2), 0.0025);
  assertEquals(
    statModifier(
      { ...stats, strength: 10, focus: 10 },
      { ...stats, strength: 1, focus: 1 },
      2,
    ),
    0.05,
  );
  assertEquals(
    statModifier(
      { ...stats, strength: 1, focus: 1 },
      { ...stats, strength: 10, focus: 10 },
      2,
    ),
    -0.05,
  );
  assertEquals(statModifier({ ...stats, strength: 6 }, stats, 1), 0.05);
});
Deno.test(
  'v2 agility reduces incoming damage before one rounding and respects bounds',
  () => {
    assertEquals(combatDamage(10, stats, { ...stats, agility: 10 }, 2), 31);
    assertEquals(combatDamage(10, stats, { ...stats, agility: 10 }, 1), 34);
    assertEquals(combatDamage(200, stats, { ...stats, agility: 10 }, 2), 60);
    assertEquals(
      combatDamage(
        0,
        { ...stats, strength: 1, agility: 1 },
        { ...stats, agility: 10 },
        2,
      ),
      8,
    );
  },
);
Deno.test('round preserves draw threshold, damage and KO', () => {
  const input = {
    rulesVersion: 2,
    playerOne: stats,
    playerTwo: stats,
    playerOneBase: 48,
    playerTwoBase: 30,
    playerOneMove: 'attack' as const,
    playerTwoMove: 'attack' as const,
    playerOneHp: 100,
    playerTwoHp: 40,
  };
  const result = resolveCombatRound(input);
  assertEquals(result.winner, 1);
  assertEquals(result.isKo, true);
  assertEquals(result.playerTwoHpAfter, 0);
  const draw = resolveCombatRound({ ...input, playerTwoBase: 46 });
  assertEquals(draw.isDraw, true);
  assertEquals(draw.playerTwoDamage, 0);
});
Deno.test(
  'series plays third round after a win and draw; exhausts by wins then HP percentage then scores',
  () => {
    const input = {
      rulesVersion: 2,
      roundsPlayed: 2,
      bestOf: 3,
      playerOneWins: 1,
      playerTwoWins: 0,
      playerOneHp: 70,
      playerTwoHp: 90,
      playerOneHpMax: 100,
      playerTwoHpMax: 140,
      playerOneTotal: 80,
      playerTwoTotal: 90,
      koWinner: null as 1 | 2 | null,
    };
    assertEquals(resolveCombatSeries(input).complete, false);
    assertEquals(resolveCombatSeries({ ...input, roundsPlayed: 3 }).winner, 1);
    const hp = resolveCombatSeries({
      ...input,
      roundsPlayed: 3,
      playerOneWins: 1,
      playerTwoWins: 1,
    });
    assertEquals(hp.winner, 1);
    assertEquals(hp.decidingRule, 'remaining_hp_percentage');
    assertEquals(
      resolveCombatSeries({
        ...input,
        rulesVersion: 1,
        roundsPlayed: 3,
        playerOneWins: 1,
        playerTwoWins: 1,
      }).winner,
      2,
    );
    assertEquals(
      resolveCombatSeries({
        ...input,
        roundsPlayed: 3,
        playerOneWins: 1,
        playerTwoWins: 1,
        playerTwoHp: 98,
        playerOneTotal: 90,
      }).winner,
      null,
    );
  },
);
Deno.test(
  'all new human round clocks 24h; bot 2h; legacy first/later preserved',
  () => {
    const now = Date.parse('2026-09-13T00:00:00Z');
    for (const mode of ['ranked', 'unranked', 'friend_challenge'])
      for (const round of [1, 2, 3])
        assertEquals(
          roundDeadline(now, mode, false, 2, round),
          '2026-09-14T00:00:00.000Z',
        );
    assertEquals(
      roundDeadline(now, 'bot', true, 2, 1),
      '2026-09-13T02:00:00.000Z',
    );
    assertEquals(
      roundDeadline(now, 'ranked', false, 1, 1),
      '2026-09-13T00:45:00.000Z',
    );
    assertEquals(
      roundDeadline(now, 'ranked', false, 1, 2),
      '2026-09-13T02:00:00.000Z',
    );
  },
);
Deno.test(
  'agreeing judges average each normalized rubric and record real per-call provenance',
  async () => {
    let n = 0;
    const seeds: number[] = [];
    const provider = {
      getModelId: () => 'wrapper',
      judge: (req: { seed?: number }) => {
        seeds.push(req.seed!);
        n++;
        return Promise.resolve({
          playerOneScores: rubric(n === 1 ? 8 : 6),
          playerTwoScores: rubric(4),
          explanation: 'The stronger prompt wins clearly.',
          modelId: n === 1 ? 'real-model' : 'mock-judge-v1.0.0',
          promptVersion: 'frozen',
        });
      },
    };
    const r = await runJudgePipeline(
      provider,
      'one',
      'two',
      'attack',
      'attack',
      200,
      20,
      null,
    );
    assertAlmostEquals(r.player_one_normalized_scores.clarity, 5.95);
    assertEquals(r.player_one_raw_scores.clarity, 7);
    assertEquals(
      r.calls.map((c) => c.model_id),
      ['real-model', 'mock-judge-v1.0.0'],
    );
    assertEquals(
      r.calls.map((c) => c.seed),
      seeds,
    );
    assertEquals(r.mock_assisted, true);
    assertEquals(r.aggregation, 'mean_agreeing');
  },
);

Deno.test(
  'disagreement retains third-run policy while all three calls remain auditable',
  async () => {
    let n = 0;
    const provider = {
      getModelId: () => 'wrapper',
      judge: () => {
        n++;
        return Promise.resolve({
          playerOneScores: rubric(n === 1 ? 8 : n === 2 ? 2 : 9),
          playerTwoScores: rubric(5),
          explanation: 'A clear independently sampled comparison.',
          modelId: n === 1 ? 'mock-judge-v1.0.0' : 'real-model',
          responseId: `call-${n}`,
          promptVersion: 'frozen',
        });
      },
    };
    const r = await runJudgePipeline(
      provider,
      'one',
      'two',
      'attack',
      'attack',
      20,
      20,
      null,
    );
    assertEquals(r.aggregation, 'third_run');
    assertEquals(r.player_one_normalized_scores.clarity, 9);
    assertEquals(r.calls.length, 3);
    assertEquals(r.calls[2].response_id, 'call-3');
    assertEquals(r.mock_assisted, true);
  },
);
Deno.test(
  'combat v2 every legal stat pair stays within modifier/damage bounds',
  () => {
    for (let strength = 1; strength <= 10; strength++)
      for (let focus = 1; focus <= 10; focus++)
        for (let agility = 1; agility <= 10; agility++) {
          const self = { strength, focus, agility, stamina: 5 };
          const other = {
            strength: 11 - strength,
            focus: 11 - focus,
            agility: 11 - agility,
            stamina: 5,
          };
          assertEquals(Math.abs(statModifier(self, other, 2)) <= 0.05, true);
          assertAlmostEquals(
            statModifier(self, other, 2),
            -statModifier(other, self, 2),
          );
          const damage = combatDamage(15, self, other, 2);
          assertEquals(damage >= 8 && damage <= 60, true);
        }
  },
);

Deno.test(
  'rollout off is legacy; versioned queue resumes survive rollback; old clients cannot enter v2',
  () => {
    assertEquals(matchmakingRulesVersion(false), 1);
    assertEquals(matchmakingRulesVersion(true), 2);
    assertEquals(matchmakingRulesVersion(false, 2), 2);
    assertEquals(matchmakingRulesVersion(true, 1), 1);
    for (const v of [undefined, null, 1, '2', 2.5])
      assertEquals(requiresCombatClientUpdate(2, v), true);
    assertEquals(requiresCombatClientUpdate(2, 2), false);
    assertEquals(requiresCombatClientUpdate(1, undefined), false);
  },
);
