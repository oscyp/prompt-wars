import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  ITEM_CLASSES,
  TRAIT_LABELS,
  type ItemClass,
} from '@/constants/CharacterTraits';
import { formatCredits } from '@/utils/credits';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
} from '@/constants/DesignTokens';
import TraitPicker, { type TraitOption } from '../TraitPicker';
import { editStyles as s } from './styles';

const NAME_MAX = 32;
const DESC_MAX = 140;
const SHEET_OFFSET = 420;

export interface CustomItemSheetProps {
  visible: boolean;
  cost: number;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    itemClass: ItemClass;
  }) => void;
}

/**
 * Bottom sheet for creating a signature item.
 *
 * Rebuilt on the app's sheet pattern (scrim + animated translate gated on
 * reduce-motion) and made keyboard-aware: the previous version put a multiline
 * description field at the bottom of a plain Modal with no
 * `KeyboardAvoidingView`, so on a small screen the keyboard covered the field
 * being typed into and the Save button below it.
 */
export default function CustomItemSheet({
  visible,
  cost,
  busy = false,
  onClose,
  onSubmit,
}: CustomItemSheetProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [itemClass, setItemClass] = useState<ItemClass>('tool');

  useEffect(() => {
    if (!visible) {
      setName('');
      setDescription('');
      setItemClass('tool');
      return;
    }
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }
    translateY.setValue(SHEET_OFFSET);
    Animated.timing(translateY, {
      toValue: 0,
      duration: Motion.durations.base,
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, translateY]);

  const ready = name.trim().length > 0 && description.trim().length > 0;
  const disabled = busy || !ready;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close item creation"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + Spacing.lg,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text
              style={[styles.title, accessibleText, { color: colors.text }]}
            >
              Create a signature item
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

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
                { backgroundColor: colors.background, color: colors.text },
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
                { backgroundColor: colors.background, color: colors.text },
              ]}
              accessibilityLabel="Custom item description"
            />
            <Text style={[s.counter, { color: colors.textTertiary }]}>
              {`${description.length}/${DESC_MAX}`}
            </Text>
            <TraitPicker
              title="Class"
              value={itemClass}
              onChange={(v) => setItemClass(v as ItemClass)}
              options={ITEM_CLASSES.map<TraitOption>((c) => ({
                value: c,
                label: TRAIT_LABELS.itemClass[c],
              }))}
            />
            <Text
              style={[s.hint, accessibleText, { color: colors.textTertiary }]}
            >
              {`Includes a generated icon · ${formatCredits(cost, 'sentence')}`}
            </Text>
            <TouchableOpacity
              onPress={() =>
                onSubmit({
                  name: name.trim(),
                  description: description.trim(),
                  itemClass,
                })
              }
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Create item for ${formatCredits(cost, 'sentence')}`}
              accessibilityState={{ disabled }}
              style={[
                s.primaryBtn,
                { backgroundColor: colors.primary },
                disabled && s.btnDisabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {`Create · ${formatCredits(cost)}`}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    // Capped so a large-text layout still shows the scrim above it, keeping
    // "tap outside to dismiss" discoverable.
    maxHeight: '88%',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
});
