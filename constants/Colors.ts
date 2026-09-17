/**
 * Color palette for Prompt Wars
 * Supports light and dark themes
 */

export type ColorStyle = 'light' | 'dark';

export const Colors = {
  light: {
    // Primary brand colors
    primary: '#6940B3', // Readable lavender-family ink on light surfaces
    primaryDark: '#7C3AED',
    primaryLight: '#A78BFA',

    // Backgrounds
    background: '#FFFFFF',
    backgroundSecondary: '#F9FAFB',
    backgroundTertiary: '#F3F4F6',

    // Text
    text: '#111827',
    textSecondary: '#575365',
    textTertiary: '#696374',

    // UI elements
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    card: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.1)',

    // Semantic colors
    success: '#066B4B',
    warning: '#805300',
    error: '#B42336',
    info: '#2457CA',

    // Battle-specific. Finisher is deliberately NOT the brand purple: a selected
    // finisher button used to be indistinguishable from any primary CTA.
    attack: '#EF4444',
    defense: '#3B82F6',
    finisher: '#DB2777',

    // Interactive
    link: '#2457CA',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#6940B3',

    // Collectible chrome. Action ink is explicit: lavender fills use dark text.
    actionFill: '#C4AFFE',
    actionInk: '#0B0B13',
    dangerInk: '#FFFFFF',
    ornament: '#8A6426',
    ornamentMuted: '#C8B99E',
    selectedSurface: '#EDE5FE',
    fieldSurface: '#FFFFFF',
    fieldBorder: '#80748F',
    disabledSurface: '#E9E6EE',
    disabledInk: '#696374',
    focusRing: '#6940B3',

    // Leaderboard medals (top-3 podium)
    medalGold: '#D4A017',
    medalSilver: '#8E9AAB',
    medalBronze: '#B0703C',
  },
  dark: {
    // Primary brand colors
    primary: '#C4AFFE', // Lavender action and display accent
    primaryDark: '#8B5CF6',
    primaryLight: '#C4B5FD',

    // Backgrounds
    background: '#0B0B13',
    backgroundSecondary: '#171721',
    backgroundTertiary: '#232330',

    // Text
    text: '#F9FAFB',
    textSecondary: '#D1D5DB',
    textTertiary: '#9CA3AF',

    // UI elements
    border: '#374151',
    borderLight: '#262626',
    card: '#171721',
    shadow: 'rgba(0, 0, 0, 0.3)',

    // Semantic colors
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',

    // Battle-specific. See the light palette: finisher must not equal primary.
    attack: '#F87171',
    defense: '#60A5FA',
    finisher: '#F472B6',

    // Interactive
    link: '#60A5FA',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#C4AFFE',

    // Gold is ornamental; semantic success/warning/error and move inks stay distinct.
    actionFill: '#C4AFFE',
    actionInk: '#0B0B13',
    dangerInk: '#0B0B13',
    ornament: '#D5AD63',
    ornamentMuted: '#756244',
    selectedSurface: '#302443',
    fieldSurface: '#11111C',
    fieldBorder: '#81748F',
    disabledSurface: '#292733',
    disabledInk: '#B4ADBF',
    focusRing: '#E4D8FF',

    // Leaderboard medals (top-3 podium)
    medalGold: '#FFD700',
    medalSilver: '#C0C0C0',
    medalBronze: '#CD7F32',
  },
} as const;

/**
 * Archetype signature colors
 * Used for character customization
 */
export const ArchetypeColors = {
  strategist: '#3B82F6', // Blue
  trickster: '#F59E0B', // Orange
  titan: '#EF4444', // Red
  mystic: '#8B5CF6', // Purple
  engineer: '#10B981', // Green
} as const;
