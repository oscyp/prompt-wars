import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
} from '@/constants/DesignTokens';
import { reportContent, ReportContentParams } from '@/utils/safety';

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
}

export default function ReportBlockSheet({
  visible,
  onClose,
  reportedType,
  reportedId,
  reportedProfileId,
  subjectLabel = 'this content',
  onDone,
}: ReportBlockSheetProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(420)).current;

  const [reason, setReason] = useState<ReportContentParams['reason']>(
    'inappropriate',
  );
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
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }
    translateY.setValue(420);
    Animated.timing(translateY, {
      toValue: 0,
      duration: Motion.durations.base,
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, translateY]);

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
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={isSubmitting ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Close report options"
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
          Report {subjectLabel}
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
                accessibilityState={{ selected }}
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
              <Text
                style={[styles.reasonHint, { color: colors.textSecondary }]}
              >
                You will never be matched with them again
              </Text>
            </View>
          </Pressable>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={[
              styles.button,
              { backgroundColor: colors.backgroundTertiary },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Submit report"
            style={[
              styles.button,
              { backgroundColor: colors.error, opacity: isSubmitting ? 0.6 : 1 },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, { color: '#fff' }]}>
                {alsoBlock && canBlock ? 'Report & block' : 'Submit report'}
              </Text>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
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
  reasons: { gap: Spacing.sm },
  reason: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
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
    minHeight: 44,
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
    color: '#fff',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  blockCopy: { flex: 1 },
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
