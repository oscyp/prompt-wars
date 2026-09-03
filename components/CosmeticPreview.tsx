import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
 * Built from the same components the battle and profile screens use, rather
 * than from a stored preview image. `cosmetics_catalog.preview_asset_path`
 * exists and is populated for 0 of 16 rows, and filling it would mean an asset
 * per cosmetic that still could not show the player their OWN fighter wearing
 * it. Composing live costs nothing, cannot drift from what the game renders,
 * and updates the moment they change their look.
 */
export default function CosmeticPreview({
  portraitUri,
  characterName,
  signatureColor,
  equipped,
  preview,
}: CosmeticPreviewProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  // The focused item replaces its own slot and leaves the rest of the loadout
  // alone, so the player sees the change in context rather than in isolation.
  const frame = preview?.kind === 'frame' ? preview : equipped.frame;
  const title = preview?.kind === 'title' ? preview : equipped.title;
  const badge = preview?.kind === 'badge' ? preview : equipped.badge;
  const avatarEffect =
    preview?.kind === 'avatar_effect' ? preview : equipped.avatarEffect;
  const accent = preview?.kind === 'color' ? preview.hex : signatureColor;

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.backgroundSecondary }]}
    >
      <PortraitPreview
        uri={portraitUri}
        variant="fullBody"
        size={104}
        accentColor={accent}
        frame={frame}
        avatarEffect={avatarEffect}
        accessibilityLabel={`${characterName} wearing the selected cosmetic`}
      />
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, accessibleText, { color: colors.text }]}
            numberOfLines={1}
          >
            {characterName}
          </Text>
          <CosmeticBadge badge={badge} size={16} />
        </View>
        <CosmeticTitle title={title} />
        {preview?.kind === 'color' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Owning a colour unlocks it as a signature colour swatch in Edit
            character.
          </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  meta: { flex: 1, gap: Spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  name: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  note: {
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
  },
});
