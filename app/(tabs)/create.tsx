import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { BATTLE_MODES, BattleMode } from '@/constants/BattleModes';
import ModeCard from '@/components/ModeCard';

/**
 * Full-screen battle-mode picker. The raised center tab button opens the
 * bottom-sheet variant instead; this screen stays as the deep-link /
 * notification target for the `create` route (same cards, same routing).
 */
export default function CreateScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();

  const startBattle = (mode: BattleMode) => {
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + Spacing.sm },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Start a Battle</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose your battle mode
      </Text>

      <View style={styles.modes}>
        {BATTLE_MODES.map((info) => (
          <ModeCard key={info.mode} info={info} onPress={startBattle} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  modes: {
    gap: Spacing.md,
  },
});
