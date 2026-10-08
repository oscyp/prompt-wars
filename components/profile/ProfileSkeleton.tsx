import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius, Spacing } from '@/constants/DesignTokens';
import { heroArtworkBudget } from '@/utils/heroArtworkLayout';

export const SKELETON_LABEL = 'Loading your profile';
/**
 * Grey blocks in the shape of the loaded screen — hero, action pills,
 * progress strip, rival rows, navigation cards — so the layout does not jump
 * when data lands. Static placeholders keep the screen steady while the busy state announces loading.
 */
export default function ProfileSkeleton() {
  const colors = useThemedColors();
  const { height, fontScale } = useWindowDimensions();
  const block = { backgroundColor: colors.backgroundTertiary };

  return (
    <View
      accessible
      accessibilityLabel={SKELETON_LABEL}
      accessibilityState={{ busy: true }}
      testID="profile-skeleton"
    >
      <View
        style={[
          styles.hero,
          block,
          { height: heroArtworkBudget(height - 90, 360 * fontScale) },
        ]}
      />
      <View style={[styles.line, styles.meta, block]} />
      <View style={styles.stats} testID="profile-skeleton-stats">
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: 60,
              backgroundColor: colors.backgroundTertiary,
              borderLeftWidth: index ? 1 : 0,
              borderLeftColor: colors.border,
            }}
          />
        ))}
      </View>
      <View style={styles.pills}>
        <View style={[styles.pill, block]} />
        <View style={[styles.pill, block]} />
      </View>
      <View style={[styles.strip, block]} />
      <View style={[styles.row, block]} />
      <View style={[styles.row, block]} />
      <View style={[styles.card, block]} />
      <View style={[styles.card, block]} />
      <View style={[styles.card, block]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '64%',
    alignSelf: 'center',
    borderRadius: BorderRadius.lg,
  },
  line: {
    height: 14,
    borderRadius: BorderRadius.sm,
  },
  meta: {
    width: '55%',
    marginTop: Spacing.sm,
  },
  stats: { flexDirection: 'row', marginTop: Spacing.md },
  pills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: 4,
  },
  strip: {
    height: 96,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  row: {
    height: 52,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  card: {
    height: 64,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
});
