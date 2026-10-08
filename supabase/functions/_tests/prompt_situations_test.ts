import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  SITUATIONS,
  selectSituation,
  promptExperienceVersion,
  requiresPromptClientUpdate,
} from '../_shared/prompt-situations.ts';

Deno.test(
  'each series publishes three distinct, stable situations in its theme',
  () => {
    for (const theme of new Set(SITUATIONS.map((s) => s.theme))) {
      const rounds = [1, 2, 3].map((round) =>
        selectSituation('battle-123', theme, round, 1),
      );
      assertEquals(new Set(rounds.map((s) => s.id)).size, 3);
      assertEquals(new Set(rounds.map((s) => s.environmentId)).size, 1);
      assertEquals(rounds[1], selectSituation('battle-123', theme, 2, 1));
      for (const round of rounds) {
        const words = round.text.split(/\s+/).length;
        assertEquals(words >= 20 && words <= 35, true);
      }
    }
    assertEquals(SITUATIONS.length, 15);
    assertThrows(() => selectSituation('battle', 'unknown', 1, 1));
    assertThrows(() => selectSituation('battle', SITUATIONS[0].theme, 4, 1));
  },
);

Deno.test(
  'new series default to the composer while existing experiences stay pinned',
  () => {
    assertEquals(promptExperienceVersion(1), 1);
    assertEquals(promptExperienceVersion(2), 2);
    assertEquals(promptExperienceVersion(null), 2);
    assertEquals(promptExperienceVersion(), 2);
    assertEquals(requiresPromptClientUpdate(1, undefined), false);
    assertEquals(requiresPromptClientUpdate(2, 2), true);
    assertEquals(requiresPromptClientUpdate(2, 3), false);
  },
);
