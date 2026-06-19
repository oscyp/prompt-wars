import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  Pressable,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
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
  const [canContinue, setCanContinue] = useState(continueDelayMs <= 0);
  const themeOpacity = useRef(new Animated.Value(0)).current;
  const themeScale = useRef(new Animated.Value(0.9)).current;
  const advancedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          themeOpacity.setValue(1);
          themeScale.setValue(1);
          return;
        }
        Animated.parallel([
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
      })
      .catch(() => {
        themeOpacity.setValue(1);
        themeScale.setValue(1);
      });
    return () => {
      cancelled = true;
    };
  }, [themeOpacity, themeScale]);

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
      <View style={styles.split}>
        <PlayerSide player={playerOne} side="left" />
        <View style={styles.versus}>
          <Animated.View
            style={[
              styles.themePill,
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
            <Text style={styles.themeText} numberOfLines={3}>
              {theme ?? 'Open Battle'}
            </Text>
          </Animated.View>
          <Text style={[styles.vs, { color: colors.text }]}>VS</Text>
        </View>
        <PlayerSide player={playerTwo} side="right" />
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
            size={140}
            accessibilityLabel={`${player.displayName} portrait`}
          />
        ) : (
          <View
            style={[
              styles.portraitFallback,
              { backgroundColor: player.signatureColor },
            ]}
          >
            <Text style={styles.portraitInitial}>
              {player.displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {player.displayName}
      </Text>
      <View
        style={[
          styles.archetypeBadge,
          { backgroundColor: player.signatureColor },
        ]}
      >
        <Text style={styles.archetypeText}>
          {player.archetype.toUpperCase()}
        </Text>
      </View>
      {player.battleCry ? (
        <Text
          style={[styles.battleCry, { color: colors.textSecondary }]}
          numberOfLines={3}
        >
          “{player.battleCry}”
        </Text>
      ) : null}
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
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitInitial: {
    fontSize: 56,
    color: '#FFFFFF',
    fontWeight: Typography.weights.bold,
  },
  name: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  archetypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
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
  },
  statsBlock: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  versus: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  themePill: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    maxWidth: 96,
  },
  themeLabel: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    letterSpacing: 1,
    opacity: 0.85,
  },
  themeText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
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
