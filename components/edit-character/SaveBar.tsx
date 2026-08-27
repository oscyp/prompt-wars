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
import { formatCredits } from '@/utils/credits';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface SaveBarProps {
  changeCount: number;
  cost: number;
  credits: number;
  busy?: boolean;
  onSave: () => void;
  onClear: () => void;
  /** Routed to when the player cannot afford the staged edits. */
  onGetCredits: () => void;
}

/**
 * One commit point for everything staged across Identity and Look.
 *
 * The old apply bar lived inside the Traits panel, so the two thirds of the
 * screen that committed on tap had no bar at all and the one that staged had a
 * bar you could only see from its own tab. This one is screen-level: whatever
 * is staged, wherever it was staged, is summarised and saved here.
 */
export default function SaveBar({
  changeCount,
  cost,
  credits,
  busy = false,
  onSave,
  onClear,
  onGetCredits,
}: SaveBarProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const short = cost > credits;

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
        <Text
          style={[
            styles.sub,
            accessibleText,
            { color: short ? colors.error : colors.textSecondary },
          ]}
        >
          {short
            ? `Need ${formatCredits(cost - credits, 'sentence')} more`
            : formatCredits(cost)}
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
        onPress={short ? onGetCredits : onSave}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          short
            ? 'Get credits'
            : `Save ${changeCount} change${changeCount === 1 ? '' : 's'}, ${formatCredits(cost, 'sentence')}`
        }
        accessibilityState={{ disabled: busy }}
        style={[
          styles.save,
          { backgroundColor: short ? colors.warning : colors.primary },
          busy && styles.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>
            {short ? 'Get credits' : 'Save changes'}
          </Text>
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
