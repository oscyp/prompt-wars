/**
 * Per-theme visual variety for the daily-theme hero surfaces.
 *
 * Daily themes are free-text `daily_themes` rows (one per date), not a fixed
 * catalog, so we can't bundle one poster per theme. Instead we derive a
 * deterministic, on-brand accent color + poster variant from the theme text so
 * different days read differently — with zero runtime generation
 * (docs/DESIGN_LANGUAGE.md principle 6).
 *
 * `posterForTheme` resolves to the single bundled `UiArt.themePoster` today.
 * Once mood variants are generated (`node scripts/generate-assets.mjs --only ui`
 * → `assets/images/ui/theme-poster-NN.jpg`) add their `require`s to
 * `THEME_POSTERS` and per-theme art variety turns on with no caller changes.
 * Metro resolves `require` statically, so only files that actually exist may be
 * listed here.
 */
import { ImageSourcePropType } from 'react-native';
import { UiArt } from './UiArt';

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

/**
 * Bundled daily-theme poster variants, picked deterministically per theme.
 * Only the base poster ships today; append generated `theme-poster-NN.jpg`
 * requires here to enable art variety (see file header).
 */
const THEME_POSTERS: ImageSourcePropType[] = [UiArt.themePoster];

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
  if (!themeText) return THEME_ACCENTS[0];
  return THEME_ACCENTS[hashTheme(themeText) % THEME_ACCENTS.length];
}

/** Deterministic bundled poster for a theme; falls back to the base poster. */
export function posterForTheme(themeText?: string | null): ImageSourcePropType {
  if (!themeText || THEME_POSTERS.length === 0) return UiArt.themePoster;
  return THEME_POSTERS[hashTheme(themeText) % THEME_POSTERS.length];
}
