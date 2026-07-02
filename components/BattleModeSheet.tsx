import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
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
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close battle mode selection"
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
        <Text style={[styles.title, { color: colors.text }]}>
          Start a Battle
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose your battle mode
        </Text>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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
  modes: {
    gap: Spacing.md,
  },
});
