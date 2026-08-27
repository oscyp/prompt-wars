/**
 * Archetype definitions from the implementation concept
 * All archetypes are free and available from day one
 */

import type { ImageSourcePropType } from 'react-native';

export type ArchetypeId =
  | 'strategist'
  | 'trickster'
  | 'titan'
  | 'mystic'
  | 'engineer';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  description: string;
  trait: string;
  color: string;
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  strategist: {
    id: 'strategist',
    name: 'The Strategist',
    description: 'Precise, tactical, rewards Defense moves',
    trait: 'Tactical Precision',
    color: '#3B82F6', // Blue
  },
  trickster: {
    id: 'trickster',
    name: 'The Trickster',
    description: 'Creative, chaotic, rewards unexpected angles',
    trait: 'Unpredictable Chaos',
    color: '#F59E0B', // Orange
  },
  titan: {
    id: 'titan',
    name: 'The Titan',
    description: 'Direct, powerful, rewards Attack moves',
    trait: 'Raw Power',
    color: '#EF4444', // Red
  },
  mystic: {
    id: 'mystic',
    name: 'The Mystic',
    description: 'Poetic, abstract, rewards Originality',
    trait: 'Abstract Vision',
    color: '#8B5CF6', // Purple
  },
  engineer: {
    id: 'engineer',
    name: 'The Engineer',
    description: 'Structured, technical, rewards Specificity',
    trait: 'Technical Mastery',
    color: '#10B981', // Green
  },
} as const;

export const ARCHETYPE_LIST = Object.values(ARCHETYPES);

/**
 * Key art for each archetype, shown behind the card on the "Choose your
 * archetype" step. Generated via `scripts/generate-assets.mjs` (Google Nano
 * Banana / Gemini 2.5 Flash Image) at 768x432; each is composed with the figure
 * in the left third and open space on the right so the card's text has somewhere
 * to sit.
 *
 * Baseline (not progressive) JPEG: React Native's iOS <Image> renders only the
 * first scan of a progressive JPEG, which shows up as a blurry colour wash
 * instead of the art. Same constraint as ART_STYLE_THUMBS.
 */
export const ARCHETYPE_ART: Record<ArchetypeId, ImageSourcePropType> = {
  strategist: require('../assets/images/archetypes/strategist.jpg'),
  trickster: require('../assets/images/archetypes/trickster.jpg'),
  titan: require('../assets/images/archetypes/titan.jpg'),
  mystic: require('../assets/images/archetypes/mystic.jpg'),
  engineer: require('../assets/images/archetypes/engineer.jpg'),
};
