/**
 * Picking a readable ink for text drawn on an arbitrary accent colour.
 *
 * The battle screens draw labels on move-type colours and on a player's
 * signature colour. Both vary by theme and by player, so a hardcoded white
 * fails on the light pastels the dark palette uses (white on `#F87171` is
 * roughly 2.6:1). This chooses whichever of the two inks has the higher WCAG
 * contrast against the fill.
 */

import { Ink } from '@/constants/DesignTokens';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parses `#RGB`, `#RRGGBB` or `#RRGGBBAA`; returns null for anything else. */
export function parseHex(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** WCAG contrast ratio between two colours; null when either fails to parse. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The ink to draw on `fill`: near-black or white, whichever contrasts more.
 *
 * Unparsable input (an rgba string, a token name) falls back to white, which
 * is what every call site assumed before this helper existed.
 */
export function inkFor(fill: string): string {
  const onDark = contrastRatio(fill, Ink.onAccentDark);
  const onLight = contrastRatio(fill, Ink.onAccentLight);
  if (onDark === null || onLight === null) return Ink.onAccentLight;
  return onDark >= onLight ? Ink.onAccentDark : Ink.onAccentLight;
}
