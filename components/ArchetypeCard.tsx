import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius, Spacing, Typography } from '@/constants/DesignTokens';
import Card from './Card';
import ArchetypeBadge from './ArchetypeBadge';
import HapticPressable from './HapticPressable';

interface ArchetypeCardProps {
  archetypeId: ArchetypeId;
  selected?: boolean;
  onPress?: () => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full archetype card — used in the create-character carousel.
 * Renders sigil, name, trait, description, reward.
 */
export default function ArchetypeCard({
  archetypeId,
  selected = false,
  onPress,
  width,
  style,
}: ArchetypeCardProps) {
  const arch = ARCHETYPES[archetypeId];
  const colors = useThemedColors();

  return (
    <HapticPressable
      onPress={onPress ?? (() => {})}
      disabled={!onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={`Choose ${arch.name}: ${arch.description}`}
      accessibilityState={{ selected }}
      style={[width ? { width } : undefined, style]}
    >
      <Card
        variant={selected ? 'neon' : 'glass'}
        archetypeId={selected ? archetypeId : undefined}
        glow={selected}
        padding="lg"
        borderRadius="xxl"
      >
        <View style={styles.head}>
          <ArchetypeBadge
            archetypeId={archetypeId}
            size="lg"
            animated={selected}
          />
        </View>
        <Text
          style={{
            color: colors.text,
            fontFamily: Typography.fonts.display,
            fontSize: Typography.sizes.xxl,
            letterSpacing: Typography.letterSpacing.wide,
            textAlign: 'center',
            marginTop: Spacing.md,
          }}
        >
          {arch.shortName}
        </Text>
        <View
          style={[
            styles.traitPill,
            {
              backgroundColor: `${arch.color}22`,
              borderColor: arch.color,
            },
          ]}
        >
          <Text
            style={{
              color: arch.color,
              fontFamily: Typography.fonts.bodyBold,
              fontSize: Typography.sizes.xs,
              letterSpacing: Typography.letterSpacing.widest,
              textTransform: 'uppercase',
            }}
          >
            {arch.trait}
          </Text>
        </View>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: Typography.fonts.body,
            fontSize: Typography.sizes.sm,
            textAlign: 'center',
            marginTop: Spacing.md,
            lineHeight: Typography.sizes.sm * 1.4,
          }}
        >
          {arch.description}
        </Text>
        <View style={[styles.rewardRow, { borderTopColor: colors.glassBorder }]}>
          <Text
            style={{
              color: colors.textTertiary,
              fontFamily: Typography.fonts.bodyMedium,
              fontSize: Typography.sizes.xs,
              letterSpacing: Typography.letterSpacing.wide,
              textTransform: 'uppercase',
            }}
          >
            Reward
          </Text>
          <Text
            style={{
              color: colors.text,
              fontFamily: Typography.fonts.bodySemibold,
              fontSize: Typography.sizes.sm,
            }}
          >
            {arch.reward}
          </Text>
        </View>
      </Card>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  traitPill: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  rewardRow: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
