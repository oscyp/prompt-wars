/**
 * Design system tokens — Prompt Wars
 * Dark-first "Neon Esports Arena" theme.
 *
 * Rules:
 *  - Never hard-code spacing/radius/font sizes outside this file.
 *  - Colors live in constants/Colors.ts (or constants/Archetypes.ts).
 */

import { Platform } from 'react-native';

/**
 * 8pt grid + a couple of extras for hero/section gaps.
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/**
 * Font families. Loaded in app/_layout.tsx via @expo-google-fonts.
 * Use `fonts.display` for headlines / wordmarks (Orbitron — geometric, gamey).
 * Use `fonts.body` for everything else (Inter — clean, readable).
 */
export const Typography = {
  fonts: {
    display: 'Orbitron_700Bold',
    displayBlack: 'Orbitron_900Black',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  },
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display3: 28,
    display2: 36,
    display1: 44,
    hero: 56,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1.2,
    widest: 2.4,
  },
} as const;

/**
 * Border radii. New "xxl/xxxl/pill" for game-y cards & chips.
 */
export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  xxxl: 32,
  pill: 999,
  full: 9999,
} as const;

/**
 * Common layout dimensions.
 */
export const Layout = {
  tabBarHeight: 72,
  tabBarFloatingMargin: 16,
  headerHeight: 56,
  buttonHeight: 52,
  buttonHeightSm: 40,
  buttonHeightLg: 60,
  inputHeight: 52,
  heroHeight: 240,
  cardMinHeight: 96,
  sigilSize: 96,
} as const;

/**
 * Animation timing constants.
 */
export const Motion = {
  durations: {
    fast: 150,
    base: 240,
    slow: 360,
    pageEnter: 420,
  },
  springs: {
    snappy: { damping: 18, stiffness: 220, mass: 0.9 },
    soft: { damping: 22, stiffness: 140, mass: 1.0 },
    punchy: { damping: 12, stiffness: 260, mass: 0.8 },
  },
  pressScale: 0.96,
} as const;

/**
 * Gradient stop tuples. Use with expo-linear-gradient.
 * 2-stop tuples by default; 3-stop variants for "rich" surfaces.
 */
export const Gradients = {
  heroPrimary: ['#7C3AED', '#22D3EE'] as const,
  heroAttack: ['#7F1D1D', '#F87171'] as const,
  heroDefense: ['#1E3A8A', '#60A5FA'] as const,
  heroFinisher: ['#4C1D95', '#F472B6'] as const,
  victory: ['#F59E0B', '#FBBF24', '#FDE68A'] as const,
  defeat: ['#7F1D1D', '#1F1F2E'] as const,
  draw: ['#374151', '#6B7280'] as const,
  cardSurface: ['#1F1F2E', '#15151F'] as const,
  cardSurfaceMuted: ['#15151F', '#0B0B12'] as const,
  cardGlass: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'] as const,
  rankGold: ['#FBBF24', '#B45309'] as const,
  rankSilver: ['#E5E7EB', '#9CA3AF'] as const,
  rankBronze: ['#D97706', '#7C2D12'] as const,
  archetype: {
    strategist: ['#1E3A8A', '#3B82F6'] as const,
    trickster: ['#7C2D12', '#F59E0B'] as const,
    titan: ['#7F1D1D', '#EF4444'] as const,
    mystic: ['#4C1D95', '#8B5CF6'] as const,
    engineer: ['#064E3B', '#10B981'] as const,
  },
} as const;

/**
 * Shadow / glow presets. Each preset is a style object you can spread into
 * a StyleSheet entry. iOS gets shadow*, Android gets elevation.
 *
 * Note: Android elevation can't tint shadow color, so neon glow is iOS-only;
 * Android still gets depth via elevation. That's a fine fallback for a game.
 */
type ShadowPreset = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const glow = (color: string, radius = 16, opacity = 0.6, elevation = 8): ShadowPreset => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ShadowPreset,
  cardElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  } as ShadowPreset,
  cardSubtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  } as ShadowPreset,
  glowPrimary: glow('#A78BFA', 20, 0.7, 10),
  glowAccent: glow('#22D3EE', 20, 0.6, 10),
  glowAttack: glow('#F87171', 18, 0.6, 8),
  glowDefense: glow('#60A5FA', 18, 0.6, 8),
  glowFinisher: glow('#C084FC', 18, 0.7, 8),
  glowGold: glow('#FBBF24', 22, 0.75, 10),
  glowSubtle: glow('#A78BFA', 12, 0.35, 4),
} as const;

export type GradientKey = keyof typeof Gradients;
export type ShadowKey = keyof typeof Shadows;
