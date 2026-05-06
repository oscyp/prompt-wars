/**
 * Archetype definitions from the implementation concept
 * All archetypes are free and available from day one
 */

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
