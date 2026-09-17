import React from 'react';
import FighterCard, {
  type FighterCardProps,
} from '@/components/game/FighterCard';

export interface FighterHeroProps extends FighterCardProps {
  onPress: () => void;
}
export const HERO_MIN_HEIGHT = 320;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Joined September 2026", or null when the timestamp is missing or bad. */
export function joinedLabel(
  createdAt: string | null | undefined,
): string | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function FighterHero(props: FighterHeroProps) {
  return <FighterCard {...props} variant="hero" />;
}
