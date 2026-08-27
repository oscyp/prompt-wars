import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { formatCredits } from '@/utils/credits';
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
  /** Credits the render costs. */
  renderCost: number;
  /** True when saving must happen first, which changes the button's promise. */
  hasUnsaved: boolean;
  rendering?: boolean;
  renderDisabled?: boolean;
  onRender: () => void;
  onOpenViewer: () => void;
}

const THUMB = 64;

/**
 * The character, and the one paid action on the screen.
 *
 * The render button lives here because there is now exactly one of it. It used
 * to be duplicated -- a CTA here and a Regenerate row inside the Portraits tab,
 * with different labels and different prices for the same purchase -- so round
 * one stripped it out of the hero entirely. With the Portraits tab gone and one
 * render to buy, it belongs beside the thing it changes and visible from every
 * tab.
 */
export default function CharacterHero({
  name,
  subtitle,
  portraitUri,
  accentColor,
  busy = false,
  hasPortrait,
  portraitStale,
  renderCost,
  hasUnsaved,
  rendering = false,
  renderDisabled = false,
  onRender,
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
        {/* Saving first is not optional: rendering a staged-but-unsaved look
            would draw the character the player had BEFORE their edits, which is
            the most confusing outcome this screen can produce. */}
        <TouchableOpacity
          onPress={onRender}
          disabled={rendering || renderDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            hasUnsaved
              ? `Save and render new look, ${formatCredits(renderCost, 'sentence')}`
              : `Render new look, ${formatCredits(renderCost, 'sentence')}`
          }
          accessibilityState={{ disabled: rendering || renderDisabled }}
          style={[
            styles.renderBtn,
            { backgroundColor: colors.primary },
            (rendering || renderDisabled) && styles.renderDisabled,
          ]}
        >
          {rendering ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.renderText} numberOfLines={1}>
              {`${hasUnsaved ? 'Save & render' : 'Render new look'} · ${formatCredits(renderCost)}`}
            </Text>
          )}
        </TouchableOpacity>
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
  renderBtn: {
    marginTop: Spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  renderDisabled: { opacity: 0.5 },
  renderText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
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
