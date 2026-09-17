import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { GameText as Text, GameButton } from '@/components/game';
import BottomSheet from '@/components/sheets/BottomSheet';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { blockUser, reportContent, ReportContentParams } from '@/utils/safety';

/**
 * Report-and-block sheet.
 *
 * App Store guideline 1.2 requires user-generated-content apps to offer BOTH
 * reporting and blocking. `blockUser()` existed in utils/safety.ts with zero
 * callers, and the only report affordance hardcoded reason 'inappropriate' and
 * never set `apply_block` — so blocking was unreachable from the UI.
 *
 * `report-intake` already accepts `apply_block` and performs the block in the
 * same call, so one request covers both. Pass `reportedProfileId` whenever it
 * is known: the server can only derive the target itself for
 * `reported_type: 'profile'`, so blocking a battle opponent needs it supplied.
 */

const REASONS: {
  value: ReportContentParams['reason'];
  label: string;
  hint: string;
}[] = [
  {
    value: 'inappropriate',
    label: 'Inappropriate content',
    hint: 'Sexual, violent, or disturbing material',
  },
  {
    value: 'harassment',
    label: 'Harassment or hate',
    hint: 'Targeted abuse, threats, or slurs',
  },
  { value: 'cheating', label: 'Cheating', hint: 'Win-trading or exploits' },
  { value: 'spam', label: 'Spam', hint: 'Repetitive or advertising content' },
];

export interface ReportBlockSheetProps {
  visible: boolean;
  onClose: () => void;
  reportedType: ReportContentParams['reportedType'];
  reportedId: string;
  /** Opponent profile id. Required for blocking anything but a profile report. */
  reportedProfileId?: string;
  /** Shown in the title, e.g. "this battle" or a display name. */
  subjectLabel?: string;
  onDone?: (blocked: boolean) => void;
  returnFocusRef?: React.RefObject<View | null>;
}

export default function ReportBlockSheet({
  visible,
  onClose,
  reportedType,
  reportedId,
  reportedProfileId,
  subjectLabel = 'this content',
  onDone,
  returnFocusRef,
}: ReportBlockSheetProps) {
  const colors = useThemedColors();
  const [reason, setReason] =
    useState<ReportContentParams['reason']>('inappropriate');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Blocking needs a target profile. The server derives it only when the
  // report itself is about a profile.
  const canBlock = Boolean(reportedProfileId) || reportedType === 'profile';

  useEffect(() => {
    if (!visible) return;
    setReason('inappropriate');
    setAlsoBlock(false);
    setIsSubmitting(false);
  }, [visible]);

  const blockOnly = async () => {
    const profileId =
      reportedProfileId || (reportedType === 'profile' ? reportedId : null);
    if (!profileId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await blockUser(profileId);
      onClose();
      onDone?.(true);
      Alert.alert(
        'Player blocked',
        'You will not be matched with this player again.',
      );
    } catch (error) {
      Alert.alert(
        'Could not block player',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const result = await reportContent({
        reportedType,
        reportedId,
        reportedProfileId,
        reason,
        applyBlock: alsoBlock && canBlock,
      });
      onClose();
      onDone?.(result.blocked);
      Alert.alert(
        result.blocked ? 'Reported and blocked' : 'Report submitted',
        result.blocked
          ? 'We will review this. You will not be matched with this player again.'
          : 'Thanks — our team will review this within 24 hours.',
      );
    } catch (err) {
      setIsSubmitting(false);
      Alert.alert(
        'Could not submit',
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissDisabled={isSubmitting}
      closeAccessibilityLabel="Close report options"
      title="Report"
      returnFocusRef={returnFocusRef}
      footer={
        <View style={{ gap: 12 }}>
          <GameButton
            label={alsoBlock && canBlock ? 'Report & block' : 'Submit report'}
            accessibilityLabel="Submit report"
            tone="danger"
            onPress={submit}
            busy={isSubmitting}
          />
          <GameButton
            label="Cancel"
            tone="secondary"
            onPress={onClose}
            disabled={isSubmitting}
          />
        </View>
      }
    >
      <Text style={[styles.subject, { color: colors.text }]}>
        {subjectLabel}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Tell us what is wrong so we can review it.
      </Text>

      <View
        style={styles.reasons}
        accessibilityRole="radiogroup"
        accessibilityLabel="Reason for reporting"
      >
        {REASONS.map((r) => {
          const selected = r.value === reason;
          return (
            <Pressable
              key={r.value}
              onPress={() => setReason(r.value)}
              disabled={isSubmitting}
              accessibilityRole="radio"
              accessibilityState={{
                selected,
                checked: selected,
                disabled: isSubmitting,
              }}
              accessibilityLabel={r.label}
              style={[
                styles.reason,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected
                    ? colors.backgroundTertiary
                    : 'transparent',
                },
              ]}
            >
              <Text style={[styles.reasonLabel, { color: colors.text }]}>
                {r.label}
              </Text>
              <Text
                style={[styles.reasonHint, { color: colors.textSecondary }]}
              >
                {r.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {canBlock && (
        <Pressable
          onPress={() => setAlsoBlock((v) => !v)}
          disabled={isSubmitting}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: alsoBlock }}
          accessibilityLabel="Also block this player"
          style={[
            styles.blockRow,
            {
              borderColor: alsoBlock ? colors.primary : colors.border,
              backgroundColor: alsoBlock
                ? colors.backgroundTertiary
                : 'transparent',
            },
          ]}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: alsoBlock ? colors.primary : colors.border,
                backgroundColor: alsoBlock ? colors.primary : 'transparent',
              },
            ]}
          >
            {alsoBlock && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.blockCopy}>
            <Text style={[styles.reasonLabel, { color: colors.text }]}>
              Also block this player
            </Text>
            <Text style={[styles.reasonHint, { color: colors.textSecondary }]}>
              You will never be matched with them again
            </Text>
          </View>
        </Pressable>
      )}

      {canBlock ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Block player without reporting"
          disabled={isSubmitting}
          onPress={blockOnly}
          style={[styles.blockRow, { borderColor: colors.border }]}
        >
          <Text style={[styles.reasonLabel, { color: colors.text }]}>
            Block player without reporting
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '90%',
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
  subject: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  reasons: { gap: Spacing.sm },
  reason: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  reasonLabel: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  reasonHint: { fontSize: Typography.sizes.xs, marginTop: 1 },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    minHeight: 48,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#171225',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  blockCopy: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  button: {
    flex: 1,
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
