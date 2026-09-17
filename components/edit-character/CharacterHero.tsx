import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';
import { GameText } from '@/components/game';
import { inkFor } from '@/utils/contrast';
import React from 'react';
import {
  View,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
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
  avatarUri?: string;
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
  onRender: (opener: SheetFocusRef) => void;
  onRandom: (opener: SheetFocusRef) => void;
  onOpenViewer: (opener: SheetFocusRef) => void;
}

const THUMB = 64;
const DICE = 48;

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
  avatarUri,
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
  const renderRef = React.useRef<View>(null);
  const randomRef = React.useRef<View>(null);
  const portraitRef = React.useRef<View>(null);
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const changedLine = describeChangedSinceRender(changedFields, portraitStale);
  const renderDisabled = rendering || renderButton.intent === 'disabled';
  const randomDisabled = rendering || randomButton.intent === 'disabled';

  return (
    <View style={styles.wrap}>
      <Pressable
        ref={portraitRef}
        onPress={() => onOpenViewer(portraitRef)}
        disabled={!hasPortrait}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s portrait full screen`}
        accessibilityState={{ disabled: !hasPortrait }}
        style={styles.thumb}
      >
        <PortraitPreview
          uri={avatarUri ?? ''}
          variant="circle"
          size={THUMB}
          loading={busy}
          accentColor={accentColor}
          frame={cosmetics?.frame}
        />
        {hasPortrait ? (
          <View style={styles.expandPill} pointerEvents="none">
            <GameSymbol name="expand-outline" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.meta}>
        <GameText
          variant="fighter"
          style={[styles.name, accessibleText, { color: colors.text }]}
        >
          {name}
        </GameText>
        {archetypeChip ? (
          <View style={styles.chipRow}>{archetypeChip}</View>
        ) : null}
        <GameText
          variant="caption"
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {subtitle}
        </GameText>

        {changedLine ? (
          <View style={styles.staleRow}>
            <GameSymbol name="sync-outline" size={13} color={colors.warning} />
            <GameText
              variant="body"
              style={[styles.stale, accessibleText, { color: colors.warning }]}
            >
              {changedLine}
            </GameText>
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
            <GameSymbol
              name="information-circle-outline"
              size={13}
              color={onStatusPress ? colors.link : colors.textSecondary}
            />
            <GameText
              variant="body"
              style={[
                styles.statusText,
                accessibleText,
                { color: onStatusPress ? colors.link : colors.textSecondary },
              ]}
            >
              {statusLabel}
            </GameText>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            ref={renderRef}
            onPress={() => onRender(renderRef)}
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
              <ActivityIndicator color={inkFor(colors.primary)} />
            ) : (
              <>
                <GameText
                  variant="body"
                  style={[
                    styles.renderText,
                    accessibleText,
                    { color: inkFor(colors.primary) },
                  ]}
                >
                  {renderButton.label}
                </GameText>
                {renderButton.caption ? (
                  <GameText
                    variant="caption"
                    style={[
                      styles.renderCaption,
                      accessibleText,
                      { color: inkFor(colors.primary) },
                    ]}
                  >
                    {renderButton.caption}
                  </GameText>
                ) : null}
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            ref={randomRef}
            onPress={() => onRandom(randomRef)}
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
            <GameSymbol name="dice-outline" size={20} color={colors.text} />
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
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 48,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
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
    textAlign: 'center',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  renderCaption: {
    textAlign: 'center',
    fontSize: Typography.sizes.sm,
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
