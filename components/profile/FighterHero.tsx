import React, { useId, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  BorderRadius,
  Gradients,
  Ink,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { STAT_KEYS, STAT_MAX, STAT_META } from '@/utils/statAllocation';
import { fighterCardCopy } from '@/utils/profileView';
import type { StatBlock } from '@/types/battle';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import CosmeticTitle from '../CosmeticTitle';
import CosmeticBadge from '../CosmeticBadge';

export interface FighterHeroProps {
  name: string | null | undefined;
  archetype: string | null | undefined;
  battleCry: string | null | undefined;
  itemName: string | null | undefined;
  /**
   * Signed full-body render. The bundled archetype illustration stands in when
   * this is null or fails to load, so the poster never shows a blank.
   */
  renderUri: string | null;
  /** Resolved signature colour (hex). Scrim base and stat-bar fill. */
  signatureColor: string;
  stats: StatBlock | null;
  cosmetics: EquippedCosmetics;
  onPress: () => void;
}

/** The poster's floor; the caption can push it taller under large type. */
export const HERO_MIN_HEIGHT = 320;
/** Room kept above the caption so the fighter's face survives the scrim. */
const IMAGE_HEADROOM = 120;
/** How much of the poster the scrim covers, bottom-anchored. */
const SCRIM_RATIO = 0.8;

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

/**
 * The player's fighter card: the full-body render as a poster, the lower part
 * scrimmed in the signature colour and carrying title, name, archetype, item,
 * battle cry and the four stats. One button — it opens Edit character.
 *
 * Text here is white on a fixed-dark scrim (design language §3/§7), not the
 * themed ink, because the scrim does not change with the theme.
 */
export default function FighterHero({
  name,
  archetype,
  battleCry,
  itemName,
  renderUri,
  signatureColor,
  stats,
  cosmetics,
  onPress,
}: FighterHeroProps) {
  const copy = fighterCardCopy({ name, archetype, battleCry, itemName });
  const [failed, setFailed] = useState(false);
  const source =
    renderUri && !failed ? { uri: renderUri } : getArchetypeAvatar(archetype);

  return (
    <View style={styles.root}>
      <Pressable
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          pressed ? styles.pressed : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={copy.accessibilityLabel}
      >
        <Image
          key={renderUri && !failed ? renderUri : 'archetype'}
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityElementsHidden
          importantForAccessibility="no"
          testID="fighter-hero-image"
        />
        <View
          style={[styles.scrimZone, { height: `${SCRIM_RATIO * 100}%` }]}
          pointerEvents="none"
        >
          <CaptionScrim base={signatureColor} />
        </View>
      </Pressable>

      {/* Visual caption. Touches fall through to the button underneath; the
          text is already in the button's label so it is hidden from the
          accessibility tree, while the stat bars stay focusable. */}
      <View style={styles.caption} pointerEvents="none">
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <CosmeticTitle title={cosmetics.title} style={styles.title} />
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>
              {copy.name}
            </Text>
            <CosmeticBadge badge={cosmetics.badge} size={20} />
          </View>
          {copy.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {copy.subtitle}
            </Text>
          ) : null}
          {copy.battleCry ? (
            <Text style={styles.cry} numberOfLines={2}>
              {copy.battleCry}
            </Text>
          ) : null}
        </View>
        {stats ? (
          <View style={styles.statsGrid}>
            {STAT_KEYS.map((key) => (
              <CompactStatBar
                key={key}
                label={STAT_META[key].label}
                abbreviation={STAT_META[key].abbreviation}
                value={stats[key]}
                color={signatureColor}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A stat bar sized for the poster caption. `StatBar` paints its labels in the
 * themed text colour, which is unreadable on the fixed-dark scrim under the
 * light theme, so this draws the same thing in white with the same semantics:
 * one progressbar whose label carries the full stat name and value.
 */
function CompactStatBar({
  label,
  abbreviation,
  value,
  color,
}: {
  label: string;
  abbreviation: string;
  value: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(Math.round(value), STAT_MAX));
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${clamped} of ${STAT_MAX}`}
      accessibilityValue={{ min: 0, max: STAT_MAX, now: clamped }}
    >
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>{abbreviation}</Text>
        <Text style={[styles.statValue, NumericFontVariant]}>{clamped}</Text>
      </View>
      <View style={styles.statTrack}>
        <View
          style={[
            styles.statFill,
            {
              width: `${(clamped / STAT_MAX) * 100}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Same stops as the reveal poster's caption scrim (RevealWinnerBeat): fades in
 * from transparent so the fighter keeps its colours above, and ends on the
 * poster token's near-black terminal stop so white text keeps AA below.
 */
function CaptionScrim({ base }: { base: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = `heroScrim-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const poster = Gradients.poster(base);
  const terminal = poster[poster.length - 1];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={base} stopOpacity={0} />
              <Stop offset="22%" stopColor={base} stopOpacity={0.6} />
              <Stop
                offset="55%"
                stopColor={terminal.color}
                stopOpacity={0.88}
              />
              <Stop
                offset="100%"
                stopColor={terminal.color}
                stopOpacity={terminal.opacity}
              />
            </SvgLinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: HERO_MIN_HEIGHT,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    // Shows through until the image decodes; the same near-black the scrim
    // ends on, so there is never a light flash under the caption.
    backgroundColor: Ink.onAccentDark,
  },
  pressed: {
    opacity: 0.9,
  },
  scrimZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  caption: {
    paddingTop: IMAGE_HEADROOM,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  title: {
    color: Ink.onAccentLight,
    marginBottom: Spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  name: {
    flexShrink: 1,
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.display,
    fontWeight: Typography.weights.bold,
    lineHeight: Typography.sizes.display * 1.1,
  },
  subtitle: {
    color: Ink.onAccentLight,
    opacity: 0.9,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  cry: {
    color: Ink.onAccentLight,
    opacity: 0.9,
    fontSize: Typography.sizes.base,
    fontStyle: 'italic',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  stat: {
    width: '48%',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  statLabel: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  statValue: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  statTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  statFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
