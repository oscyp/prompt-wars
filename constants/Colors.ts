/**
 * Color palette for Prompt Wars
 * Supports light and dark themes
 */

export type ColorStyle = 'light' | 'dark';

export const Colors = {
  light: {
    // Primary brand colors
    primary: '#8B5CF6', // Purple
    primaryDark: '#7C3AED',
    primaryLight: '#A78BFA',

    // Backgrounds
    background: '#FFFFFF',
    backgroundSecondary: '#F9FAFB',
    backgroundTertiary: '#F3F4F6',

    // Text
    text: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',

    // UI elements
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    card: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.1)',

    // Semantic colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Battle-specific
    attack: '#EF4444',
    defense: '#3B82F6',
    finisher: '#8B5CF6',

    // Interactive
    link: '#3B82F6',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#8B5CF6',
  },
  dark: {
    // Primary brand colors
    primary: '#A78BFA', // Lighter purple for dark mode
    primaryDark: '#8B5CF6',
    primaryLight: '#C4B5FD',

    // Backgrounds
    background: '#0F0F0F',
    backgroundSecondary: '#1A1A1A',
    backgroundTertiary: '#262626',

    // Text
    text: '#F9FAFB',
    textSecondary: '#D1D5DB',
    textTertiary: '#9CA3AF',

    // UI elements
    border: '#374151',
    borderLight: '#262626',
    card: '#1A1A1A',
    shadow: 'rgba(0, 0, 0, 0.3)',

    // Semantic colors
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',

    // Battle-specific
    attack: '#F87171',
    defense: '#60A5FA',
    finisher: '#A78BFA',

    // Interactive
    link: '#60A5FA',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#A78BFA',
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
