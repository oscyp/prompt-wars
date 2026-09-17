import React from 'react';
import { View, StyleSheet } from 'react-native';
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
import { GameText as Text, GameButton } from '@/components/game';
import BottomSheet from './BottomSheet';

export interface ConfirmSheetProps {
  visible: boolean;
  returnFocusRef?: React.RefObject<View | null>;
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
  /** Unavailable action; leaving the sheet remains possible. */
  confirmDisabled?: boolean;
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
  returnFocusRef,
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
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  return (
    <BottomSheet
      returnFocusRef={returnFocusRef}
      visible={visible}
      onClose={onCancel}
      dismissDisabled={busy}
      closeAccessibilityLabel="Close confirmation"
      footer={
        <View style={styles.actions}>
          <GameButton
            label={cancelLabel}
            onPress={onCancel}
            disabled={busy}
            tone="secondary"
          />
          <GameButton
            label={confirmLabel}
            onPress={onConfirm}
            busy={busy}
            disabled={confirmDisabled}
            tone={confirmTone === 'destructive' ? 'danger' : 'primary'}
          />
        </View>
      }
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
            variant="title"
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
    fontSize: 28,
    lineHeight: 34,
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
  rowLabel: { flex: 1, fontSize: Typography.sizes.sm },
  rowValue: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  footnote: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
  },
  actions: { flexDirection: 'column', gap: Spacing.md, marginTop: Spacing.lg },
  button: {
    width: '100%',
    minHeight: 48,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
