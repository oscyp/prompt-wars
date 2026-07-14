import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';

export interface VersusStripPlayer {
  name: string;
  archetype: string;
  signatureColor: string;
  portraitUrl?: string | null;
  /** Small caption above the name, e.g. "YOU" / "OPPONENT". */
  label?: string;
}

export interface VersusStripProps {
  left: VersusStripPlayer;
  right: VersusStripPlayer;
  /** Optional line under the VS, e.g. "Round 2". */
  subtitle?: string | null;
  /** Lock-in deadline (ISO). Renders a live countdown under the VS. */
  deadline?: string | null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Time up';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Compact you-vs-opponent header strip: signature-colored avatar rings with
 * names and a center VS. Keeps battle context visible on non-face-off screens
 * (prompt entry, waiting) without the full split layout.
 */
export default function VersusStrip({ left, right, subtitle, deadline }: VersusStripProps) {
  const colors = useThemedColors();

  // Live countdown to the lock-in deadline; 1s tick only while one is shown.
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const hasDeadline = Number.isFinite(deadlineMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasDeadline]);

  const remainingMs = hasDeadline ? deadlineMs - now : 0;
  const countdownColor = !hasDeadline
    ? colors.textSecondary
    : remainingMs <= 2 * 60_000
      ? colors.error
      : remainingMs <= 10 * 60_000
        ? colors.warning
        : colors.textSecondary;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${left.name} versus ${right.name}${subtitle ? `, ${subtitle}` : ''}${
        hasDeadline ? `, ${formatRemaining(remainingMs)} to lock in` : ''
      }`}
    >
      <Side player={left} align="left" />
      <View style={styles.center}>
        <Text style={[styles.vs, { color: colors.text }]}>VS</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {hasDeadline ? (
          <View style={styles.countdownRow}>
            <Ionicons name="time" size={10} color={countdownColor} />
            <Text style={[styles.countdown, { color: countdownColor }]} numberOfLines={1}>
              {formatRemaining(remainingMs)}
            </Text>
          </View>
        ) : null}
      </View>
      <Side player={right} align="right" />
    </View>
  );
}

function Side({ player, align }: { player: VersusStripPlayer; align: 'left' | 'right' }) {
  const colors = useThemedColors();
  const isRight = align === 'right';
  return (
    <View style={[styles.side, isRight && styles.sideRight]}>
      <View style={[styles.avatarRing, { borderColor: player.signatureColor }]}>
        <Image
          source={
            player.portraitUrl
              ? { uri: player.portraitUrl }
              : getArchetypeAvatar(player.archetype)
          }
          style={styles.avatar}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View style={[styles.nameCol, isRight && styles.nameColRight]}>
        {player.label ? (
          <Text
            style={[styles.label, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {player.label}
          </Text>
        ) : null}
        <Text
          style={[styles.name, { color: colors.text }, isRight && styles.textRight]}
          numberOfLines={1}
        >
          {player.name}
        </Text>
        <Text
          style={[styles.archetype, { color: player.signatureColor }, isRight && styles.textRight]}
          numberOfLines={1}
        >
          {player.archetype.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sideRight: {
    flexDirection: 'row-reverse',
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  nameCol: {
    flex: 1,
  },
  nameColRight: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  name: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  archetype: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  textRight: {
    textAlign: 'right',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  vs: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: Typography.weights.semibold,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  countdown: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
});
