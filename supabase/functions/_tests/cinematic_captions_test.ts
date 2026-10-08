import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCinematicCaptions } from '../_shared/cinematic-captions.ts';
import { buildCinematicInput } from '../_shared/cinematic-inputs.ts';
import { cinematicSource } from './fixtures/cinematic.ts';

Deno.test(
  'captions honor the frozen round winner and duration instead of series outcome',
  () => {
    const input = buildCinematicInput(cinematicSource());
    assertEquals(buildCinematicCaptions(input), [
      { start_ms: 0, end_ms: 3000, text: 'Ash vs Vex' },
      { start_ms: 10000, end_ms: 15000, text: 'Vex wins' },
    ]);
    input.policy.target_duration_seconds = 8;
    input.outcome = { winner: null, isDraw: true, isKo: false, forfeit: null };
    assertEquals(buildCinematicCaptions(input).at(-1), {
      start_ms: 5333,
      end_ms: 8000,
      text: 'Draw',
    });
    input.outcome = { winner: 'p2', isDraw: false, isKo: false, forfeit: 'p1' };
    assertEquals(
      buildCinematicCaptions(input).at(-1)?.text,
      'Vex wins by forfeit',
    );
  },
);
