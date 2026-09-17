import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateStatAllocation } from '../_shared/character-stats.ts';
import { parseFunnelEvent } from '../_shared/tutorial.ts';
Deno.test(
  'respec validates progressed pool and rejects fractions or inflation',
  () => {
    assertEquals(
      validateStatAllocation(
        { strength: 6, stamina: 6, agility: 6, focus: 6 },
        24,
      ).ok,
      true,
    );
    assertEquals(
      validateStatAllocation(
        { strength: 7, stamina: 6, agility: 6, focus: 6 },
        24,
      ).ok,
      false,
    );
    assertEquals(
      validateStatAllocation(
        { strength: 5.5, stamina: 6.5, agility: 6, focus: 6 },
        24,
      ).ok,
      false,
    );
  },
);
Deno.test(
  'funnel accepts only enums and bounded duration, never arbitrary metadata',
  () => {
    assertEquals(
      parseFunnelEvent({
        event: 'draft_recovered',
        duration_ms: 42,
        prompt: 'secret',
      }),
      { event: 'draft_recovered', duration_ms: 42, battle_id: null },
    );
    assertEquals(parseFunnelEvent({ event: 'arbitrary' }), null);
    assertEquals(
      parseFunnelEvent({ event: 'tutorial_started', duration_ms: -1 }),
      null,
    );
  },
);
