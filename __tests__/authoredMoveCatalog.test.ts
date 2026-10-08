import {
  composerReducer,
  createComposerState,
  composerCanSubmit,
} from '../utils/promptComposer';
import { SITUATIONS } from '../supabase/functions/_shared/prompt-situations';
import {
  getAllFallbackMoveSuggestions,
  getSituationAffordances,
} from '../utils/promptSituations';

describe('scene-specific action catalogue', () => {
  it('provides 135 different actions and 405 bounded, compatible choices offline', () => {
    const ids = new Set<string>();
    const actions = new Set<string>();
    let pairs = 0;
    let triples = 0;
    const approachIds = new Set<string>();
    for (const situation of SITUATIONS) {
      const affordances = getSituationAffordances(situation);
      expect(affordances.length).toBeGreaterThanOrEqual(2);
      expect(affordances.length).toBeLessThanOrEqual(3);
      const allowed = new Set(affordances.map((a) => a.id));
      const options = getAllFallbackMoveSuggestions(situation);
      expect(options).toHaveLength(9);
      for (const type of ['attack', 'defense', 'finisher']) {
        expect(options.filter((a) => a.moveType === type)).toHaveLength(3);
      }
      for (const option of options) {
        expect(ids.has(option.id!)).toBe(false);
        ids.add(option.id!);
        actions.add(option.action!);
        expect(option.source).toBe('authored');
        expect(option.affordanceIds!.length).toBeGreaterThan(0);
        expect(option.affordanceIds!.every((id) => allowed.has(id))).toBe(true);
        expect(new Set(option.intentHints!.map((i) => i.text)).size).toBe(3);
        for (const intent of option.intentHints!) {
          const prompt = `${option.action} ${intent.text}`;
          expect(prompt.length).toBeGreaterThanOrEqual(20);
          expect(prompt.length).toBeLessThanOrEqual(800);
          pairs += 1;
          expect(option.compositionVersion).toBe(3);
          expect(intent.approachHints).toHaveLength(3);
          expect(
            new Set(intent.approachHints!.map((hint) => hint.text)).size,
          ).toBe(3);
          for (const approach of intent.approachHints!) {
            expect(approachIds.has(approach.id)).toBe(false);
            approachIds.add(approach.id);
            expect(approach.text.length).toBeGreaterThanOrEqual(5);
            expect(approach.text.length).toBeLessThanOrEqual(240);
            // Existing intention prose ends in a period: the added method is a
            // complete sentence rather than silently editing a shipped fragment.
            expect(approach.text).toMatch(/^I [A-Z a-z’'-]+[.]$/);
            let state = composerReducer(createComposerState(), {
              type: 'change',
              change: {
                type: 'action',
                id: option.id!,
                text: option.action!,
                moveType: option.moveType,
                intentHints: option.intentHints,
              },
            });
            state = composerReducer(state, {
              type: 'change',
              change: { type: 'intent', ...intent },
            });
            state = composerReducer(state, {
              type: 'change',
              change: { type: 'approach', ...approach },
            });
            expect(state.finalText).toBe(
              `${option.action} ${intent.text} ${approach.text}`,
            );
            expect(composerCanSubmit(state)).toBe(true);
            triples += 1;
          }
        }
        expect(option.body).toBe(
          `${option.action} ${option.intentHints![0].text}`,
        );
      }
    }
    expect(ids.size).toBe(135);
    expect(actions.size).toBe(135);
    expect(pairs).toBe(405);
    expect(triples).toBe(1215);
  });

  it('does not invent affordances for an unrecognised snapshot', () => {
    expect(
      getSituationAffordances({ id: 'neon-1', catalogVersion: 2 }),
    ).toEqual([]);
    expect(
      getSituationAffordances({ id: 'unknown', catalogVersion: 1 }),
    ).toEqual([]);
  });
});
