/**
 * Short, true things to read while the arena is busy elsewhere.
 *
 * Shown on the matchmaking screen while the queue searches and on the waiting
 * room while the judge scores. Every line states a rule the game actually
 * enforces (move counters in `constants/MoveTypes.ts`, the rubric in
 * `_shared/judge.ts`, HP and damage in `round-resolve`, streak milestones in
 * `grant_win_streak_reward`, leave pricing in `useLeaveBattle`); nothing here
 * promises a mechanic the server does not have. Kept pure so the copy can be
 * pinned without mounting a screen.
 */

export const ARENA_TIPS: readonly string[] = [
  'Defense counters Attack, Attack counters Finisher, and Finisher counters Defense.',
  'The judge scores clarity, originality, specificity, theme fit, archetype fit and dramatic potential.',
  "Archetype fit is part of the score, so write in your fighter's voice, not only about the theme.",
  'A knockout ends the series at once when a round win drops your opponent to zero HP by a wide margin.',
  'Stamina sets your HP: each point adds 8, from 68 at stamina 1 to 140 at stamina 10.',
  'Strength scales the damage of every round you win, and Focus steadies the stat modifier.',
  'Every prompt is moderated before the judge reads it.',
  'Leaving a battle is free until you lock in a prompt, and costs credits after.',
  'The daily theme changes every day.',
  'Win streaks pay credits at 3, 5 and 7 wins, then at 10 and every fifth win after.',
  'A series is best of three: two round wins take it, and every round starts with a fresh move pick.',
  'Casual battles never change your rating, so use them to try a move type you rarely pick.',
];

/** How long one tip stays up before the next fades in. */
export const TIP_INTERVAL_MS = 4000;

/**
 * The tip for a given rotation step.
 *
 * Deterministic: the same `tick` and `seed` always yield the same line, so a
 * re-render never swaps the text out from under the reader. `seed` offsets the
 * start so two visits do not always open on the same tip; non-finite or
 * fractional inputs are floored to a safe index rather than throwing.
 */
export function tipForTick(tick: number, seed = 0): string {
  const n = ARENA_TIPS.length;
  const safe = (v: number) => (Number.isFinite(v) ? Math.floor(v) : 0);
  const index = (((safe(seed) + safe(tick)) % n) + n) % n;
  return ARENA_TIPS[index];
}
