import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import type { SheetCopy, SpendRow } from '@/utils/editDialogCopy';
import PortraitPreview from '../PortraitPreview';
import BottomSheet from './BottomSheet';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Bulleted body lines, e.g. the staged changes a save will commit. */
  lines?: string[];
  /** Price / Balance / After block. Empty for free actions. */
  rows?: SpendRow[];
  /** Small print, e.g. "Name locks for 7 days." */
  footnote?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'destructive';
  /** 2:3 portrait shown beside the title, for render confirms. */
  thumbnailUri?: string | null;
  accentColor?: string;
  /** Spinner in the confirm button; cancel and scrim stop dismissing. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Spread a `SheetCopy` straight into the sheet. */
export type ConfirmSheetCopyProps = SheetCopy;

/**
 * Branded confirmation for spending or committing on the edit screen.
 *
 * The screen used to confirm every spend with a system alert, which cannot
 * show the portrait, a balance, or a list of changes. This can, and it puts
 * the price where the design language wants it: in the body, never the title.
 */
export default function ConfirmSheet({
  visible,
  title,
  subtitle,
  lines = [],
  rows = [],
  footnote,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  thumbnailUri,
  accentColor,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const confirmColor =
    confirmTone === 'destructive' ? colors.error : colors.primary;

  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      dismissDisabled={busy}
      closeAccessibilityLabel="Cancel"
    >
      <View style={styles.header}>
        {thumbnailUri ? (
          <PortraitPreview
            uri={thumbnailUri}
            variant="fullBody"
            size={56}
            accentColor={accentColor}
            accessibilityLabel="Current portrait"
          />
        ) : null}
        <View style={styles.headerText}>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              accessibleText,
              {
                color: colors.text,
                textAlign: thumbnailUri ? 'left' : 'center',
              },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                accessibleText,
                {
                  color: colors.textSecondary,
                  textAlign: thumbnailUri ? 'left' : 'center',
                },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {lines.length > 0 ? (
        <View style={styles.lines}>
          {lines.map((line, i) => (
            <Text
              key={`${i}-${line}`}
              style={[styles.line, accessibleText, { color: colors.text }]}
            >
              {`• ${line}`}
            </Text>
          ))}
        </View>
      ) : null}

      {rows.length > 0 ? (
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
      ) : null}

      {footnote ? (
        <Text
          style={[
            styles.footnote,
            accessibleText,
            { color: colors.textTertiary },
          ]}
        >
          {footnote}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          accessibilityState={{ disabled: busy }}
          style={[
            styles.button,
            { backgroundColor: colors.backgroundTertiary },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>
            {cancelLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy, busy }}
          style={[
            styles.button,
            { backgroundColor: confirmColor, opacity: busy ? 0.6 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
              {confirmLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  lines: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  line: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
  rows: {
    marginTop: Spacing.md,
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
  footnote: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  button: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
