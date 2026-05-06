// Tests for Glicko-2 rating system
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  updateGlicko2,
  computeRatingDeltas,
  toGlickoScale,
  toGlicko2Scale,
} from '../_shared/glicko2.ts';

Deno.test('Glicko-2: Scale conversions', () => {
  const glickoRating = 1500;
  const glicko2Rating = toGlicko2Scale(glickoRating);
  const backToGlicko = toGlickoScale(glicko2Rating);
  
  assertAlmostEquals(backToGlicko, glickoRating, 0.01);
});

Deno.test('Glicko-2: Win increases rating', () => {
  const result = updateGlicko2(
    1500, // player rating
    350,  // player RD
    0.06, // player volatility
    1500, // opponent rating
    350,  // opponent RD
    1.0   // player won
  );
  
  assertEquals(result.delta > 0, true, 'Rating should increase after win');
  assertEquals(result.rd < 350, true, 'RD should decrease after playing');
});

Deno.test('Glicko-2: Loss decreases rating', () => {
  const result = updateGlicko2(
    1500,
    350,
    0.06,
    1500,
    350,
    0.0 // player lost
  );
  
  assertEquals(result.delta < 0, true, 'Rating should decrease after loss');
});

Deno.test('Glicko-2: Draw has small impact', () => {
  const result = updateGlicko2(
    1500,
    350,
    0.06,
    1500,
    350,
    0.5 // draw
  );
  
  assertAlmostEquals(result.delta, 0, 1, 'Draw against equal opponent should have minimal delta');
});

Deno.test('Glicko-2: Compute rating deltas for both players', () => {
  const deltas = computeRatingDeltas(
    1500, 350, 0.06, // player one
    1600, 300, 0.06, // player two (higher rated)
    true,             // player one won (upset)
    false             // not a draw
  );
  
  assertEquals(deltas.playerOne.delta > 0, true, 'Winner should gain rating');
  assertEquals(deltas.playerTwo.delta < 0, true, 'Loser should lose rating');
  assertEquals(
    Math.abs(deltas.playerOne.delta) > Math.abs(deltas.playerTwo.delta),
    true,
    'Upset win should grant more points to winner'
  );
});
