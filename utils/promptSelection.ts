/**
 * Whether what the player has on the prompt-entry screen can be locked in.
 *
 * Everything the arena submits is custom text now. There are two ways to get
 * it -- tap one of the generated suggestions, which copies its body into the
 * editor, or type your own -- but both end up as the same string, so there is
 * one rule rather than one per source. The static `prompt_templates` library
 * is retired, and with it the second submission shape that carried a row id
 * and no text of its own.
 *
 * The bug this replaced: a tapped suggestion leaves the "Write your own" tab
 * inactive, so a rule keyed on that tab read a highlighted card as "nothing
 * selected" and refused to lock it in.
 */

/** Matches the `battle_prompts.custom_prompt_text` CHECK constraint. */
export const CUSTOM_PROMPT_MIN_LENGTH = 20;
export const CUSTOM_PROMPT_MAX_LENGTH = 800;

export type PromptTextError = {
  title: string;
  message: string;
};

/**
 * Null when the prompt can be submitted; otherwise the alert to show.
 */
export function validatePromptText(text: string): PromptTextError | null {
  const length = text.trim().length;

  if (length === 0) {
    return {
      title: 'Write Your Prompt',
      message: 'Pick one of the ideas or write your own prompt',
    };
  }

  if (length < CUSTOM_PROMPT_MIN_LENGTH) {
    return {
      title: 'Prompt Too Short',
      message: `Prompts must be at least ${CUSTOM_PROMPT_MIN_LENGTH} characters`,
    };
  }

  if (length > CUSTOM_PROMPT_MAX_LENGTH) {
    return {
      title: 'Prompt Too Long',
      message: `Prompts must be at most ${CUSTOM_PROMPT_MAX_LENGTH} characters`,
    };
  }

  return null;
}
