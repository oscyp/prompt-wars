import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { ArchetypeId } from '@/constants/Archetypes';
import ArchetypeBadge from './ArchetypeBadge';

interface VersusBannerProps {
  leftLabel: string;
  rightLabel: string;
  leftArchetype?: ArchetypeId;
  rightArchetype?: ArchetypeId;
  leftSubtitle?: string;
  rightSubtitle?: string;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function VersusBanner({
  leftLabel,
  rightLabel,
  leftArchetype,
  rightArchetype,
  leftSubtitle,
  rightSubtitle,
  animated = false,
  style,
}: VersusBannerProps) {
  const colors = useThemedColors();

  const Side = ({
    label,
    subtitle,
    archetype,
    align,
  }: {
    label: string;
    subtitle?: string;
    archetype?: ArchetypeId;
    align: 'left' | 'right';
  }) => (
    <View style={[styles.side, align === 'right' && { alignItems: 'flex-end' }]}>
      {archetype && (
        <ArchetypeBadge archetypeId={archetype} size="lg" animated={animated} />
      )}
      <Text
        numberOfLines={1}
        style={{
          color: colors.text,
          fontFamily: Typography.fonts.display,
          fontSize: Typography.sizes.lg,
          letterSpacing: Typography.letterSpacing.wide,
          marginTop: Spacing.sm,
          textAlign: align,
        }}
      >
        {label}
      </Text>
      {subtitle && (
        <Text
          numberOfLines={1}
          style={{
            color: colors.textTertiary,
            fontFamily: Typography.fonts.bodyMedium,
            fontSize: Typography.sizes.xs,
            letterSpacing: Typography.letterSpacing.wide,
            textTransform: 'uppercase',
            textAlign: align,
            marginTop: Spacing.xs,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.row, style]}>
      <Side
        label={leftLabel}
        subtitle={leftSubtitle}
        archetype={leftArchetype}
        align="left"
      />
      <View style={styles.center}>
        <Text
          style={{
            color: colors.accent,
            fontFamily: Typography.fonts.displayBlack,
            fontSize: Typography.sizes.display2,
            letterSpacing: Typography.letterSpacing.widest,
            textShadowColor: colors.glowAccent,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 12,
          }}
        >
          VS
        </Text>
      </View>
      <Side
        label={rightLabel}
        subtitle={rightSubtitle}
        archetype={rightArchetype}
        align="right"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  side: {
    flex: 1,
    alignItems: 'flex-start',
  },
  center: {
    paddingHorizontal: Spacing.sm,
  },
});
