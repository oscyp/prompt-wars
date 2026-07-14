import type { Ionicons } from '@expo/vector-icons';
import type { MoveType } from '@/utils/battles';

/**
 * Single source of truth for move-type presentation + rock-paper-scissors
 * relations (§7.1): attack beats finisher, defense beats attack, finisher
 * beats defense. Icons double as shape cues so color-blind users get parity
 * (flash / shield / skull are distinct silhouettes).
 */
export const MOVE_META: Record<
  MoveType,
  { icon: keyof typeof Ionicons.glyphMap; beats: MoveType; losesTo: MoveType }
> = {
  attack: { icon: 'flash', beats: 'finisher', losesTo: 'defense' },
  defense: { icon: 'shield', beats: 'attack', losesTo: 'finisher' },
  finisher: { icon: 'skull', beats: 'defense', losesTo: 'attack' },
};

/** The move type that counters (beats) the given move. */
export function counterOf(move: MoveType): MoveType {
  return MOVE_META[move].losesTo;
}
