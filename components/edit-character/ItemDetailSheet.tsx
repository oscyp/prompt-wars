import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { TRAIT_LABELS } from '@/constants/CharacterTraits';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type { CatalogSignatureItem } from '@/utils/characters';
import BottomSheet from '../sheets/BottomSheet';
import { ITEM_CLASS_ICON } from '../ItemGrid';
import { editStyles as s } from './styles';

export interface ItemDetailSheetProps {
  visible: boolean;
  /** Null between openings; the sheet stays mounted so `visible` can toggle. */
  item: CatalogSignatureItem | null;
  /** True when `item` is the staged item; the button reads "Equipped". */
  equipped: boolean;
  /** A save is in flight: Choose shows a spinner and the sheet won't dismiss. */
  busy?: boolean;
  /** Editing is blocked (battle lock); Choose is disabled but details show. */
  disabled?: boolean;
  disabledReason?: string;
  disabledActionLabel?: string;
  onDisabledAction?: () => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/**
 * What a signature item is, shown where the player tapped.
 *
 * The Gear panel used to answer a tile tap by inserting a preview card near
 * the top of the panel -- usually off-screen, above the grid the player was
 * looking at, so the tap appeared to do nothing. A sheet puts the class,
 * description and Choose button under the thumb instead, and the grid tile it
 * came from stays highlighted behind it.
 */
export default function ItemDetailSheet({
  visible,
  item,
  equipped,
  busy = false,
  disabled = false,
  disabledReason,
  disabledActionLabel,
  onDisabledAction,
  onChoose,
  onClose,
}: ItemDetailSheetProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const canChoose = !equipped && !busy && !disabled;
  const canResolveDisabled = disabled && !equipped && Boolean(onDisabledAction);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissDisabled={busy}
      closeAccessibilityLabel="Close item details"
      showCloseButton
      testID="item-detail-sheet"
    >
      {item ? (
        <View style={styles.body}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconTile,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            >
              {item.iconUrl ? (
                <Image
                  source={{ uri: item.iconUrl }}
                  style={styles.icon}
                  accessibilityLabel=""
                />
              ) : (
                <MaterialCommunityIcons
                  name={ITEM_CLASS_ICON[item.itemClass] ?? 'star-four-points'}
                  size={40}
                  color={colors.primary}
                />
              )}
            </View>
            <View style={s.flex1}>
              <Text
                accessibilityRole="header"
                style={[styles.name, accessibleText, { color: colors.text }]}
              >
                {item.name}
              </Text>
              <Text
                style={[s.hint, accessibleText, { color: colors.textTertiary }]}
              >
                {TRAIT_LABELS.itemClass[item.itemClass] ?? item.itemClass}
              </Text>
            </View>
          </View>

          <Text
            style={[s.cardSub, accessibleText, { color: colors.textSecondary }]}
          >
            {item.description}
          </Text>

          {item.isCustom ? (
            <Text
              style={[s.hint, accessibleText, { color: colors.textTertiary }]}
            >
              Your creation
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              if (canChoose) onChoose(item.id);
              else if (canResolveDisabled) onDisabledAction?.();
            }}
            disabled={!canChoose && !canResolveDisabled}
            accessibilityRole="button"
            accessibilityLabel={equipped ? undefined : `Choose ${item.name}`}
            accessibilityState={{ disabled: !canChoose && !canResolveDisabled }}
            style={[
              s.primaryBtn,
              { backgroundColor: colors.primary },
              !canChoose && !canResolveDisabled && s.btnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>
                {equipped
                  ? 'Equipped'
                  : canResolveDisabled
                    ? (disabledActionLabel ?? 'Manage battles')
                    : 'Choose this item'}
              </Text>
            )}
          </TouchableOpacity>

          <Text
            style={[
              s.hint,
              styles.centered,
              accessibleText,
              { color: colors.textTertiary },
            ]}
          >
            {disabled && !equipped
              ? (disabledReason ?? 'Editing is locked during an active battle.')
              : 'Applied when you save.'}
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const ICON_TILE = 64;

const styles = StyleSheet.create({
  body: {
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    // Clears the sheet's absolutely positioned 44pt close button.
    paddingRight: 44,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  name: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  centered: {
    textAlign: 'center',
  },
});
