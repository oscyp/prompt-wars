import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Image,
  ImageBackground,
  AccessibilityInfo,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { hapticImpact } from '@/utils/haptics';
import { inkFor } from '@/utils/contrast';
import PortraitPreview from './PortraitPreview';
import CosmeticTitle from './CosmeticTitle';
import CosmeticBadge from './CosmeticBadge';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import StatBar from './StatBar';
import HPBar from './HPBar';
import { StatBlock } from '@/types/battle';
import { presentationForTheme } from '@/constants/ThemeArt';

export interface FaceOffPlayer {
  characterId: string;
  displayName: string;
  archetype: string;
  battleCry?: string | null;
  signatureColor: string;
  portraitUrl?: string | null;
  /** Opens this fighter's full portrait. Omit to leave it non-interactive. */
  onPortraitPress?: () => void;
  /** Equipped cosmetics, from the battle payload. Absent for bots. */
  cosmetics?: EquippedCosmetics;
  /** Small caps caption above the name: "YOU" / "OPPONENT". */
  label?: string;
  stats: StatBlock;
  hp: number;
  hpMax: number;
}

export interface FaceOffPortraitsProps {
  playerOne: FaceOffPlayer;
  playerTwo: FaceOffPlayer;
  theme?: string | null;
  /** "Round 2" on a Bo3 face-off; omitted for single-round battles. */
  roundLabel?: string | null;
  /** Rendered above the theme banner (the series score on Bo3). */
  header?: React.ReactNode;
  onAdvance: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
  actionsDisabled?: boolean;
  /**
   * How long Continue stays gated while the clash plays. Defaults to the
   * reveal duration plus a beat, and to zero under Reduce Motion, where there
   * is no clash to wait for.
   */
  continueDelayMs?: number;
}

/** The four stat rows: what the screen shows and what the screen reader says. */
export const FACE_OFF_STATS: readonly {
  key: keyof StatBlock;
  abbreviation: string;
  name: string;
}[] = [
  { key: 'strength', abbreviation: 'STR', name: 'Strength' },
  { key: 'stamina', abbreviation: 'STA', name: 'Stamina' },
  { key: 'agility', abbreviation: 'AGI', name: 'Agility' },
  { key: 'focus', abbreviation: 'FOC', name: 'Focus' },
];

export const REVEALING_LABEL = 'Revealing matchup…';
export const CONTINUE_READY_ANNOUNCEMENT =
  'Matchup revealed. You can continue.';

/**
 * Split-screen pre-battle face-off with stats, HP, theme reveal, and a
 * user-paced action footer. Respects Reduce Motion (skips theme animation).
 */
export default function FaceOffPortraits({
  playerOne,
  playerTwo,
  theme,
  roundLabel,
  header,
  onAdvance,
  onLeave,
  leaveLabel = 'Leave Battle',
  actionsDisabled = false,
  continueDelayMs,
}: FaceOffPortraitsProps) {
  const colors = useThemedColors();
  const reducedMotion = useReducedMotion();
  const gateMs =
    continueDelayMs ?? (reducedMotion ? 0 : Motion.durations.reveal + 300);
  const [canContinue, setCanContinue] = useState(gateMs <= 0);
  const themeOpacity = useRef(new Animated.Value(0)).current;
  const themeScale = useRef(new Animated.Value(0.9)).current;
  const vsScale = useRef(new Animated.Value(0.6)).current;
  const leftSlide = useRef(new Animated.Value(-240)).current;
  const rightSlide = useRef(new Animated.Value(240)).current;
  const advancedRef = useRef(false);
  const clashPlayedRef = useRef(false);

  // Clash choreography: the two cards slide in from opposite edges, the VS
  // pops with a haptic hit when they land, then the theme banner reveals.
  // Honors Reduce Motion (OS setting OR the in-app toggle): static/instant,
  // but the haptic still lands -- it is feedback, not motion.
  useEffect(() => {
    if (clashPlayedRef.current) return;
    clashPlayedRef.current = true;

    if (reducedMotion) {
      themeOpacity.setValue(1);
      themeScale.setValue(1);
      vsScale.setValue(1);
      leftSlide.setValue(0);
      rightSlide.setValue(0);
      hapticImpact();
      return;
    }

    Animated.parallel([
      Animated.spring(leftSlide, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.spring(rightSlide, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start(() => {
      hapticImpact();
      Animated.parallel([
        Animated.spring(vsScale, {
          toValue: 1,
          friction: 5,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(themeOpacity, {
          toValue: 1,
          duration: Motion.durations.reveal,
          useNativeDriver: true,
        }),
        Animated.spring(themeScale, {
          toValue: 1,
          ...Motion.spring,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [reducedMotion, themeOpacity, themeScale, vsScale, leftSlide, rightSlide]);

  useEffect(() => {
    if (gateMs <= 0) {
      setCanContinue(true);
      return;
    }

    setCanContinue(false);
    const timer = setTimeout(() => setCanContinue(true), gateMs);
    return () => clearTimeout(timer);
  }, [gateMs]);

  // The gate lifting is the one state change on this screen a screen-reader
  // user cannot see coming; say it once.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!canContinue || announcedRef.current) return;
    announcedRef.current = true;
    AccessibilityInfo.announceForAccessibility(CONTINUE_READY_ANNOUNCEMENT);
  }, [canContinue]);

  const handleContinue = () => {
    if (!canContinue || actionsDisabled || advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  };

  const themeText = theme ?? 'No theme set';
  const bannerLabel = roundLabel
    ? `${roundLabel.toUpperCase()} · THEME`
    : 'THEME';
  const bannerA11y = roundLabel
    ? `${roundLabel}. Theme: ${themeText}`
    : `Theme: ${themeText}`;

  return (
    <ImageBackground
      source={presentationForTheme(theme).backdrop}
      style={[styles.root, { backgroundColor: colors.background }]}
      resizeMode="cover"
    >
      <View style={styles.backdropScrim} />
      {header}

      {/* Full-width theme banner: the theme is the shared constraint both
          players write under, so it gets the full line instead of being
          squeezed (and truncated) inside the narrow VS column. */}
      <Animated.View
        style={[
          styles.themeBanner,
          {
            backgroundColor: colors.primary,
            opacity: themeOpacity,
            transform: [{ scale: themeScale }],
          },
        ]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={bannerA11y}
      >
        <Text style={[styles.themeLabel, { color: inkFor(colors.primary) }]}>
          {bannerLabel}
        </Text>
        <Text
          style={[styles.themeText, { color: inkFor(colors.primary) }]}
          numberOfLines={2}
        >
          {themeText}
        </Text>
      </Animated.View>

      <View style={styles.split}>
        <Animated.View
          style={[styles.sideWrap, { transform: [{ translateX: leftSlide }] }]}
        >
          <PlayerSide player={playerOne} side="left" />
        </Animated.View>
        <View style={styles.versus}>
          <Animated.Text
            style={[
              styles.vs,
              { color: colors.text, transform: [{ scale: vsScale }] },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            VS
          </Animated.Text>
        </View>
        <Animated.View
          style={[styles.sideWrap, { transform: [{ translateX: rightSlide }] }]}
        >
          <PlayerSide player={playerTwo} side="right" />
        </Animated.View>
      </View>

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Pressable
          style={[
            styles.continueButton,
            {
              backgroundColor: canContinue
                ? colors.primary
                : colors.backgroundTertiary,
            },
          ]}
          onPress={handleContinue}
          disabled={!canContinue || actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel="Continue to move select"
          accessibilityState={{ disabled: !canContinue || actionsDisabled }}
        >
          <Text
            style={[
              styles.continueText,
              {
                color: canContinue
                  ? inkFor(colors.primary)
                  : colors.textSecondary,
              },
            ]}
          >
            {canContinue ? 'Continue' : REVEALING_LABEL}
          </Text>
        </Pressable>

        {onLeave ? (
          <Pressable
            style={[
              styles.leaveButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            onPress={onLeave}
            disabled={actionsDisabled}
            accessibilityRole="button"
            accessibilityLabel={leaveLabel}
            accessibilityState={{ disabled: actionsDisabled }}
          >
            <Text style={[styles.leaveText, { color: colors.textSecondary }]}>
              {leaveLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ImageBackground>
  );
}

function PlayerSide({
  player,
  side,
}: {
  player: FaceOffPlayer;
  side: 'left' | 'right';
}) {
  const colors = useThemedColors();
  return (
    <View
      style={[
        styles.sideCol,
        {
          borderColor: player.signatureColor,
          backgroundColor: colors.card,
        },
      ]}
    >
      <View style={styles.portraitWrap}>
        {player.portraitUrl ? (
          <Pressable
            onPress={player.onPortraitPress}
            disabled={!player.onPortraitPress}
            accessibilityRole={player.onPortraitPress ? 'button' : 'image'}
            accessibilityLabel={
              player.onPortraitPress
                ? `View ${player.displayName}'s portrait`
                : `${player.displayName} portrait`
            }
            style={({ pressed }) => ({
              opacity: pressed && player.onPortraitPress ? 0.7 : 1,
            })}
          >
            <PortraitPreview
              uri={player.portraitUrl}
              size={120}
              accentColor={player.signatureColor}
              frame={player.cosmetics?.frame}
              avatarEffect={player.cosmetics?.avatarEffect}
              // The Pressable above owns the label now; a nested labelled node
              // would be announced twice.
              accessibilityLabel={undefined}
            />
          </Pressable>
        ) : (
          <View
            style={[
              styles.portraitFallback,
              { borderColor: player.signatureColor },
            ]}
          >
            <Image
              source={getArchetypeAvatar(player.archetype)}
              style={styles.portraitImage}
              resizeMode="cover"
              accessibilityLabel={`${player.displayName} — ${player.archetype} avatar`}
            />
          </View>
        )}
      </View>
      {player.label ? (
        <Text
          style={[styles.sideLabel, { color: colors.textTertiary }]}
          numberOfLines={1}
        >
          {player.label}
        </Text>
      ) : null}
      <View style={styles.nameRow}>
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {player.displayName}
        </Text>
        <CosmeticBadge badge={player.cosmetics?.badge} size={14} />
      </View>
      <CosmeticTitle title={player.cosmetics?.title} />
      <View
        style={[
          styles.archetypeBadge,
          { backgroundColor: player.signatureColor },
        ]}
      >
        <Text
          style={[
            styles.archetypeText,
            { color: inkFor(player.signatureColor) },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {player.archetype.toUpperCase()}
        </Text>
      </View>
      {/* Fixed-height slot keeps both columns aligned whether or not a
          battle cry exists. */}
      <Text
        style={[styles.battleCry, { color: colors.textSecondary }]}
        numberOfLines={2}
      >
        {player.battleCry ? `“${player.battleCry}”` : ' '}
      </Text>
      <View style={styles.statsBlock}>
        {FACE_OFF_STATS.map((stat) => {
          const value = player.stats[stat.key];
          const clamped = Math.max(0, Math.min(value, 10));
          return (
            // StatBar labels itself with whatever it prints, so the
            // abbreviation would be read aloud as "S T R". This wrapper owns
            // the accessible node and says the full word instead.
            <View
              key={stat.key}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${stat.name}: ${clamped} out of 10`}
              accessibilityValue={{ min: 0, max: 10, now: clamped }}
            >
              <StatBar
                label={stat.abbreviation}
                value={value}
                color={STAT_COLOR[stat.key](colors)}
              />
            </View>
          );
        })}
      </View>
      <HPBar
        current={player.hp}
        max={player.hpMax}
        side={side}
        playerName={player.displayName}
        showName={false}
        compact
      />
    </View>
  );
}

type ThemeColors = ReturnType<typeof useThemedColors>;
const STAT_COLOR: Record<keyof StatBlock, (c: ThemeColors) => string> = {
  strength: (c) => c.attack,
  stamina: (c) => c.success,
  agility: (c) => c.defense,
  focus: (c) => c.finisher,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  backdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,11,15,0.62)',
  },
  split: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  sideWrap: {
    flex: 1,
  },
  sideCol: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.md,
    alignItems: 'center',
  },
  portraitWrap: {
    marginBottom: Spacing.sm,
  },
  portraitFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portraitImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
    maxWidth: '100%',
  },
  archetypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
    maxWidth: '100%',
  },
  archetypeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  battleCry: {
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.sm,
    minHeight: 18,
  },
  statsBlock: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  versus: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeBanner: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  themeLabel: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 1,
    opacity: 0.85,
  },
  themeText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  vs: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  footer: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  continueButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  continueText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  leaveButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  leaveText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
