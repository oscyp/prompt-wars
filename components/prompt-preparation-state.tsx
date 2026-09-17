import { GameText as Text, GameButton, GamePanel } from '@/components/game';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Layout,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';

export const PROMPT_PREPARATION_GRACE_MS = 350;
export const PROMPT_PREPARATION_SLOW_MS = 5000;

export interface PromptPreparationStateProps {
  fighterName: string;
  moveType: MoveType;
  generating: boolean;
  onWriteOwn: () => void;
}

/**
 * A short, themed anticipation state for the first suggestion set.
 *
 * Fast indexed reads never flash a loader. A real generation call appears
 * immediately because it is expected to take a few seconds, then changes its
 * copy after five seconds without inventing a percentage. Writing remains
 * available throughout, so suggestions never block the player's turn.
 */
export default function PromptPreparationState({
  fighterName,
  moveType,
  generating,
  onWriteOwn,
}: PromptPreparationStateProps) {
  const colors = useThemedColors();
  const [visible, setVisible] = useState(generating);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (generating) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(
      () => setVisible(true),
      PROMPT_PREPARATION_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [generating]);

  useEffect(() => {
    setSlow(false);
    if (!generating) return;
    const timer = setTimeout(() => setSlow(true), PROMPT_PREPARATION_SLOW_MS);
    return () => clearTimeout(timer);
  }, [generating]);

  if (!visible) {
    return <View testID="prompt-preparation-grace" />;
  }

  const statusLabel = generating
    ? `Preparing three prompt ideas for ${fighterName}'s ${moveLabel(moveType)} move`
    : 'Loading prompt ideas already prepared for this move';

  return (
    <GamePanel
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID="prompt-preparation"
    >
      <View
        style={styles.status}
        accessible
        accessibilityLabel={statusLabel}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: true }}
      >
        <View
          style={[styles.icon, { backgroundColor: colors.backgroundTertiary }]}
        >
          <GameSymbol name="sparkles" size={24} color={colors.primary} />
        </View>
        <Text variant="title" style={[styles.title, { color: colors.text }]}>
          {generating ? 'Preparing your ideas' : 'Loading your ideas'}
        </Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          {generating
            ? `Tailoring three prompts to ${fighterName}, your ${moveLabel(moveType).toLowerCase()} move, and this battle’s theme.`
            : 'Checking for ideas already prepared for this move.'}
        </Text>
        <Text
          style={[
            styles.waitHint,
            { color: slow ? colors.warning : colors.textTertiary },
          ]}
          accessibilityLiveRegion={slow ? 'polite' : 'none'}
        >
          {slow
            ? 'Still working — personalized ideas can take a little longer.'
            : 'Usually ready in a few seconds.'}
        </Text>
      </View>

      <View
        style={styles.ideaPreview}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.ideaLine,
              { backgroundColor: colors.backgroundTertiary },
            ]}
            testID="prompt-preparation-line"
          />
        ))}
      </View>

      <GameButton
        tone="secondary"
        label="Write your own now"
        icon="create-outline"
        onPress={onWriteOwn}
        accessibilityLabel="Write your own prompt now"
        accessibilityHint="Starts the prompt editor while ideas continue preparing"
      />
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  status: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  detail: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  waitHint: {
    minHeight: 18,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  ideaPreview: {
    gap: Spacing.sm,
  },
  ideaLine: {
    height: 10,
    borderRadius: BorderRadius.full,
  },
  writeButton: {
    minHeight: Layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  writeButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
