/**
 * The prompt-entry lock-in rule. The regression this guards: tapping a
 * generated idea highlighted the card but Lock In answered "Select a Prompt",
 * because only a static template counted as a selection. Templates are gone —
 * an idea and a hand-written prompt are now the same string on the way out.
 */
import {
  validatePromptText,
  CUSTOM_PROMPT_MIN_LENGTH,
  CUSTOM_PROMPT_MAX_LENGTH,
} from '@/utils/promptSelection';

const IDEA_BODY =
  'With default calm expression, the modern trickster lets his umbrella hang motionless.';

describe('validatePromptText', () => {
  it('rejects an untouched screen', () => {
    expect(validatePromptText('')).toEqual({
      title: 'Write Your Prompt',
      message: 'Pick one of the ideas or write your own prompt',
    });
  });

  it('rejects whitespace as empty rather than as too short', () => {
    expect(validatePromptText('    \n  ')?.title).toBe('Write Your Prompt');
  });

  it('accepts a tapped idea', () => {
    expect(validatePromptText(IDEA_BODY)).toBeNull();
  });

  it('accepts an idea the player edited', () => {
    expect(validatePromptText(`${IDEA_BODY} Then he strikes.`)).toBeNull();
  });

  it('rejects text edited down below the minimum', () => {
    expect(validatePromptText('too short')).toEqual({
      title: 'Prompt Too Short',
      message: `Prompts must be at least ${CUSTOM_PROMPT_MIN_LENGTH} characters`,
    });
  });

  it('accepts exactly the minimum length', () => {
    expect(validatePromptText('x'.repeat(CUSTOM_PROMPT_MIN_LENGTH))).toBeNull();
  });

  it('rejects one character under the minimum', () => {
    expect(
      validatePromptText('x'.repeat(CUSTOM_PROMPT_MIN_LENGTH - 1)),
    ).not.toBeNull();
  });

  it('measures length after trimming', () => {
    const padded = `   ${'x'.repeat(CUSTOM_PROMPT_MIN_LENGTH - 1)}   `;
    expect(padded.length).toBeGreaterThan(CUSTOM_PROMPT_MIN_LENGTH);
    expect(validatePromptText(padded)?.title).toBe('Prompt Too Short');
  });

  it('accepts exactly the maximum length', () => {
    expect(validatePromptText('x'.repeat(CUSTOM_PROMPT_MAX_LENGTH))).toBeNull();
  });

  it('rejects text past the maximum the server would refuse', () => {
    // battle_prompts.custom_prompt_text CHECK caps at 800; a longer prompt
    // would fail the insert rather than the client.
    expect(
      validatePromptText('x'.repeat(CUSTOM_PROMPT_MAX_LENGTH + 1)),
    ).toEqual({
      title: 'Prompt Too Long',
      message: `Prompts must be at most ${CUSTOM_PROMPT_MAX_LENGTH} characters`,
    });
  });
});
