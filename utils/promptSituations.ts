import type {
  ComposerActionSuggestion,
  MoveSuggestion,
  MoveType,
} from './battles';
import { authoredSceneActions } from './authoredMoveCatalog';
import type { SituationSnapshot } from '@/types/battle';
import { SITUATION_TACTICS } from '../supabase/functions/_shared/prompt-situations';
export { getSituationAffordances } from '../supabase/functions/_shared/prompt-affordances';

type AuthoredAction = {
  title: string;
  action: string;
  intents: readonly [string, string, string];
};
const FALLBACK: Record<MoveType, readonly AuthoredAction[]> = {
  attack: [
    {
      title: 'Change the angle',
      action: 'I approach at an angle, then step across the open space.',
      intents: [
        'I want to draw their guard to one side before striking from the other.',
        'I aim to make them turn before they can settle their footing.',
        'I want to test their reach while keeping room to pull back.',
      ],
    },
    {
      title: 'Break the rhythm',
      action:
        'I start a quick advance, pause, then close the remaining distance.',
      intents: [
        'I want their first response to arrive before my actual strike.',
        'I aim to interrupt their timing with a short, controlled attack.',
        'I want to notice their reaction before choosing where to strike.',
      ],
    },
    {
      title: 'Create an opening',
      action: 'I show a high strike, then lower my stance and step in.',
      intents: [
        'I want to draw their attention upward and attack the space below.',
        'I aim to make them retreat so I can take the clearer ground.',
        'I want them to commit to a guard before I change my direction.',
      ],
    },
  ],
  defense: [
    {
      title: 'Keep an escape',
      action: 'I turn sideways and leave a clear path behind me.',
      intents: [
        'I want to redirect a close attack and step out of its follow-through.',
        'I aim to keep my balance if they try to push me backward.',
        'I want enough room to retreat without turning my back.',
      ],
    },
    {
      title: 'Move off line',
      action: 'I lower my stance and take a short step to the side.',
      intents: [
        'I want a direct attack to pass beside me instead of meeting it head-on.',
        'I aim to make them adjust their direction while I recover my guard.',
        'I want to keep them in view without giving up too much ground.',
      ],
    },
    {
      title: 'Hold your ground',
      action: 'I plant my feet and keep my guard close to my body.',
      intents: [
        'I want to absorb a glancing hit without overreaching for a counter.',
        'I aim to protect my centre while watching for a change in their approach.',
        'I want to give up a little distance rather than lose my balance.',
      ],
    },
  ],
  finisher: [
    {
      title: 'Commit after a feint',
      action:
        'I feint to one side, then commit to a decisive strike from the other.',
      intents: [
        'I want their first movement to open the line of my final attack.',
        'I aim to end the exchange before they recover their guard.',
        'I want to turn the space they leave behind into a clear approach.',
      ],
    },
    {
      title: 'Close the distance',
      action:
        'I take a short sidestep and drive forward in one controlled movement.',
      intents: [
        'I want to finish at close range before they can rebuild distance.',
        'I aim to stay balanced while putting all my momentum into one strike.',
        'I want to deny them room to turn into another attack.',
      ],
    },
    {
      title: 'Wait for commitment',
      action:
        'I hold my position briefly, then launch a decisive attack as they move.',
      intents: [
        'I want to catch the moment when changing direction is hardest.',
        'I aim to strike through the opening left by their movement.',
        'I want to use their forward momentum to shorten my final approach.',
      ],
    },
  ],
};

/** Authored free alternatives: no request, debit, inferred props or guaranteed outcome. */
export function getFallbackMoveSuggestions({
  moveType,
  situation,
}: {
  moveType: MoveType;
  situation?: SituationSnapshot | null;
  fighterName?: string;
}): MoveSuggestion[] {
  const authored = authoredSceneActions(situation).filter(
    (entry) => entry.moveType === moveType,
  );
  if (authored.length === 3) return authored;
  return FALLBACK[moveType].map((entry, index) => {
    const tactic =
      index === 0 && situation ? SITUATION_TACTICS[situation.id] : null;
    if (tactic)
      entry = {
        title: 'Use the surroundings',
        action: tactic.action,
        intents: tactic.intents,
      };
    const id = `authored-v1:${situation?.id ?? 'legacy'}:${moveType}:${index}`;
    const intentHints = entry.intents.map((text, i) => ({
      id: `${id}:intent:${i}`,
      text,
    }));
    return {
      id,
      structureVersion: 2,
      title: entry.title,
      body: `${entry.action} ${intentHints[0].text}`,
      action: entry.action,
      intentHints,
    };
  });
}

export function getAllFallbackMoveSuggestions(
  situation?: SituationSnapshot | null,
): ComposerActionSuggestion[] {
  const authored = authoredSceneActions(situation);
  if (authored.length) return authored;
  return (['attack', 'defense', 'finisher'] as const).flatMap((moveType) =>
    getFallbackMoveSuggestions({ moveType, situation }).map((suggestion) => ({
      ...suggestion,
      moveType,
      source: 'authored' as const,
      affordanceIds: [],
    })),
  );
}
