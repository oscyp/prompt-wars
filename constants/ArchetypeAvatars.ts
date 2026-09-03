/**
 * Bundled archetype avatar illustrations.
 *
 * Used as the *designed* fallback whenever a character has no generated portrait
 * photo to show — a skipped portrait, a bot opponent, or a portrait that hasn't
 * resolved yet. Keyed by archetype; anything unknown falls back to a neutral
 * default so a fighter is NEVER rendered as a bare colored circle + initial.
 *
 * Art was generated once (Gemini 3 Pro Image / "Nano Banana Pro"), 512x512 JPEG,
 * signature-color themed on a dark cinematic background to match the battle flow.
 * These are static app assets and safe to commit.
 */
import { Image } from 'react-native';

export type ArchetypeAvatarKey =
  | 'strategist'
  | 'trickster'
  | 'titan'
  | 'mystic'
  | 'engineer'
  | 'default';

/** archetype -> bundled illustration (the number returned by `require()`). */
export const ARCHETYPE_AVATARS: Record<ArchetypeAvatarKey, number> = {
  strategist: require('@/assets/images/avatars/strategist.jpg'),
  trickster: require('@/assets/images/avatars/trickster.jpg'),
  titan: require('@/assets/images/avatars/titan.jpg'),
  mystic: require('@/assets/images/avatars/mystic.jpg'),
  engineer: require('@/assets/images/avatars/engineer.jpg'),
  default: require('@/assets/images/avatars/default.jpg'),
};

/**
 * Resolve a bundled avatar illustration for an archetype string. Unknown, empty,
 * or bot-only archetypes return the neutral default (never null), guaranteeing a
 * character always has a designed illustration to render.
 */
export function getArchetypeAvatar(archetype?: string | null): number {
  const key = (archetype ?? '').trim().toLowerCase();
  return (
    ARCHETYPE_AVATARS[key as ArchetypeAvatarKey] ?? ARCHETYPE_AVATARS.default
  );
}

/**
 * The bundled illustration as a URI, for surfaces that take a `uri` rather than
 * an asset (the full-screen portrait viewer). Null only if the asset registry
 * cannot resolve the bundle, which does not happen in a built app.
 */
export function archetypeIllustrationUri(
  archetype?: string | null,
): string | null {
  const source = Image.resolveAssetSource(getArchetypeAvatar(archetype));
  return source?.uri ?? null;
}
