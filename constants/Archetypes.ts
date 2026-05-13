/**
 * Archetype definitions from the implementation concept.
 * All archetypes are free and available from day one.
 *
 * Each archetype carries:
 *  - `color`: brand-identity signature color (same across light/dark).
 *  - `gradient`: 2-stop tuple for hero surfaces.
 *  - `glowColor`: outer-glow shadow color.
 *  - `iconName`: @expo/vector-icons MaterialCommunityIcons glyph.
 */

import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type ArchetypeId =
  | 'strategist'
  | 'trickster'
  | 'titan'
  | 'mystic'
  | 'engineer';

export type MCIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface Archetype {
  id: ArchetypeId;
  name: string;
  shortName: string;
  description: string;
  trait: string;
  reward: string;
  color: string;
  gradient: readonly [string, string];
  glowColor: string;
  iconName: MCIconName;
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  strategist: {
    id: 'strategist',
    name: 'The Strategist',
    shortName: 'Strategist',
    description: 'Precise, tactical, rewards Defense moves',
    trait: 'Tactical Precision',
    reward: 'Rewards Defense',
    color: '#3B82F6',
    gradient: ['#1E3A8A', '#3B82F6'] as const,
    glowColor: '#60A5FA',
    iconName: 'chess-knight',
  },
  trickster: {
    id: 'trickster',
    name: 'The Trickster',
    shortName: 'Trickster',
    description: 'Creative, chaotic, rewards unexpected angles',
    trait: 'Unpredictable Chaos',
    reward: 'Rewards Originality',
    color: '#F59E0B',
    gradient: ['#7C2D12', '#F59E0B'] as const,
    glowColor: '#FBBF24',
    iconName: 'drama-masks',
  },
  titan: {
    id: 'titan',
    name: 'The Titan',
    shortName: 'Titan',
    description: 'Direct, powerful, rewards Attack moves',
    trait: 'Raw Power',
    reward: 'Rewards Attack',
    color: '#EF4444',
    gradient: ['#7F1D1D', '#EF4444'] as const,
    glowColor: '#F87171',
    iconName: 'sword-cross',
  },
  mystic: {
    id: 'mystic',
    name: 'The Mystic',
    shortName: 'Mystic',
    description: 'Poetic, abstract, rewards Originality',
    trait: 'Abstract Vision',
    reward: 'Rewards Finishers',
    color: '#8B5CF6',
    gradient: ['#4C1D95', '#8B5CF6'] as const,
    glowColor: '#C084FC',
    iconName: 'eye-circle',
  },
  engineer: {
    id: 'engineer',
    name: 'The Engineer',
    shortName: 'Engineer',
    description: 'Structured, technical, rewards Specificity',
    trait: 'Technical Mastery',
    reward: 'Rewards Specificity',
    color: '#10B981',
    gradient: ['#064E3B', '#10B981'] as const,
    glowColor: '#34D399',
    iconName: 'cog-outline',
  },
} as const;

export const ARCHETYPE_LIST: readonly Archetype[] = Object.values(ARCHETYPES);
