/**
 * Live length coaching for the prompt editor.
 *
 * Pure so the bands can be pinned in tests. Two different rulers apply and
 * the copy has to say which one it means:
 *
 * - Characters are the hard floor and ceiling. `battle_prompts` rejects text
 *   under 20 or over 800 characters (see promptSelection.ts), so those bands
 *   talk in characters and count exactly what the server counts: the trimmed
 *   length. A prompt padded with spaces is not longer.
 * - Words are the judge's soft target. `_shared/judge.ts` normalizes toward
 *   15–80 words and penalizes past 100, so once the floor is cleared the
 *   coaching switches to words.
 */

export const WORDS_MIN_GOOD = 15;
export const WORDS_MAX_GOOD = 80;
export const WORDS_PENALTY = 100;

export type CoachState = 'empty' | 'tooShort' | 'good' | 'long' | 'tooLong';

/** Mapped to theme colours by the screen; the module never sees a palette. */
export type CoachTone = 'muted' | 'warning' | 'success' | 'error';

/** Ionicons glyph names, kept as literals so the module stays dependency-free. */
export type CoachIcon =
  | 'ellipse-outline'
  | 'alert-circle'
  | 'checkmark-circle'
  | 'close-circle';

export interface CoachOptions {
  minChars: number;
  maxChars: number;
}

export const COACH_DEFAULTS: CoachOptions = { minChars: 20, maxChars: 800 };

export interface CoachResult {
  state: CoachState;
  label: string;
  icon: CoachIcon;
  tone: CoachTone;
  /** Characters that count toward the limits: the trimmed length. */
  chars: number;
  words: number;
  /** The counter under the editor, e.g. "12 words · 68/800". */
  counter: string;
}

/** Whitespace-separated words in the trimmed text; 0 for blank input. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function coachPrompt(
  text: string,
  options: CoachOptions = COACH_DEFAULTS,
): CoachResult {
  const { minChars, maxChars } = options;
  const chars = text.trim().length;
  const words = countWords(text);
  const counter = `${words} ${words === 1 ? 'word' : 'words'} · ${chars}/${maxChars}`;
  const base = { chars, words, counter };

  if (chars === 0) {
    return {
      ...base,
      state: 'empty',
      label: `Aim for ${WORDS_MIN_GOOD}–${WORDS_MAX_GOOD} words`,
      icon: 'ellipse-outline',
      tone: 'muted',
    };
  }

  if (chars < minChars) {
    const remaining = minChars - chars;
    return {
      ...base,
      state: 'tooShort',
      label: `At least ${minChars} characters · ${remaining} to go`,
      icon: 'alert-circle',
      tone: 'warning',
    };
  }

  if (chars > maxChars) {
    return {
      ...base,
      state: 'tooLong',
      label: `Too long — max ${maxChars} characters`,
      icon: 'close-circle',
      tone: 'error',
    };
  }

  if (words > WORDS_PENALTY) {
    return {
      ...base,
      state: 'tooLong',
      label: 'Too long — the judge caps length',
      icon: 'close-circle',
      tone: 'error',
    };
  }

  if (words > WORDS_MAX_GOOD) {
    return {
      ...base,
      state: 'long',
      label: 'Getting long',
      icon: 'alert-circle',
      tone: 'warning',
    };
  }

  // Past the character floor but under the judge's word target. Submittable,
  // so it is not blocked, but calling four words "Good length" would be a lie.
  if (words < WORDS_MIN_GOOD) {
    return {
      ...base,
      state: 'tooShort',
      label: `Short — aim for ${WORDS_MIN_GOOD}–${WORDS_MAX_GOOD} words`,
      icon: 'alert-circle',
      tone: 'warning',
    };
  }

  return {
    ...base,
    state: 'good',
    label: 'Good length',
    icon: 'checkmark-circle',
    tone: 'success',
  };
}
