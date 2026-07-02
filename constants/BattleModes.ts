/**
 * The three battle-entry modes, with their bundled illustration tiles
 * (docs/DESIGN_LANGUAGE.md — generated once, committed; no emoji in chrome).
 * Single source of truth for the mode bottom-sheet and the fallback
 * `(tabs)/create` screen so deep links and the raised tab action stay in sync.
 */
import { ImageSourcePropType } from 'react-native';
import { UiArt } from './UiArt';

export type BattleMode = 'ranked' | 'unranked' | 'bot';

export interface BattleModeInfo {
  mode: BattleMode;
  title: string;
  description: string;
  art: ImageSourcePropType;
  /** Signature accent for the card border/highlight. */
  accent: string;
}

export const BATTLE_MODES: BattleModeInfo[] = [
  {
    mode: 'ranked',
    title: 'Ranked Battle',
    description: 'Compete for ranking points',
    art: UiArt.modeRanked,
    accent: '#8B5CF6',
  },
  {
    mode: 'unranked',
    title: 'Casual Battle',
    description: 'Practice without rating changes',
    art: UiArt.modeUnranked,
    accent: '#22D3EE',
  },
  {
    mode: 'bot',
    title: 'Practice vs Bot',
    description: 'Learn the basics against AI',
    art: UiArt.modeBot,
    accent: '#10B981',
  },
];
