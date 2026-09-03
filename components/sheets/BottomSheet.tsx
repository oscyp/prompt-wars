import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
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
  Spacing,
  Typography,
  BorderRadius,
  Motion,
  Scrim,
} from '@/constants/DesignTokens';

const SHEET_OFFSET = 420;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Scrim tap and hardware back are ignored while true (e.g. mid-submit). */
  dismissDisabled?: boolean;
  /** Announced for the scrim, e.g. "Close item details". */
  closeAccessibilityLabel: string;
  /** Centered heading. Omit when the body draws its own header. */
  title?: string;
  subtitle?: string;
  /** Wraps the sheet in a KeyboardAvoidingView; for sheets with text inputs. */
  keyboardAvoiding?: boolean;
  /** 44×44 close button in the top-right corner. */
  showCloseButton?: boolean;
  children: React.ReactNode;
  testID?: string;
}

/**
 * The app's bottom sheet shell: scrim, grabber, slide-up, safe area.
 *
 * Three sheets carried an identical hand-rolled copy of this (report, battle
 * mode, custom item) and had drifted on grabber size, surface colour and
 * border. New sheets compose this instead; the old three are left alone until
 * they next change.
 */
export default function BottomSheet({
  visible,
  onClose,
  dismissDisabled = false,
  closeAccessibilityLabel,
  title,
  subtitle,
  keyboardAvoiding = false,
  showCloseButton = false,
  children,
  testID,
}: BottomSheetProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;

  useEffect(() => {
    if (!visible) return;
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

  const requestClose = () => {
    if (!dismissDisabled) onClose();
  };

  const sheet = (
    <Animated.View
      accessibilityViewIsModal
      testID={testID}
      style={[
        styles.sheet,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          paddingBottom: insets.bottom + Spacing.lg,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      {showCloseButton ? (
        <TouchableOpacity
          onPress={requestClose}
          disabled={dismissDisabled}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.close}
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
      {title ? (
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={[styles.subtitle, accessibleText, { color: colors.textSecondary }]}
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={requestClose}
        accessibilityRole="button"
        accessibilityLabel={closeAccessibilityLabel}
      />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: Scrim.sheet },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Capped so a large-text layout still shows the scrim above it, keeping
    // "tap outside to dismiss" discoverable.
    maxHeight: '88%',
    marginTop: 'auto',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  close: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
});
