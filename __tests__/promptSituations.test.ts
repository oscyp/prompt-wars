import { getFallbackMoveSuggestions } from '../utils/promptSituations';
import { SITUATIONS } from '../supabase/functions/_shared/prompt-situations';

describe('authored move fallback', () => {
  it('offers complete, bounded pairs for every situation and move without generation', () => {
    for (const situation of SITUATIONS) {
      for (const moveType of ['attack', 'defense', 'finisher'] as const) {
        const options = getFallbackMoveSuggestions({ moveType, situation });
        expect(options).toHaveLength(3);
        expect(new Set(options.map((o) => o.id)).size).toBe(3);
        for (const option of options) {
          expect(option.intentHints).toHaveLength(3);
          for (const intent of option.intentHints!) {
            const text = `${option.action} ${intent.text}`;
            expect(text.length).toBeGreaterThanOrEqual(20);
            expect(text.length).toBeLessThanOrEqual(800);
          }
        }
      }
    }
  });
});
