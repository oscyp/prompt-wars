import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
  Scrim,
} from '@/constants/DesignTokens';
import { BATTLE_MODES, BattleMode } from '@/constants/BattleModes';
import ModeCard from './ModeCard';

/**
 * Lets any screen inside the tab shell open the battle-mode sheet (the raised
 * center tab action). Provided by `(tabs)/_layout.tsx`; a no-op default keeps
 * consumers safe outside the shell.
 */
const BattleSheetContext = createContext<{ open: () => void }>({
  open: () => {},
});

export const BattleSheetProvider = BattleSheetContext.Provider;

export function useBattleSheet() {
  return useContext(BattleSheetContext);
}

export interface BattleModeSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for picking a battle mode (Ranked / Casual / vs Bot) — the
 * target of the raised center "Battle" tab button. Selecting a mode routes to
 * matchmaking. Slide-up animation is skipped under Reduce Motion.
 */
export default function BattleModeSheet({
  visible,
  onClose,
}: BattleModeSheetProps) {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }
    translateY.setValue(320);
    Animated.timing(translateY, {
      toValue: 0,
      duration: Motion.durations.base,
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, translateY]);

  const selectMode = (mode: BattleMode) => {
    onClose();
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Tap-outside-to-dismiss for sighted users only. It is hidden from the
          accessibility tree because a full-screen "Close" button that sits
          behind the sheet is a trap for screen-reader focus order; the header
          button below is the accessible way out. */}
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            paddingBottom: insets.bottom + Spacing.lg,
            transform: [{ translateY }],
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerText}>
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
            >
              Start a Battle
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Choose your battle mode
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: pressed
                  ? colors.backgroundTertiary
                  : colors.card,
                borderColor: colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.modes}>
          {BATTLE_MODES.map((info) => (
            <ModeCard key={info.mode} info={info} onPress={selectMode} />
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: Scrim.sheet,
  },
  sheet: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  // Mirrors the close button's footprint so the title stays centred.
  headerSpacer: {
    width: 44,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  closeButton: {
    // 44pt: the design language's minimum target, met by the visible control
    // itself rather than rescued by hitSlop.
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  modes: {
    gap: Spacing.md,
  },
});
