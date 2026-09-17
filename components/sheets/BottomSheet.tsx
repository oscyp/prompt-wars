import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import React, { useCallback, useEffect, useRef } from 'react';
import { GameText as Text, GameFooter } from '@/components/game';
import {
  Modal,
  View,
  Pressable,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  ScrollView,
  AccessibilityInfo,
  findNodeHandle,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, BorderRadius, Motion, Scrim } from '@/constants/DesignTokens';

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
  /** 48×48 close button in the top-right corner. */
  showCloseButton?: boolean;
  children: React.ReactNode;
  /** Actions remain reachable while the body scrolls. */
  footer?: React.ReactNode;
  /** Optional opener focus target restored when dismissed. */
  returnFocusRef?: React.RefObject<View | null>;
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
  showCloseButton = true,
  children,
  footer,
  returnFocusRef,
  testID,
}: BottomSheetProps) {
  const focusRef = useRef<View>(null);
  const didShow = useRef(false);
  const isVisible = useRef(visible);
  isVisible.current = visible;
  const restoreFocus = useCallback(() => {
    if (!didShow.current || isVisible.current) return;
    didShow.current = false;
    const target =
      returnFocusRef?.current && findNodeHandle(returnFocusRef.current);
    if (target) AccessibilityInfo.setAccessibilityFocus(target);
  }, [returnFocusRef]);
  useEffect(() => {
    if (Platform.OS !== 'android' || visible || !didShow.current) return;
    const task = InteractionManager.runAfterInteractions(restoreFocus);
    return () => task.cancel();
  }, [visible, restoreFocus]);
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const active = useBattlePresentationActive();
  const reduceMotion = useReducedMotion() || !active;
  const accessibleText = useAccessibleTextStyle();
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }
    translateY.setValue(SHEET_OFFSET);
    const entrance = Animated.timing(translateY, {
      toValue: 0,
      duration: Motion.durations.base,
      useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
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
          borderColor: colors.ornamentMuted,
          paddingBottom: insets.bottom + Spacing.lg,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        accessible={false}
        style={[styles.grabber, { backgroundColor: colors.ornament }]}
      />
      {showCloseButton ? (
        <TouchableOpacity
          ref={focusRef}
          onPress={requestClose}
          disabled={dismissDisabled}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
          style={styles.close}
        >
          <GameSymbol name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
      <ScrollView
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Spacing.md }}
      >
        {title ? (
          <Text
            variant="title"
            accessibilityRole="header"
            style={[styles.title, accessibleText, { color: colors.text }]}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
        <View>{children}</View>
      </ScrollView>
      {footer ? (
        <GameFooter style={{ padding: 0, paddingTop: 12 }}>{footer}</GameFooter>
      ) : null}
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      onShow={() => {
        didShow.current = true;
        const target = findNodeHandle(focusRef.current);
        if (target) AccessibilityInfo.setAccessibilityFocus(target);
      }}
      onDismiss={restoreFocus}
    >
      <Pressable
        style={styles.scrim}
        onPress={requestClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
    maxHeight: '92%',
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
    alignSelf: 'flex-end',
    marginTop: -8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
});
