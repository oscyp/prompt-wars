/**
 * Color palette for Prompt Wars
 * Dark-first "Neon Esports Arena" theme; light mode is softened.
 */

export type ColorStyle = 'light' | 'dark';

export const Colors = {
  dark: {
    // Brand
    primary: '#A78BFA',
    primaryDark: '#7C3AED',
    primaryLight: '#C4B5FD',
    accent: '#22D3EE',
    accentAlt: '#F472B6',
    gold: '#FBBF24',
    silver: '#E5E7EB',
    bronze: '#D97706',

    // Surfaces (elevation)
    background: '#0A0A12',
    backgroundSecondary: '#10101A',
    backgroundTertiary: '#181826',
    surface0: '#0A0A12',
    surface1: '#10101A',
    surface2: '#181826',
    surface3: '#1F1F2E',

    // Text
    text: '#F5F3FF',
    textSecondary: '#C7C7D9',
    textTertiary: '#8B8BA7',
    textMuted: '#5C5C78',
    textInverse: '#0A0A12',

    // UI chrome
    border: '#2A2A3E',
    borderLight: '#1F1F2E',
    borderStrong: '#3A3A52',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    glassBorderStrong: 'rgba(255, 255, 255, 0.16)',
    card: '#181826',
    cardElevated: '#1F1F2E',
    overlay: 'rgba(10, 10, 18, 0.72)',
    overlayLight: 'rgba(10, 10, 18, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.5)',
    glowPrimary: '#A78BFA',
    glowAccent: '#22D3EE',
    scrim: 'rgba(0, 0, 0, 0.6)',

    // Semantic
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',

    // Battle moves
    attack: '#F87171',
    defense: '#60A5FA',
    finisher: '#C084FC',

    // Interactive
    link: '#22D3EE',
    tabIconDefault: '#5C5C78',
    tabIconSelected: '#A78BFA',
    tabBarBackground: 'rgba(16, 16, 26, 0.92)',
  },
  light: {
    // Brand
    primary: '#7C3AED',
    primaryDark: '#5B21B6',
    primaryLight: '#A78BFA',
    accent: '#0891B2',
    accentAlt: '#DB2777',
    gold: '#D97706',
    silver: '#9CA3AF',
    bronze: '#92400E',

    // Surfaces
    background: '#F8F7FB',
    backgroundSecondary: '#F1EFF7',
    backgroundTertiary: '#E8E5F1',
    surface0: '#F8F7FB',
    surface1: '#FFFFFF',
    surface2: '#F1EFF7',
    surface3: '#E8E5F1',

    // Text
    text: '#0F0B1F',
    textSecondary: '#4B4763',
    textTertiary: '#6B6788',
    textMuted: '#9491A8',
    textInverse: '#FFFFFF',

    // UI chrome
    border: '#D8D4E5',
    borderLight: '#EAE7F1',
    borderStrong: '#B8B2CB',
    glassBorder: 'rgba(15, 11, 31, 0.08)',
    glassBorderStrong: 'rgba(15, 11, 31, 0.16)',
    card: '#FFFFFF',
    cardElevated: '#FFFFFF',
    overlay: 'rgba(15, 11, 31, 0.5)',
    overlayLight: 'rgba(15, 11, 31, 0.2)',
    shadow: 'rgba(15, 11, 31, 0.12)',
    glowPrimary: '#7C3AED',
    glowAccent: '#0891B2',
    scrim: 'rgba(15, 11, 31, 0.4)',

    // Semantic
    success: '#10B981',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',

    // Battle moves
    attack: '#DC2626',
    defense: '#2563EB',
    finisher: '#7C3AED',

    // Interactive
    link: '#0891B2',
    tabIconDefault: '#6B6788',
    tabIconSelected: '#7C3AED',
    tabBarBackground: 'rgba(255, 255, 255, 0.92)',
  },
} as const;

export type ThemedColors = typeof Colors.dark;

/**
 * Archetype signature colors (brand identity — same in light & dark).
 */
export const ArchetypeColors = {
  strategist: '#3B82F6',
  trickster: '#F59E0B',
  titan: '#EF4444',
  mystic: '#8B5CF6',
  engineer: '#10B981',
} as const;
