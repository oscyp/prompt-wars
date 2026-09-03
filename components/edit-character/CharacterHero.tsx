import React from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Scrim,
} from '@/constants/DesignTokens';
import type { ButtonCopy } from '@/utils/editDialogCopy';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import { describeChangedSinceRender } from '@/utils/lookDiff';
import PortraitPreview from '../PortraitPreview';

export interface CharacterHeroProps {
  name: string;
  /** e.g. "Comic Book style" — the archetype has its own chip. */
  subtitle: string;
  /** The class chip (`ArchetypeChip`), rendered under the name. */
  archetypeChip?: React.ReactNode;
  portraitUri: string;
  accentColor: string;
  busy?: boolean;
  hasPortrait: boolean;
  /** True when the live render predates the character's current look. */
  portraitStale: boolean;
  /** From `changedSinceRender()`; only read while `portraitStale`. */
  changedFields?: string[];
  /** Equipped frame is drawn on the thumb. */
  cosmetics?: EquippedCosmetics;
  /** From `renderButtonCopy()`: label, caption, a11y and whether it is live. */
  renderButton: ButtonCopy;
  /** From `randomButtonCopy()`; drives the dice button. */
  randomButton: ButtonCopy;
  rendering?: boolean;
  /** From `compactStatusLabel()`, e.g. "Prices unavailable · Retry". */
  statusLabel?: string | null;
  /** Makes the status line tappable (the pricing Retry case). */
  onStatusPress?: () => void;
  onRender: () => void;
  onRandom: () => void;
  onOpenViewer: () => void;
}

const THUMB = 64;
const DICE = 44;

/**
 * The compact Stage: the character in one row, with the paid actions.
 *
 * Shown once the screen has scrolled past the expanded Stage, so it carries
 * the same controls (Draw, dice, portrait tap) at row scale and a one-line
 * status where the expanded banner would not fit.
 */
export default function CharacterHero({
  name,
  subtitle,
  archetypeChip,
  portraitUri,
  accentColor,
  busy = false,
  hasPortrait,
  portraitStale,
  changedFields = [],
  cosmetics,
  renderButton,
  randomButton,
  rendering = false,
  statusLabel = null,
  onStatusPress,
  onRender,
  onRandom,
  onOpenViewer,
}: CharacterHeroProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const changedLine = describeChangedSinceRender(changedFields, portraitStale);
  const renderDisabled = rendering || renderButton.intent === 'disabled';
  const randomDisabled = rendering || randomButton.intent === 'disabled';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onOpenViewer}
        disabled={!hasPortrait}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s portrait full screen`}
        accessibilityState={{ disabled: !hasPortrait }}
        style={styles.thumb}
      >
        <PortraitPreview
          uri={portraitUri}
          variant="fullBody"
          size={THUMB}
          loading={busy}
          accentColor={accentColor}
          frame={cosmetics?.frame}
        />
        {hasPortrait ? (
          <View style={styles.expandPill} pointerEvents="none">
            <Ionicons name="expand-outline" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.meta}>
        <Text
          style={[styles.name, accessibleText, { color: colors.text }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {archetypeChip ? (
          <View style={styles.chipRow}>{archetypeChip}</View>
        ) : null}
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

        {changedLine ? (
          <View style={styles.staleRow}>
            <Ionicons name="sync-outline" size={13} color={colors.warning} />
            <Text
              style={[styles.stale, accessibleText, { color: colors.warning }]}
              numberOfLines={2}
            >
              {changedLine}
            </Text>
          </View>
        ) : null}

        {statusLabel ? (
          <Pressable
            onPress={onStatusPress}
            disabled={!onStatusPress}
            accessibilityRole={onStatusPress ? 'button' : 'text'}
            accessibilityLabel={statusLabel}
            style={styles.statusLine}
          >
            <Ionicons
              name="information-circle-outline"
              size={13}
              color={onStatusPress ? colors.link : colors.textSecondary}
            />
            <Text
              style={[
                styles.statusText,
                accessibleText,
                { color: onStatusPress ? colors.link : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onRender}
            disabled={renderDisabled}
            accessibilityRole="button"
            accessibilityLabel={renderButton.accessibilityLabel}
            accessibilityState={{ disabled: renderDisabled }}
            style={[
              styles.renderBtn,
              { backgroundColor: colors.primary },
              renderDisabled && styles.disabled,
            ]}
          >
            {rendering ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text
                  style={[styles.renderText, accessibleText]}
                  numberOfLines={1}
                >
                  {renderButton.label}
                </Text>
                {renderButton.caption ? (
                  <Text
                    style={[styles.renderCaption, accessibleText]}
                    numberOfLines={1}
                  >
                    {renderButton.caption}
                  </Text>
                ) : null}
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRandom}
            disabled={randomDisabled}
            accessibilityRole="button"
            accessibilityLabel={randomButton.accessibilityLabel}
            accessibilityState={{ disabled: randomDisabled }}
            style={[
              styles.diceBtn,
              {
                backgroundColor: colors.backgroundTertiary,
                borderColor: colors.border,
              },
              randomDisabled && styles.disabled,
            ]}
          >
            <Ionicons name="dice-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
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
  thumb: {
    alignSelf: 'flex-start',
  },
  expandPill: {
    position: 'absolute',
    top: Spacing.xs + 2,
    right: Spacing.xs + 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Scrim.pill,
  },
  meta: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
    minHeight: 32,
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
    flex: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  renderBtn: {
    flex: 1,
    minHeight: DICE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  renderText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  renderCaption: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: Typography.sizes.xs,
    marginTop: 1,
  },
  diceBtn: {
    width: DICE,
    height: DICE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
