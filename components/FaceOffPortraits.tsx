import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Image,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { hapticImpact } from '@/utils/haptics';
import PortraitPreview from './PortraitPreview';
import StatBar from './StatBar';
import HPBar from './HPBar';
import { StatBlock } from '@/types/battle';

export interface FaceOffPlayer {
  characterId: string;
  displayName: string;
  archetype: string;
  battleCry?: string | null;
  signatureColor: string;
  portraitUrl?: string | null;
  stats: StatBlock;
  hp: number;
  hpMax: number;
}

export interface FaceOffPortraitsProps {
  playerOne: FaceOffPlayer;
  playerTwo: FaceOffPlayer;
  theme?: string | null;
  onAdvance: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
  actionsDisabled?: boolean;
  continueDelayMs?: number;
}

/**
 * Split-screen pre-battle face-off with stats, HP, theme reveal, and a
 * user-paced action footer. Respects Reduce Motion (skips theme animation).
 */
export default function FaceOffPortraits({
  playerOne,
  playerTwo,
  theme,
  onAdvance,
  onLeave,
  leaveLabel = 'Leave Battle',
  actionsDisabled = false,
  continueDelayMs = 2000,
}: FaceOffPortraitsProps) {
  const colors = useThemedColors();
  const reducedMotion = useReducedMotion();
  const [canContinue, setCanContinue] = useState(continueDelayMs <= 0);
  const themeOpacity = useRef(new Animated.Value(0)).current;
  const themeScale = useRef(new Animated.Value(0.9)).current;
  const vsScale = useRef(new Animated.Value(0.6)).current;
  const leftSlide = useRef(new Animated.Value(-240)).current;
  const rightSlide = useRef(new Animated.Value(240)).current;
  const advancedRef = useRef(false);
  const clashPlayedRef = useRef(false);

  // Clash choreography: the two cards slide in from opposite edges, the VS
  // pops with a haptic hit when they land, then the theme banner reveals.
  // Honors Reduce Motion (OS setting OR the in-app toggle): static/instant.
  useEffect(() => {
    if (clashPlayedRef.current) return;
    clashPlayedRef.current = true;

    if (reducedMotion) {
      themeOpacity.setValue(1);
      themeScale.setValue(1);
      vsScale.setValue(1);
      leftSlide.setValue(0);
      rightSlide.setValue(0);
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
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(themeScale, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [reducedMotion, themeOpacity, themeScale, vsScale, leftSlide, rightSlide]);

  useEffect(() => {
    if (continueDelayMs <= 0) {
      setCanContinue(true);
      return;
    }

    setCanContinue(false);
    const timer = setTimeout(() => setCanContinue(true), continueDelayMs);
    return () => clearTimeout(timer);
  }, [continueDelayMs]);

  const handleContinue = () => {
    if (!canContinue || actionsDisabled || advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
        accessibilityLabel={`Theme: ${theme ?? 'open battle'}`}
      >
        <Text style={styles.themeLabel}>THEME</Text>
        <Text style={styles.themeText} numberOfLines={2}>
          {theme ?? 'Open Battle'}
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
          accessibilityLabel="Continue to prompt entry"
        >
          <Text
            style={[
              styles.continueText,
              { color: canContinue ? '#FFFFFF' : colors.textSecondary },
            ]}
          >
            {canContinue ? 'Continue' : 'Revealing Matchup'}
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
          >
            <Text style={[styles.leaveText, { color: colors.textSecondary }]}>
              {leaveLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
          <PortraitPreview
            uri={player.portraitUrl}
            size={120}
            accessibilityLabel={`${player.displayName} portrait`}
          />
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
      <Text
        style={[styles.name, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {player.displayName}
      </Text>
      <View
        style={[
          styles.archetypeBadge,
          { backgroundColor: player.signatureColor },
        ]}
      >
        <Text
          style={styles.archetypeText}
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
        <StatBar
          label="STR"
          value={player.stats.strength}
          color={colors.attack}
        />
        <StatBar
          label="STM"
          value={player.stats.stamina}
          color={colors.success}
        />
        <StatBar
          label="AGI"
          value={player.stats.agility}
          color={colors.defense}
        />
        <StatBar
          label="FOC"
          value={player.stats.focus}
          color={colors.finisher}
        />
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    letterSpacing: 1,
    opacity: 0.85,
  },
  themeText: {
    color: '#FFFFFF',
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
