// Bo3 math tests
//
// Pins the two properties the retune fixed:
//   1. Move-type is a tie-breaker, not the decider. It was +12%/-8% on a 0-60
//      aggregate, opening ~8-point gaps between equal prompts against a 3.0
//      draw epsilon -- so the rock-paper-scissors pick decided close rounds.
//   2. Damage varies with the score gap and a knockout is reachable. It was
//      `gap * (8 + str/2)` clamped to 40, and since every non-draw gap is >= 3
//      it pinned to the clamp; with 100 HP and at most two losses, KO was
//      mathematically impossible and the HP tiebreaker could never discriminate.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  MOVE_TYPE_POINTS_LOSE,
  MOVE_TYPE_POINTS_WIN,
  applyMoveTypeModifier,
  moveTypePoints,
} from '../_shared/judge.ts';
import type { MoveType } from '../_shared/types.ts';

const DRAW_EPSILON = 3.0;
const KO_SCORE_GAP_THRESHOLD = 7;

/** Mirrors computeDamage in round-resolve/index.ts. */
function computeDamage(scoreGap: number, winnerStrength: number): number {
  const raw = 12 + Math.abs(scoreGap) * 2.2 + (winnerStrength - 5) * 1.5;
  return Math.max(8, Math.min(60, Math.round(raw)));
}

/** Mirrors hpMaxFromStamina in _shared/start-face-off.ts. */
const hpMax = (stamina: number) => 60 + stamina * 8;

// ---------------------------------------------------------------------------
// Move-type matchup
// ---------------------------------------------------------------------------

Deno.test('moveTypePoints - rock-paper-scissors wiring', () => {
  const cases: [MoveType, MoveType, number][] = [
    ['attack', 'finisher', MOVE_TYPE_POINTS_WIN],
    ['defense', 'attack', MOVE_TYPE_POINTS_WIN],
    ['finisher', 'defense', MOVE_TYPE_POINTS_WIN],
    ['finisher', 'attack', MOVE_TYPE_POINTS_LOSE],
    ['attack', 'defense', MOVE_TYPE_POINTS_LOSE],
    ['defense', 'finisher', MOVE_TYPE_POINTS_LOSE],
    ['attack', 'attack', 0],
    ['defense', 'defense', 0],
    ['finisher', 'finisher', 0],
  ];
  for (const [mine, theirs, expected] of cases) {
    assertEquals(
      moveTypePoints(mine, theirs),
      expected,
      `${mine} vs ${theirs}`,
    );
  }
});

Deno.test('move-type alone cannot win a round against an equal prompt', () => {
  const base = 40;
  const mine = applyMoveTypeModifier(base, 'attack', 'finisher'); // favourable
  const theirs = applyMoveTypeModifier(base, 'finisher', 'attack'); // unfavourable
  const gap = Math.abs(mine - theirs);

  // 0.9 - (-0.6) = 1.5 total swing
  assertEquals(Number(gap.toFixed(4)), 1.5);
  // Inside the draw band: a counter-pick against equal writing is a DRAW.
  assertEquals(gap < DRAW_EPSILON, true);
});

Deno.test('a clear quality lead survives an unfavourable counter-pick', () => {
  // Better writer is 5 aggregate points ahead but picks into a bad matchup.
  const mine = applyMoveTypeModifier(45, 'attack', 'defense'); // -0.6
  const theirs = applyMoveTypeModifier(40, 'defense', 'attack'); // +0.9
  const gap = mine - theirs;

  assertEquals(Number(gap.toFixed(4)), 3.5);
  assertEquals(gap > DRAW_EPSILON, true, 'better prompt must still win');
});

Deno.test('a narrow quality lead can be pulled back to a draw', () => {
  const mine = applyMoveTypeModifier(42, 'attack', 'defense');
  const theirs = applyMoveTypeModifier(40, 'defense', 'attack');
  const gap = Math.abs(mine - theirs);

  assertEquals(Number(gap.toFixed(4)), 0.5);
  assertEquals(gap < DRAW_EPSILON, true);
});

Deno.test('applyMoveTypeModifier floors at zero', () => {
  assertEquals(applyMoveTypeModifier(0.2, 'attack', 'defense'), 0);
});

// ---------------------------------------------------------------------------
// Damage / HP / KO
// ---------------------------------------------------------------------------

Deno.test(
  'damage varies with the score gap instead of pinning to a clamp',
  () => {
    const table: [number, number][] = [
      [3, 19],
      [5, 23],
      [10, 34],
      [15, 45],
      [20, 56],
    ];
    for (const [gap, expected] of table) {
      assertEquals(computeDamage(gap, 5), expected, `gap ${gap}`);
    }

    // The old formula produced 40 for every one of these.
    const distinct = new Set(table.map(([gap]) => computeDamage(gap, 5)));
    assertEquals(
      distinct.size,
      table.length,
      'each gap must give distinct damage',
    );
  },
);

Deno.test('strength shifts damage but does not dominate it', () => {
  const weak = computeDamage(10, 1);
  const mid = computeDamage(10, 5);
  const strong = computeDamage(10, 10);

  assertEquals(weak < mid && mid < strong, true);
  // Full 1..10 strength swing is worth ~13.5 points, less than the gap term.
  assertEquals(strong - weak, 14);
});

Deno.test('damage is clamped at both ends', () => {
  assertEquals(computeDamage(0, 1), 8, 'floor');
  assertEquals(computeDamage(500, 10), 60, 'ceiling');
});

Deno.test('KO is reachable on a blowout but not on an even series', () => {
  const defaultHp = hpMax(5); // 100
  assertEquals(defaultHp, 100);

  // A match ends at two round wins, so the loser absorbs at most two hits.
  const twoBlowouts = computeDamage(20, 5) * 2; // 112
  const twoClearLosses = computeDamage(10, 5) * 2; // 68
  const twoNarrowLosses = computeDamage(3, 5) * 2; // 38

  assertEquals(twoBlowouts > defaultHp, true, 'blowout must be able to KO');
  assertEquals(twoClearLosses < defaultHp, true, 'clear-but-close must not KO');
  assertEquals(twoNarrowLosses < defaultHp, true, 'narrow series must not KO');
});

Deno.test('stamina buys real KO resistance', () => {
  const twoBlowouts = computeDamage(20, 5) * 2; // 112
  assertEquals(hpMax(1), 68);
  assertEquals(hpMax(10), 140);

  assertEquals(twoBlowouts > hpMax(1), true, 'stamina 1 is fragile');
  assertEquals(twoBlowouts > hpMax(5), true, 'stamina 5 falls to a blowout');
  assertEquals(twoBlowouts < hpMax(10), true, 'stamina 10 survives it');
});

Deno.test('HP tiebreaker can discriminate after a 1-1 series', () => {
  // Each player lost one round, by different margins. Under the old constant-40
  // damage both sat on exactly 60 HP and "lower HP loses" was inert.
  const hpAfterNarrowLoss = hpMax(5) - computeDamage(4, 5);
  const hpAfterHeavyLoss = hpMax(5) - computeDamage(16, 5);

  assertEquals(hpAfterNarrowLoss !== hpAfterHeavyLoss, true);
  assertEquals(hpAfterHeavyLoss < hpAfterNarrowLoss, true);
});

Deno.test('forfeit walkover damage stays below an instant KO', () => {
  // round-resolve sets scoreGap = KO_SCORE_GAP_THRESHOLD on a walkover.
  const forfeitDamage = computeDamage(KO_SCORE_GAP_THRESHOLD, 5);
  assertEquals(forfeitDamage, 27);
  assertEquals(
    forfeitDamage < hpMax(1),
    true,
    'one forfeit must not KO outright',
  );
});
