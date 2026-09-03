/**
 * The arena tips, pinned without mounting a screen: every line is short,
 * one sentence, and the rotation is deterministic so a re-render can never
 * swap the text out from under the reader.
 */
import { ARENA_TIPS, TIP_INTERVAL_MS, tipForTick } from '@/utils/arenaTips';

describe('ARENA_TIPS', () => {
  it('has between 10 and 12 tips', () => {
    expect(ARENA_TIPS.length).toBeGreaterThanOrEqual(10);
    expect(ARENA_TIPS.length).toBeLessThanOrEqual(12);
  });

  it.each(ARENA_TIPS.map((tip, i) => [i, tip]))(
    'tip %i is one calm sentence of at most 110 characters',
    (_i, tip) => {
      expect(tip.trim().length).toBeGreaterThan(0);
      expect(tip.length).toBeLessThanOrEqual(110);
      expect(tip).not.toContain('!');
      expect(tip.endsWith('.')).toBe(true);
      // One sentence: no full stop followed by another sentence.
      expect(tip.slice(0, -1)).not.toMatch(/\.\s+[A-Z]/);
    },
  );

  it('has no duplicates', () => {
    expect(new Set(ARENA_TIPS).size).toBe(ARENA_TIPS.length);
  });
});

describe('tipForTick', () => {
  it('is stable for a given tick and seed', () => {
    for (let tick = 0; tick < 30; tick++) {
      expect(tipForTick(tick, 5)).toBe(tipForTick(tick, 5));
    }
  });

  it('walks the list in order from the seed and wraps around', () => {
    const n = ARENA_TIPS.length;
    expect(tipForTick(0)).toBe(ARENA_TIPS[0]);
    expect(tipForTick(1)).toBe(ARENA_TIPS[1]);
    expect(tipForTick(n)).toBe(ARENA_TIPS[0]);
    expect(tipForTick(1, 2)).toBe(ARENA_TIPS[3]);
    expect(tipForTick(n - 1, 1)).toBe(ARENA_TIPS[0]);
  });

  it('visits every tip exactly once per cycle, for any seed', () => {
    const n = ARENA_TIPS.length;
    for (const seed of [0, 1, 7, n, n + 3]) {
      const seen = new Set<string>();
      for (let tick = 0; tick < n; tick++) seen.add(tipForTick(tick, seed));
      expect(seen.size).toBe(n);
    }
  });

  it('tolerates negative, fractional and non-finite input', () => {
    const n = ARENA_TIPS.length;
    expect(tipForTick(-1)).toBe(ARENA_TIPS[n - 1]);
    expect(tipForTick(1.7)).toBe(ARENA_TIPS[1]);
    expect(tipForTick(Number.NaN)).toBe(ARENA_TIPS[0]);
    expect(tipForTick(0, Number.POSITIVE_INFINITY)).toBe(ARENA_TIPS[0]);
  });
});

describe('TIP_INTERVAL_MS', () => {
  it('rotates every four seconds', () => {
    expect(TIP_INTERVAL_MS).toBe(4000);
  });
});
