import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { GameText as Text } from '@/components/game';
import React, { useEffect, useRef, useState, useId } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Image,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';

import { useThemedColors } from '@/hooks/useThemedColors';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import CosmeticTitle from './CosmeticTitle';
import CosmeticFrame from './CosmeticFrame';
import HPBar from './HPBar';
import SeriesScoreIndicator, {
  type SeriesScoreIndicatorProps,
  orientSeriesScore,
} from './SeriesScoreIndicator';
import Svg, {
  Defs,
  ClipPath,
  Path,
  LinearGradient,
  Stop,
  Image as SvgImage,
} from 'react-native-svg';
import { hapticWarning } from '@/utils/haptics';
import { formatRemaining } from '@/utils/battleCopy';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';

// Timer escalation thresholds, based purely on time remaining (never on the
// original window length): warning ink under 10 minutes, critical color +
// a one-time haptic under 2 minutes.
const WARNING_MS = 10 * 60_000;
const CRITICAL_MS = 2 * 60_000;

export interface VersusStripPlayer {
  name: string;
  archetype: string;
  signatureColor: string;
  portraitUrl?: string | null;
  /** Opens the full portrait. Omit to leave the avatar non-interactive. */
  onAvatarPress?: (opener: SheetFocusRef) => void;
  /** Small caption above the name, e.g. "YOU" / "OPPONENT". */
  label?: string;
  /** Equipped cosmetics, from the battle payload. */
  cosmetics?: EquippedCosmetics;
  hp?: number;
  hpMax?: number;
}

export interface VersusStripProps {
  left: VersusStripPlayer;
  right: VersusStripPlayer;
  /** Optional line under the VS, e.g. "Round 2". */
  subtitle?: string | null;
  series?: SeriesScoreIndicatorProps;
  compact?: boolean;
  /** Lock-in deadline (ISO). Renders a live countdown under the VS. */
  deadline?: string | null;
}

/** Re-exported for existing importers; the clock's words live in battleCopy. */
export { formatRemaining };

/**
 * Compact you-vs-opponent header strip: signature-colored avatar rings with
 * names and a center VS. Keeps battle context visible on non-face-off screens
 * (prompt entry, waiting) without the full split layout.
 */
export default function VersusStrip({
  left,
  right,
  subtitle,
  deadline,
  series,
  compact = false,
}: VersusStripProps) {
  const colors = useThemedColors();
  const orientedScore = series
    ? orientSeriesScore(series.score, series.viewer ?? 'p1')
    : null;
  const presentationActive = useBattlePresentationActive();
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [wrappedIdentity, setWrappedIdentity] = useState<string | null>(null);
  // Before native measurement, allow for the caller's ordinary screen gutters.
  const availableWidth = measuredWidth ?? Math.max(0, width - Spacing.lg * 2);
  const stacked = availableWidth < 320 || fontScale > 1.35;
  // Explicit columns prevent intrinsic long-name measurements from widening a
  // plate beyond the container. Reserve the center and both four-point gaps.
  const sideWidth = stacked ? availableWidth : (availableWidth - 50) / 2;
  // Ordinary phones use the mirrored portrait/plate composition; narrow
  // containers and enlarged text reflow to preserve every identity word.
  const identityLayout = JSON.stringify([
    availableWidth,
    fontScale,
    left.name,
    right.name,
  ]);
  const inlinePortraits =
    availableWidth >= 330 &&
    fontScale <= 1.15 &&
    wrappedIdentity !== identityLayout;
  const reflowNames = () => setWrappedIdentity(identityLayout);

  // Live countdown to the lock-in deadline; 1s tick only while one is shown.
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const hasDeadline = Number.isFinite(deadlineMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasDeadline || !presentationActive) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasDeadline, presentationActive]);

  const remainingMs = hasDeadline ? deadlineMs - now : 0;
  const isCritical =
    hasDeadline && remainingMs > 0 && remainingMs <= CRITICAL_MS;
  const countdownColor = !hasDeadline
    ? colors.textSecondary
    : remainingMs <= CRITICAL_MS
      ? colors.error
      : remainingMs <= WARNING_MS
        ? colors.warning
        : colors.textSecondary;

  // One-time haptic when crossing into the critical band (not per tick).
  // Reset if the deadline itself changes (e.g. a new Bo3 round).
  const criticalHapticFired = useRef(false);
  useEffect(() => {
    criticalHapticFired.current = false;
  }, [deadline]);
  useEffect(() => {
    if (presentationActive && isCritical && !criticalHapticFired.current) {
      criticalHapticFired.current = true;
      hapticWarning();
    }
  }, [isCritical, presentationActive]);

  return (
    // No `accessible` on the wrapper any more. Flattening the strip into one
    // header node hid the avatars from screen readers by design -- fine when
    // they were decoration, wrong now that they are buttons, because the
    // flattening swallows child touchables on iOS. The header text moves onto
    // the centre column instead, so the summary survives and the avatars
    // become reachable.
    <View
      testID="battle-matchup"
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={[
        styles.wrap,
        stacked && { flexDirection: 'column', alignItems: 'stretch' },
      ]}
    >
      <Side
        player={left}
        align="left"
        inlinePortrait={inlinePortraits}
        width={sideWidth}
        onNameWrap={reflowNames}
        compact={compact}
      />
      <View
        style={[styles.center, !stacked && { width: 42 }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${left.name} versus ${right.name}${orientedScore ? `, series: you ${orientedScore.mine}, opponent ${orientedScore.theirs}` : ''}${subtitle ? `, ${subtitle}` : ''}${
          hasDeadline ? `, ${formatRemaining(remainingMs)} to lock in` : ''
        }`}
      >
        <View
          testID="battle-versus-diamond"
          style={[
            styles.diamond,
            {
              borderColor: colors.ornament,
              backgroundColor: colors.background,
              width: 42 * fontScale,
              height: 42 * fontScale,
            },
          ]}
        >
          <Text
            variant="display"
            style={[styles.vs, { color: colors.ornament }]}
          >
            VS
          </Text>
        </View>
        {series && <SeriesScoreIndicator {...series} compact />}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
        {hasDeadline ? (
          <View style={styles.countdownRow}>
            <GameSymbol name="time" size={10} color={countdownColor} />
            <Text style={[styles.countdown, { color: countdownColor }]}>
              {formatRemaining(remainingMs)}
            </Text>
          </View>
        ) : null}
      </View>
      <Side
        player={right}
        align="right"
        inlinePortrait={inlinePortraits}
        width={sideWidth}
        onNameWrap={reflowNames}
        compact={compact}
      />
    </View>
  );
}

function Side({
  player,
  align,
  inlinePortrait,
  width,
  onNameWrap,
  compact,
}: {
  compact: boolean;
  inlinePortrait: boolean;
  width: number;
  onNameWrap: () => void;
  player: VersusStripPlayer;
  align: 'left' | 'right';
}) {
  const avatarRef = React.useRef<View>(null);
  const colors = useThemedColors();
  const isRight = align === 'right';
  const [plateSize, setPlateSize] = useState({ width: 0, height: 0 });
  const plateId = `identity-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The inward point mirrors toward VS. Pixel coordinates keep the chamfers
  // crisp when long identities increase the plate height.
  const platePath = (inset: number) => {
    const x = inset,
      y = inset,
      w = plateSize.width - inset,
      h = plateSize.height - inset;
    const mid = plateSize.height / 2,
      cut = 9,
      point = 14;
    return isRight
      ? `M ${x + point} ${y} H ${w - cut} L ${w} ${y + cut} V ${h - cut} L ${w - cut} ${h} H ${x + point} L ${x} ${mid} Z`
      : `M ${x + cut} ${y} H ${w - point} L ${w} ${mid} L ${w - point} ${h} H ${x + cut} L ${x} ${h - cut} V ${y + cut} Z`;
  };
  return (
    <View
      testID={`battle-matchup-${align}`}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setPlateSize({ width, height });
      }}
      style={[styles.side, { width, flex: 0 }]}
    >
      <View
        testID={`battle-identity-plate-${align}`}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {plateSize.width > 0 && plateSize.height > 0 && (
          <Svg width={plateSize.width} height={plateSize.height}>
            <Defs>
              <LinearGradient id={plateId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#211D2B" />
                <Stop offset="1" stopColor="#0C101B" />
              </LinearGradient>
            </Defs>
            <Path
              d={platePath(1)}
              fill={`url(#${plateId})`}
              stroke={colors.ornament}
              strokeWidth={1.5}
            />
            <Path
              d={platePath(3.5)}
              fill="none"
              stroke={colors.ornamentMuted}
              strokeWidth={0.6}
            />
          </Svg>
        )}
      </View>
      {player.label ? (
        <Text
          style={[
            styles.label,
            { color: colors.textTertiary },
            isRight && styles.textRight,
          ]}
        >
          {player.label}
        </Text>
      ) : null}
      <View
        testID={`battle-matchup-body-${align}`}
        style={[
          styles.sideBody,
          inlinePortrait && isRight && styles.sideRight,
          !inlinePortrait && { flexDirection: 'column', alignItems: 'stretch' },
        ]}
      >
        {/* A bought frame outranks the signature colour on the ring: the colour
          is a default, the frame is a purchase. */}
        {!compact && (
          <Pressable
            ref={avatarRef}
            onPress={() => player.onAvatarPress?.(avatarRef)}
            disabled={!player.onAvatarPress}
            accessibilityRole={player.onAvatarPress ? 'button' : 'image'}
            accessibilityLabel={
              player.onAvatarPress
                ? `View ${player.name}'s portrait`
                : `${player.name}, ${player.archetype}`
            }
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={({ pressed }) => [
              {
                minWidth: 72,
                minHeight: 72,
                flexShrink: 0,
                alignSelf: inlinePortrait
                  ? 'center'
                  : isRight
                    ? 'flex-end'
                    : 'flex-start',
                opacity: pressed && player.onAvatarPress ? 0.7 : 1,
              },
            ]}
          >
            <BattlePortrait
              source={
                player.portraitUrl
                  ? { uri: player.portraitUrl }
                  : getArchetypeAvatar(player.archetype)
              }
              size={72}
              frame={player.cosmetics?.frame}
              accentColor={player.signatureColor}
            />
          </Pressable>
        )}
        <View
          style={[
            styles.nameCol,
            !inlinePortrait && { flex: 0, paddingHorizontal: 10 },
            isRight && styles.nameColRight,
            {
              paddingLeft: !inlinePortrait ? 10 : isRight ? 8 : 0,
              paddingRight: !inlinePortrait ? 10 : isRight ? 0 : 8,
            },
          ]}
        >
          <Text
            variant="fighter"
            onTextLayout={(event) => {
              if (inlinePortrait && event.nativeEvent.lines.length > 2)
                onNameWrap();
            }}
            style={[
              styles.name,
              { color: colors.text },
              isRight && styles.textRight,
            ]}
          >
            {player.name}
          </Text>
          <CosmeticTitle
            title={player.cosmetics?.title}
            style={isRight ? styles.textRight : undefined}
          />
          <Text
            variant="label"
            onTextLayout={(event) => {
              if (inlinePortrait && event.nativeEvent.lines.length > 1)
                onNameWrap();
            }}
            style={[
              styles.archetype,
              { color: colors.textSecondary },
              isRight && styles.textRight,
            ]}
          >
            {player.archetype.toUpperCase()}
          </Text>
        </View>
      </View>
      {player.hp != null && player.hpMax != null ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 4 }}>
          <HPBar
            current={player.hp}
            max={player.hpMax}
            side={align}
            playerName={player.name}
            showName={false}
            compact
          />
        </View>
      ) : null}
    </View>
  );
}

/** Equipped circular frames keep their native aperture: an intentional, data-driven
 * exception to the default chamfered portrait in the workspace reference. */
function BattlePortrait(props: React.ComponentProps<typeof CosmeticFrame>) {
  const id = `portrait-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (props.frame) return <CosmeticFrame {...props} />;
  const size = props.size;
  const path = `M 9 1 H ${size - 9} L ${size - 1} 9 V ${size - 9} L ${size - 9} ${size - 1} H 9 L 1 ${size - 9} V 9 Z`;
  return (
    <Svg
      testID="battle-chamfered-portrait"
      width={size}
      height={size}
      accessible={false}
    >
      <Defs>
        <ClipPath id={id}>
          <Path d={path} />
        </ClipPath>
      </Defs>
      <SvgImage
        href={Image.resolveAssetSource(props.source)}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${id})`}
      />
      <Path d={path} fill="none" stroke="#D6B476" strokeWidth={2} />
      <Path
        d={path}
        fill="none"
        stroke={props.accentColor}
        strokeWidth={0.8}
        transform={`translate(3 3) scale(${(size - 6) / size})`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
    gap: 4,
  },
  side: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    minHeight: 88,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  sideBody: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, gap: 5 },
  sideRight: {
    flexDirection: 'row-reverse',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
  },
  nameColRight: {
    alignItems: 'stretch',
  },
  label: {
    fontSize: 12,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: Typography.weights.bold,
  },
  archetype: {
    fontSize: 12,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  textRight: {
    textAlign: 'right',
  },
  center: {
    zIndex: 1,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    gap: 6,
  },
  diamond: {
    width: 42,
    height: 42,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  vs: {
    transform: [{ rotate: '-45deg' }],
    fontSize: 25,
    lineHeight: 30,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: Typography.weights.semibold,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  countdown: {
    // The lock-in clock was the smallest text on the screen; it is the one
    // number the player must be able to read at a glance.
    fontSize: 12,
    fontWeight: Typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
});
