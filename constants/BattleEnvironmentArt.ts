import type { ImageSourcePropType } from 'react-native';

export interface BattleEnvironment {
  id: string;
  backdrop: ImageSourcePropType;
  banner: ImageSourcePropType;
}

/** Visual-only mapping. ThemeArt retains the existing audio and accent selection. */
export const BATTLE_ENVIRONMENTS: readonly BattleEnvironment[] = [
  {
    id: 'neon-nexus',
    backdrop: require('../assets/images/environments/neon-nexus-backdrop.jpg'),
    banner: require('../assets/images/environments/neon-nexus-banner.jpg'),
  },
  {
    id: 'storm-citadel',
    backdrop: require('../assets/images/environments/storm-citadel-backdrop.jpg'),
    banner: require('../assets/images/environments/storm-citadel-banner.jpg'),
  },
  {
    id: 'ember-forge',
    backdrop: require('../assets/images/environments/ember-forge-backdrop.jpg'),
    banner: require('../assets/images/environments/ember-forge-banner.jpg'),
  },
  {
    id: 'astral-temple',
    backdrop: require('../assets/images/environments/astral-temple-backdrop.jpg'),
    banner: require('../assets/images/environments/astral-temple-banner.jpg'),
  },
  {
    id: 'verdant-reactor',
    backdrop: require('../assets/images/environments/verdant-reactor-backdrop.jpg'),
    banner: require('../assets/images/environments/verdant-reactor-banner.jpg'),
  },
  {
    id: 'frozen-void',
    backdrop: require('../assets/images/environments/frozen-void-backdrop.jpg'),
    banner: require('../assets/images/environments/frozen-void-banner.jpg'),
  },
];
const EXPLICIT: Record<string, string> = {
  'overcome an impossible challenge': 'frozen-void',
  'impossible challenge': 'frozen-void',
  'turn weakness into strength': 'ember-forge',
  'weakness into strength': 'ember-forge',
  'the calm before the storm': 'storm-citadel',
  'calm before the storm': 'storm-citadel',
  'victory from the jaws of defeat': 'verdant-reactor',
  'victory from defeat': 'verdant-reactor',
  'precision over power': 'neon-nexus',
};
export function environmentForTheme(theme?: string | null): BattleEnvironment {
  const normalized = theme?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  if (!normalized) return BATTLE_ENVIRONMENTS[0];
  const named = EXPLICIT[normalized];
  if (named) return BATTLE_ENVIRONMENTS.find((env) => env.id === named)!;
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++)
    hash = Math.imul(hash ^ normalized.charCodeAt(i), 0x01000193);
  return BATTLE_ENVIRONMENTS[(hash >>> 0) % BATTLE_ENVIRONMENTS.length];
}
