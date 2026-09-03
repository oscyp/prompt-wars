import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  STAT_POINT_TOTAL,
  statColumns,
  validateStatAllocation,
} from '../_shared/character-stats.ts';

Deno.test(
  'validateStatAllocation accepts a full pool of integers in range',
  () => {
    const result = validateStatAllocation({
      strength: 8,
      stamina: 6,
      agility: 3,
      focus: 3,
      extra: 'ignored',
    });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.stats, {
        strength: 8,
        stamina: 6,
        agility: 3,
        focus: 3,
      });
      assertEquals(statColumns(result.stats), {
        stat_strength: 8,
        stat_stamina: 6,
        stat_agility: 3,
        stat_focus: 3,
      });
    }
  },
);

Deno.test(
  'validateStatAllocation rejects the pool being under- or over-spent',
  () => {
    const under = validateStatAllocation({
      strength: 5,
      stamina: 5,
      agility: 5,
      focus: 4,
    });
    assertEquals(under.ok, false);
    if (!under.ok) {
      assertEquals(under.message.includes(`${STAT_POINT_TOTAL}`), true);
    }
    const over = validateStatAllocation({
      strength: 10,
      stamina: 10,
      agility: 5,
      focus: 5,
    });
    assertEquals(over.ok, false);
  },
);

Deno.test(
  'validateStatAllocation rejects out-of-range, fractional and missing stats',
  () => {
    assertEquals(
      validateStatAllocation({ strength: 0, stamina: 10, agility: 5, focus: 5 })
        .ok,
      false,
    );
    assertEquals(
      validateStatAllocation({ strength: 11, stamina: 3, agility: 3, focus: 3 })
        .ok,
      false,
    );
    assertEquals(
      validateStatAllocation({
        strength: 5.5,
        stamina: 4.5,
        agility: 5,
        focus: 5,
      }).ok,
      false,
    );
    assertEquals(
      validateStatAllocation({ strength: 10, stamina: 10 }).ok,
      false,
    );
    assertEquals(
      validateStatAllocation({
        strength: '5',
        stamina: 5,
        agility: 5,
        focus: 5,
      }).ok,
      false,
    );
  },
);

Deno.test('validateStatAllocation rejects non-objects', () => {
  assertEquals(validateStatAllocation(null).ok, false);
  assertEquals(validateStatAllocation([5, 5, 5, 5]).ok, false);
  assertEquals(validateStatAllocation('5,5,5,5').ok, false);
});
