export type TutorialHintKey = 'theme' | 'move' | 'write' | 'lock' | 'result';
export interface TutorialState {
  battle_id: string | null;
  dismissed_hints: TutorialHintKey[];
  completed_at: string | null;
}
const HINTS: Record<TutorialHintKey, string> = {
  theme:
    'Use the theme in your plan. A clear connection helps the judge understand your idea.',
  move: 'Choose a move, then explain how it works. Attack, Defense and Special each have a different role.',
  write:
    'Write a specific prompt: what your fighter does, how it works, and why it fits the theme.',
  lock: 'Happy with your idea? Hold Lock in. Your prompt cannot change after submission.',
  result:
    'Compare the scores and the reason for the result. Practice uses ordinary judging; either fighter can win.',
};
export function tutorialHint(
  state: TutorialState | null,
  battleId: string,
  hint: TutorialHintKey,
): string | null {
  if (
    !state ||
    state.battle_id !== battleId ||
    state.dismissed_hints.includes(hint)
  )
    return null;
  if (state.completed_at && hint !== 'result') return null;
  return HINTS[hint];
}
