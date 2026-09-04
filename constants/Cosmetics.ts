import type { Ionicons } from '@expo/vector-icons';

/**
 * How each cosmetic actually looks.
 *
 * The catalogue gives us a slug, a name and a rarity, but `value` is NULL for
 * every frame, title, badge and avatar effect — so the database knows what a
 * player owns and nothing about how to draw it. That has to live here.
 *
 * Keyed on slug, and covered in both directions by `__tests__/cosmetics.test.ts`:
 * an active slug with no entry is a defect, and an entry for a slug that cannot
 * occur is dead weight. Without that guard an unmapped cosmetic renders as
 * nothing at all, which is how `lean_duelist` ended up in portrait prompts —
 * a missing lookup that failed quietly instead of loudly.
 */

export type CosmeticSlug =
  | 'plus_aura'
  | 'streak_badge'
  | 'crimson_color'
  | 'galaxy_color'
  | 'classic_frame'
  | 'veteran_frame'
  | 'gold_frame'
  | 'plus_frame'
  | 'neon_frame'
  | 'founders_frame'
  | 'noir_reveal'
  | 'inferno_reveal'
  | 'rookie_title'
  | 'champion_title'
  | 'plus_title'
  | 'royal_title';

/**
 * Portrait border. `colors` of length 1 is a solid edge; 2+ is a gradient
 * running top-left to bottom-right.
 */
export interface FramePresentation {
  kind: 'frame';
  colors: string[];
  width: number;
  /** Soft outer glow radius. 0 for none. */
  glow?: number;
}

export interface TitlePresentation {
  kind: 'title';
  /** Shown under the character name. Short — this sits in tight rows. */
  label: string;
  color: string;
}

export interface BadgePresentation {
  kind: 'badge';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
}

export interface AvatarEffectPresentation {
  kind: 'avatar_effect';
  /** Ring colour drawn outside the avatar's own border. */
  color: string;
  glow: number;
}

/** Signature colours a purchase unlocks in the Identity picker. */
export interface ColorPresentation {
  kind: 'color';
  hex: string;
  label: string;
}

/** Deferred: equippable, but nothing renders it yet. */
export interface RevealStylePresentation {
  kind: 'reveal_style';
  label: string;
}

export type CosmeticPresentation =
  | FramePresentation
  | TitlePresentation
  | BadgePresentation
  | AvatarEffectPresentation
  | ColorPresentation
  | RevealStylePresentation;

export const COSMETIC_PRESENTATION: Record<CosmeticSlug, CosmeticPresentation> =
  {
    // --- Frames -------------------------------------------------------------
    classic_frame: { kind: 'frame', colors: ['#8B8699'], width: 3 },
    veteran_frame: { kind: 'frame', colors: ['#B08D57'], width: 3 },
    gold_frame: {
      kind: 'frame',
      colors: ['#F5C542', '#B8860B'],
      width: 4,
      glow: 6,
    },
    plus_frame: {
      kind: 'frame',
      colors: ['#A78BFA', '#7C3AED'],
      width: 4,
      glow: 8,
    },
    neon_frame: {
      kind: 'frame',
      colors: ['#22D3EE', '#EC4899'],
      width: 4,
      glow: 10,
    },
    founders_frame: {
      kind: 'frame',
      colors: ['#F5C542', '#EC4899', '#7C3AED'],
      width: 5,
      glow: 12,
    },

    // --- Titles -------------------------------------------------------------
    rookie_title: { kind: 'title', label: 'Rookie', color: '#8B8699' },
    champion_title: { kind: 'title', label: 'Champion', color: '#F5C542' },
    plus_title: { kind: 'title', label: 'Plus One', color: '#A78BFA' },
    royal_title: { kind: 'title', label: 'Royal', color: '#C084FC' },

    // --- Badges -------------------------------------------------------------
    streak_badge: {
      kind: 'badge',
      icon: 'flame',
      color: '#F97316',
      label: 'On Fire',
    },

    // --- Avatar effects -----------------------------------------------------
    plus_aura: { kind: 'avatar_effect', color: '#A78BFA', glow: 10 },

    // --- Colours (unlock a signature-colour swatch) --------------------------
    crimson_color: { kind: 'color', hex: '#EF4444', label: 'Crimson' },
    galaxy_color: { kind: 'color', hex: '#7C3AED', label: 'Galaxy' },

    // --- Reveal styles (deferred — nothing renders these yet) ----------------
    noir_reveal: { kind: 'reveal_style', label: 'Noir' },
    inferno_reveal: { kind: 'reveal_style', label: 'Inferno' },
  };

/** Types that have a display surface. `reveal_style` deliberately does not. */
export const RENDERABLE_COSMETIC_TYPES = [
  'frame',
  'title',
  'badge',
  'avatar_effect',
  'color',
] as const;

export function presentationFor(
  slug: string | null | undefined,
): CosmeticPresentation | null {
  if (!slug) return null;
  return COSMETIC_PRESENTATION[slug as CosmeticSlug] ?? null;
}
