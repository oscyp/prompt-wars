import { ARCHETYPES } from '@/constants/Archetypes';
import {
  ARCHETYPE_STAT_PRESETS,
  BALANCED_STATS,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  STAT_POINT_TOTAL,
  adjustStat,
  allocationHint,
  canDecrement,
  canIncrement,
  describeAllocation,
  isValidAllocation,
  pointsRemaining,
  presetFor,
  remainingLabel,
  sameAllocation,
  statTotal,
} from '@/utils/statAllocation';

describe('statAllocation', () => {
  it('starts every fighter from the historical default', () => {
    expect(statTotal(BALANCED_STATS)).toBe(STAT_POINT_TOTAL);
    expect(pointsRemaining(BALANCED_STATS)).toBe(0);
    expect(isValidAllocation(BALANCED_STATS)).toBe(true);
  });

  it('every archetype preset spends exactly the shared pool', () => {
    for (const id of Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[]) {
      const preset = ARCHETYPE_STAT_PRESETS[id];
      expect(statTotal(preset)).toBe(STAT_POINT_TOTAL);
      expect(isValidAllocation(preset)).toBe(true);
      for (const key of STAT_KEYS) {
        expect(preset[key]).toBeGreaterThanOrEqual(STAT_MIN);
        expect(preset[key]).toBeLessThanOrEqual(STAT_MAX);
      }
    }
    expect(presetFor('titan')).not.toBe(ARCHETYPE_STAT_PRESETS.titan);
    expect(
      sameAllocation(presetFor('titan'), ARCHETYPE_STAT_PRESETS.titan),
    ).toBe(true);
  });

  it('will not spend past the pool or above the cap', () => {
    expect(canIncrement(BALANCED_STATS, 'strength')).toBe(false);
    expect(adjustStat(BALANCED_STATS, 'strength', 1)).toBe(BALANCED_STATS);

    const freed = adjustStat(BALANCED_STATS, 'focus', -1);
    expect(pointsRemaining(freed)).toBe(1);
    expect(canIncrement(freed, 'strength')).toBe(true);
    expect(adjustStat(freed, 'strength', 1)).toEqual({
      ...BALANCED_STATS,
      focus: 4,
      strength: 6,
    });

    const maxed = { strength: 10, stamina: 1, agility: 1, focus: 1 };
    expect(pointsRemaining(maxed)).toBe(7);
    expect(canIncrement(maxed, 'strength')).toBe(false);
  });

  it('will not take a stat below the floor', () => {
    const floor = { strength: 1, stamina: 9, agility: 5, focus: 5 };
    expect(canDecrement(floor, 'strength')).toBe(false);
    expect(adjustStat(floor, 'strength', -1)).toBe(floor);
    expect(canDecrement(floor, 'stamina')).toBe(true);
  });

  it('rejects non-integers, out-of-range values and unspent points', () => {
    expect(
      isValidAllocation({ strength: 5.5, stamina: 4.5, agility: 5, focus: 5 }),
    ).toBe(false);
    expect(
      isValidAllocation({ strength: 11, stamina: 3, agility: 3, focus: 3 }),
    ).toBe(false);
    expect(
      isValidAllocation({ strength: 0, stamina: 10, agility: 5, focus: 5 }),
    ).toBe(false);
    expect(
      isValidAllocation({ strength: 5, stamina: 5, agility: 5, focus: 4 }),
    ).toBe(false);
  });

  it('explains why Next is disabled', () => {
    expect(allocationHint(BALANCED_STATS)).toBeUndefined();
    expect(allocationHint({ ...BALANCED_STATS, focus: 4 })).toBe(
      'Spend 1 more point to continue',
    );
    expect(allocationHint({ ...BALANCED_STATS, focus: 3 })).toBe(
      'Spend 2 more points to continue',
    );
    expect(allocationHint({ ...BALANCED_STATS, focus: 6 })).toBe(
      'Remove 1 point to continue',
    );
  });

  it('labels the remaining pool for the header', () => {
    expect(remainingLabel(BALANCED_STATS)).toBe('All points placed');
    expect(remainingLabel({ ...BALANCED_STATS, focus: 4 })).toBe(
      '1 point left',
    );
    expect(remainingLabel({ ...BALANCED_STATS, focus: 2 })).toBe(
      '3 points left',
    );
    expect(remainingLabel({ ...BALANCED_STATS, focus: 7 })).toBe('2 over');
  });

  it('recaps an allocation in the abbreviations the face-off uses', () => {
    expect(describeAllocation(ARCHETYPE_STAT_PRESETS.titan)).toBe(
      'STR 8 · STA 6 · AGI 3 · FOC 3',
    );
  });
});
