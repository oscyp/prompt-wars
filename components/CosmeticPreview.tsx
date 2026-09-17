import { GameText as Text } from '@/components/game';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type { CosmeticPresentation } from '@/constants/Cosmetics';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import PortraitPreview from './PortraitPreview';
import CosmeticTitle from './CosmeticTitle';
import CosmeticBadge from './CosmeticBadge';

export interface CosmeticPreviewProps {
  /** The player's own portrait, so the preview is of THEIR fighter. */
  portraitUri: string;
  avatarUri?: string;
  onImageError?: () => void;
  characterName: string;
  signatureColor: string;
  /** What is currently equipped, as the baseline. */
  equipped: EquippedCosmetics;
  /** The item being previewed, laid over the baseline. */
  preview?: CosmeticPresentation | null;
}

/**
 * Shows the player's own character wearing the cosmetic they are looking at.
 *
 * Composes the shared battle/profile renderers over the player's existing art.
 * Previewing does not spend credits or mutate the equipped loadout.
 */
export default function CosmeticPreview({
  portraitUri,
  avatarUri,
  onImageError,
  characterName,
  signatureColor,
  equipped,
  preview,
}: CosmeticPreviewProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [context, setContext] = useState<'Portrait' | 'Avatar'>(
    preview?.kind === 'avatar_effect' ? 'Avatar' : 'Portrait',
  );
  useEffect(() => {
    setContext(preview?.kind === 'avatar_effect' ? 'Avatar' : 'Portrait');
  }, [preview]);

  // The focused item replaces its own slot and leaves the rest of the loadout
  // alone, so the player sees the change in context rather than in isolation.
  const frame = preview?.kind === 'frame' ? preview : equipped.frame;
  const title = preview?.kind === 'title' ? preview : equipped.title;
  const badge = preview?.kind === 'badge' ? preview : equipped.badge;
  const avatarEffect =
    preview?.kind === 'avatar_effect' ? preview : equipped.avatarEffect;
  const accent = signatureColor;

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.backgroundSecondary }]}
    >
      <View style={styles.contexts}>
        {(['Portrait', 'Avatar'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} context`}
            accessibilityState={{ selected: context === value }}
            onPress={() => setContext(value)}
            style={[
              styles.contextButton,
              {
                backgroundColor:
                  context === value
                    ? colors.primary
                    : colors.backgroundTertiary,
              },
            ]}
          >
            <Text
              style={{ color: context === value ? '#171225' : colors.text }}
            >
              {value}
            </Text>
          </Pressable>
        ))}
      </View>
      <PortraitPreview
        uri={context === 'Avatar' ? (avatarUri ?? portraitUri) : portraitUri}
        onImageError={onImageError}
        variant={context === 'Avatar' ? 'circle' : 'fullBody'}
        size={184}
        accentColor={accent}
        frame={frame}
        avatarEffect={avatarEffect}
        accessibilityLabel={`${characterName} wearing the selected cosmetic`}
      />
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, accessibleText, { color: colors.text }]}>
            {characterName}
          </Text>
          <CosmeticBadge badge={badge} size={16} />
        </View>
        <CosmeticTitle title={title} />
        {preview?.kind === 'color' ? (
          <>
            <View
              testID="cosmetic-color-swatch"
              accessibilityLabel={`${preview.label} colour swatch`}
              style={{
                height: 48,
                width: 72,
                borderRadius: 12,
                backgroundColor: preview.hex,
              }}
            />
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Owning a colour unlocks it as a signature colour swatch in Edit
              character.
            </Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Generated artwork keeps its original colours.
            </Text>
          </>
        ) : null}
        {preview?.kind === 'reveal_style' ? (
          <Text style={[styles.note, { color: colors.warning }]}>
            Reveal styles aren&apos;t in the game yet.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'stretch',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  contexts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contextButton: {
    minHeight: 48,
    minWidth: 96,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  meta: { gap: Spacing.xs },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  note: {
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
  },
});
