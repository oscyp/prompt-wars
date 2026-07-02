/**
 * Bundled UI chrome illustrations ("Cinematic Arena" hero zones — see
 * docs/DESIGN_LANGUAGE.md).
 *
 * Art was generated once via `node scripts/generate-assets.mjs --only ui`
 * (Gemini Flash Image), dark cinematic, brand palette (purple/magenta/cyan on
 * near-black). Static app assets, safe to commit. Never generate UI art at
 * runtime — bundling keeps the "provider failures never block" invariant.
 *
 * Zoning rule: these belong in hero zones (welcome, matchmaking, mode select,
 * daily-theme poster) — never behind list/form content.
 */
import { ImageSourcePropType } from 'react-native';

export const UiArt = {
  /** Crossed-blades "versus" emblem — matchmaking hero, empty-state accent. */
  clash: require('@/assets/images/ui/clash.jpg') as ImageSourcePropType,
  /** 9:16 arena entrance — welcome/onboarding full-bleed backdrop. */
  welcomeHero:
    require('@/assets/images/ui/welcome-hero.jpg') as ImageSourcePropType,
  /** 9:16 dark empty arena — matchmaking/waiting backdrop (subtle). */
  arenaBackdrop:
    require('@/assets/images/ui/arena-backdrop.jpg') as ImageSourcePropType,
  /** 16:9 colliding energy waves — Home daily-theme poster card. */
  themePoster:
    require('@/assets/images/ui/theme-poster.jpg') as ImageSourcePropType,
  /** 1:1 battle-mode tiles (mode select sheet + fallback screen). */
  modeRanked:
    require('@/assets/images/ui/mode-ranked.jpg') as ImageSourcePropType,
  modeUnranked:
    require('@/assets/images/ui/mode-unranked.jpg') as ImageSourcePropType,
  modeBot: require('@/assets/images/ui/mode-bot.jpg') as ImageSourcePropType,
} as const;
