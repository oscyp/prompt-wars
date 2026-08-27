import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface SaveBarProps {
  changeCount: number;
  busy?: boolean;
  onSave: () => void;
  onClear: () => void;
}

/**
 * One commit point for everything staged across Identity, Look and Gear.
 *
 * Carries no price, because describing a character costs nothing: the money is
 * on the render button in the hero. What this bar is for is the other kind of
 * cost — name locks for 7 days, archetype for 14 — which the confirmation
 * spells out before anything is written.
 */
export default function SaveBar({
  changeCount,
  busy = false,
  onSave,
  onClear,
}: SaveBarProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
    >
      <View style={styles.summary}>
        <Text style={[styles.title, accessibleText, { color: colors.text }]}>
          {changeCount} change{changeCount === 1 ? '' : 's'}
        </Text>
        <Text style={[styles.sub, accessibleText, { color: colors.textSecondary }]}>
          Free
        </Text>
      </View>
      <TouchableOpacity
        onPress={onClear}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Discard staged changes"
        style={styles.clear}
      >
        <Text style={[styles.clearText, { color: colors.textSecondary }]}>
          Clear
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
        accessibilityState={{ disabled: busy }}
        style={[
          styles.save,
          { backgroundColor: colors.primary },
          busy && styles.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>Save changes</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summary: { flex: 1 },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  sub: {
    marginTop: 1,
    fontSize: Typography.sizes.xs,
  },
  clear: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  clearText: {
    fontSize: Typography.sizes.sm,
  },
  save: {
    minHeight: 44,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  disabled: { opacity: 0.5 },
});
