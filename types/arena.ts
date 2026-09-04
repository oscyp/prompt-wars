import type { ImageSourcePropType } from 'react-native';

export type ArenaSoundEvent =
  | 'matchFound'
  | 'moveSelected'
  | 'promptLocked'
  | 'transition';

export interface ArenaPresentation {
  id:
    | 'neon-nexus'
    | 'storm-citadel'
    | 'ember-forge'
    | 'astral-temple'
    | 'verdant-reactor'
    | 'frozen-void';
  backdrop: ImageSourcePropType;
  poster: ImageSourcePropType;
  accent: string;
  ambientLoop: number;
}

export interface AudioPreferences {
  music: boolean;
  soundEffects: boolean;
}
