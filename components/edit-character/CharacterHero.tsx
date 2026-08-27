import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography } from '@/constants/DesignTokens';
import PortraitPreview from '../PortraitPreview';

export interface CharacterHeroProps {
  name: string;
  /** e.g. "Strategist · Comic Book" */
  subtitle: string;
  portraitUri: string;
  accentColor: string;
  busy?: boolean;
  hasPortrait: boolean;
  /** True when the live render predates the character's current look. */
  portraitStale: boolean;
  onOpenViewer: () => void;
}

const THUMB = 64;

/**
 * The character, kept at one size on every tab.
 *
 * Previously the hero grew to 208pt on the Portrait tab -- the one tab whose
 * own content is a portrait -- pushing the actual portrait tools below the
 * fold, and it carried the paid "See new look" button, so the same purchase
 * existed in two places. It is now identity only: tapping opens the viewer and
 * never spends anything.
 */
export default function CharacterHero({
  name,
  subtitle,
  portraitUri,
  accentColor,
  busy = false,
  hasPortrait,
  portraitStale,
  onOpenViewer,
}: CharacterHeroProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  return (
    <View style={styles.wrap}>
      <PortraitPreview
        uri={portraitUri}
        variant="fullBody"
        size={THUMB}
        loading={busy}
        accentColor={accentColor}
        accessibilityLabel={`${name}, character portrait`}
      />
      <View style={styles.meta}>
        <Text
          style={[styles.name, accessibleText, { color: colors.text }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
        {portraitStale ? (
          <View style={styles.staleRow}>
            <Ionicons name="sync-outline" size={13} color={colors.warning} />
            <Text
              style={[styles.stale, accessibleText, { color: colors.warning }]}
            >
              Portrait needs updating
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={onOpenViewer}
          disabled={!hasPortrait}
          accessibilityRole="button"
          accessibilityLabel="View portrait full screen"
          accessibilityState={{ disabled: !hasPortrait }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.viewerLink}
        >
          <Text
            style={[
              styles.viewerText,
              { color: hasPortrait ? colors.link : colors.textTertiary },
            ]}
          >
            View full screen
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    // minHeight, never a fixed height: at large Dynamic Type the meta column
    // needs to grow rather than clip.
    minHeight: THUMB * 1.5,
  },
  meta: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    marginTop: 2,
    fontSize: Typography.sizes.sm,
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  stale: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  viewerLink: {
    marginTop: Spacing.xs,
    minHeight: 28,
    justifyContent: 'center',
  },
  viewerText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
});
