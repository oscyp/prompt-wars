import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import type { ItemClass } from '@/constants/CharacterTraits';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { spendRows, customItemButtonCopy } from '@/utils/editDialogCopy';
import { traitOptions } from '@/utils/traitOptions';
import OptionGrid from '../OptionGrid';
import BottomSheet from '../sheets/BottomSheet';
import { editStyles as s } from './styles';

const NAME_MAX = 32;
const DESC_MAX = 140;

export interface CustomItemSheetProps {
  visible: boolean;
  cost: number;
  /** Credit balance; `null` while loading, which hides the Balance/After rows. */
  balance: number | null;
  /** False until live prices arrive; the button waits rather than guessing. */
  pricingVerified: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    itemClass: ItemClass;
  }) => void;
  /** Opens the wallet when the player cannot afford the item. */
  onTopUp: () => void;
}

/**
 * Bottom sheet for creating a signature item.
 *
 * Composes the shared `BottomSheet` (keyboard-avoiding, close button) instead
 * of carrying its own scrim and slide-up. The price is shown as a
 * Price / Balance / After block above the button and the button itself is the
 * point of commitment: there is no second confirm after it. When the player is
 * short, the same button reads the shortfall and opens the wallet instead.
 */
export default function CustomItemSheet({
  visible,
  cost,
  balance,
  pricingVerified,
  busy = false,
  onClose,
  onSubmit,
  onTopUp,
}: CustomItemSheetProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [itemClass, setItemClass] = useState<ItemClass>('tool');

  useEffect(() => {
    if (visible) return;
    setName('');
    setDescription('');
    setItemClass('tool');
  }, [visible]);

  const ready = name.trim().length > 0 && description.trim().length > 0;
  const copy = customItemButtonCopy({ price: cost, balance, pricingVerified });
  const rows = spendRows(cost, balance);
  const disabled = busy || !ready || copy.intent === 'disabled';

  const onPress = () => {
    if (copy.intent === 'topUp') {
      onTopUp();
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      itemClass,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissDisabled={busy}
      closeAccessibilityLabel="Close item creation"
      title="Create a signature item"
      keyboardAvoiding
      showCloseButton
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Item name"
          placeholderTextColor={colors.textTertiary}
          maxLength={NAME_MAX}
          style={[
            s.input,
            { backgroundColor: colors.backgroundSecondary, color: colors.text },
          ]}
          accessibilityLabel="Custom item name"
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor={colors.textTertiary}
          maxLength={DESC_MAX}
          multiline
          style={[
            s.input,
            s.multiline,
            { backgroundColor: colors.backgroundSecondary, color: colors.text },
          ]}
          accessibilityLabel="Custom item description"
        />
        <Text style={[s.counter, { color: colors.textTertiary }]}>
          {`${description.length}/${DESC_MAX}`}
        </Text>

        <OptionGrid
          title="Class"
          label="Class"
          options={traitOptions('itemClass')}
          value={itemClass}
          onChange={(v) => setItemClass(v as ItemClass)}
          disabled={busy}
        />

        <View
          style={[
            styles.rows,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor: colors.border,
            },
          ]}
        >
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text
                style={[
                  styles.rowLabel,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                {row.label}
              </Text>
              <Text
                style={[
                  styles.rowValue,
                  accessibleText,
                  NumericFontVariant,
                  { color: colors.text },
                ]}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[s.hint, accessibleText, { color: colors.textTertiary }]}>
          Includes a generated icon.
        </Text>

        <TouchableOpacity
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={copy.accessibilityLabel}
          accessibilityState={{ disabled, busy }}
          style={[
            s.primaryBtn,
            { backgroundColor: colors.primary },
            disabled && s.btnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={s.primaryBtnText}>{copy.label}</Text>
          )}
        </TouchableOpacity>
        {copy.caption ? (
          <Text
            style={[
              styles.caption,
              accessibleText,
              {
                color:
                  copy.intent === 'topUp'
                    ? colors.warning
                    : colors.textTertiary,
              },
            ]}
          >
            {copy.caption}
          </Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  rows: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 24,
  },
  rowLabel: { fontSize: Typography.sizes.sm },
  rowValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  caption: {
    marginTop: -Spacing.xs,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
});
