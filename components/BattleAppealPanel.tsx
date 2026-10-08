import React from 'react';
import { Alert } from 'react-native';
import { GamePanel, GameText as Text, GameButton } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { appealPanelState } from '@/utils/appeals';
import type { useBattleAppeal } from '@/hooks/useBattleAppeal';
export function BattleAppealPanel({
  review,
}: {
  review: ReturnType<typeof useBattleAppeal>;
}) {
  const colors = useThemedColors();
  const status = review.data?.appeal?.review_status;
  const panel = appealPanelState(review.data, review.loading, review.error);
  return (
    <GamePanel style={{ marginVertical: 16, gap: 8 }}>
      <Text variant="title" accessibilityRole="header">
        Independent review
      </Text>
      <Text style={{ color: colors.text }} accessibilityLiveRegion="polite">
        {panel.message}
      </Text>
      {review.error ? (
        <GameButton
          tone="secondary"
          label="Retry appeal status"
          onPress={() => void review.refresh()}
        />
      ) : null}
      {!status ? (
        <GameButton
          tone="secondary"
          label="Appeal result"
          disabled={!panel.canSubmit}
          busy={review.loading}
          onPress={() =>
            Alert.alert(
              'Appeal this result?',
              'An independent calibrated model reviews each played round. One appeal per day.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Appeal', onPress: () => void review.submit() },
              ],
            )
          }
        />
      ) : null}
    </GamePanel>
  );
}
