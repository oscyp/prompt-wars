/**
 * Per-theme visual and audio variety for battle and daily-theme surfaces.
 *
 * Daily themes are free-text `daily_themes` rows (one per date), not a fixed
 * catalog, so we can't bundle one poster per theme. Instead we derive a
 * deterministic, on-brand accent color + poster variant from the theme text so
 * different days read differently — with zero runtime generation
 * (docs/DESIGN_LANGUAGE.md principle 6).
 *
 * Six mood packs ship as static assets. Metro resolves `require` statically,
 * so all mappings stay client-only and no arena identifier enters battle data.
 */
import { ImageSourcePropType } from 'react-native';
import { UiArt } from './UiArt';
import type { ArenaPresentation } from '@/types/arena';

/**
 * Curated on-brand accent palette (electric, cinematic — mirrors the BRAND
 * palette in `scripts/generate-assets.mjs`). Kept vivid so every entry stays AA
 * as a graphic accent over the dark poster scrim.
 */
export const THEME_ACCENTS = [
  '#8B5CF6', // electric purple (brand)
  '#D946EF', // magenta (brand)
  '#22D3EE', // cyan (brand)
  '#F59E0B', // amber
  '#10B981', // emerald
  '#F43F5E', // rose
  '#6366F1', // indigo
  '#14B8A6', // teal
] as const;

/** Bundled mood packs, picked deterministically per free-text theme. */
export const ARENA_PRESENTATIONS: readonly ArenaPresentation[] = [
  {
    id: 'neon-nexus',
    backdrop: require('../assets/images/arenas/neon-nexus.jpg'),
    poster: require('../assets/images/arenas/neon-nexus.jpg'),
    accent: '#22D3EE',
    ambientLoop: require('../assets/audio/battle/neon-nexus.wav'),
  },
  {
    id: 'storm-citadel',
    backdrop: require('../assets/images/arenas/storm-citadel.jpg'),
    poster: require('../assets/images/arenas/storm-citadel.jpg'),
    accent: '#6366F1',
    ambientLoop: require('../assets/audio/battle/storm-citadel.wav'),
  },
  {
    id: 'ember-forge',
    backdrop: require('../assets/images/arenas/ember-forge.jpg'),
    poster: require('../assets/images/arenas/ember-forge.jpg'),
    accent: '#F59E0B',
    ambientLoop: require('../assets/audio/battle/ember-forge.wav'),
  },
  {
    id: 'astral-temple',
    backdrop: require('../assets/images/arenas/astral-temple.jpg'),
    poster: require('../assets/images/arenas/astral-temple.jpg'),
    accent: '#D946EF',
    ambientLoop: require('../assets/audio/battle/astral-temple.wav'),
  },
  {
    id: 'verdant-reactor',
    backdrop: require('../assets/images/arenas/verdant-reactor.jpg'),
    poster: require('../assets/images/arenas/verdant-reactor.jpg'),
    accent: '#10B981',
    ambientLoop: require('../assets/audio/battle/verdant-reactor.wav'),
  },
  {
    id: 'frozen-void',
    backdrop: require('../assets/images/arenas/frozen-void.jpg'),
    poster: require('../assets/images/arenas/frozen-void.jpg'),
    accent: '#38BDF8',
    ambientLoop: require('../assets/audio/battle/frozen-void.wav'),
  },
] as const;

/**
 * Stable 32-bit FNV-1a hash so the same theme text always maps to the same
 * look across sessions and devices.
 */
function hashTheme(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic on-brand accent color for a theme (stable, never null). */
export function accentForTheme(themeText?: string | null): string {
  return presentationForTheme(themeText).accent;
}

/** Deterministic bundled poster for a theme; falls back to the base poster. */
export function posterForTheme(themeText?: string | null): ImageSourcePropType {
  if (!themeText) return UiArt.themePoster;
  return presentationForTheme(themeText).poster;
}

/** Complete deterministic presentation selected from the battle's free text. */
export function presentationForTheme(
  themeText?: string | null,
): ArenaPresentation {
  if (!themeText) return ARENA_PRESENTATIONS[0];
  return ARENA_PRESENTATIONS[hashTheme(themeText) % ARENA_PRESENTATIONS.length];
}
