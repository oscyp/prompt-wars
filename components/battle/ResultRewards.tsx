import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  CreditAmount,
  GameButton,
  GameIcon,
  GamePanel,
  GameText,
  type GameIconName,
} from '@/components/game';
import {
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { ResultRewardsModel } from './resultRewardsView';

const itemIcons: Record<
  ResultRewardsModel['items'][number]['kind'],
  GameIconName
> = {
  rating: 'stats',
  'rating-correction': 'replay',
  credits: 'crystal',
  streak: 'flame',
  'quests-completed': 'scroll',
  'quests-advanced': 'scroll',
};

export function resultRewardsHorizontal(width: number, fontScale: number) {
  return width >= 390 && fontScale <= 1.15;
}

export default function ResultRewards({
  model,
}: {
  model: ResultRewardsModel;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const horizontal = resultRewardsHorizontal(width, fontScale);

  if (model.state === 'empty') return null;
  const accessibilityLabel = [
    model.title,
    model.feedback,
    ...model.items.map((item) =>
      item.kind === 'credits'
        ? `${item.label}: plus ${item.amount} credits`
        : `${item.label}: ${item.value}`,
    ),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <GamePanel
      tone="quiet"
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.panel}
    >
      <GameText variant="title" accessibilityRole="header">
        {model.title}
      </GameText>
      {model.feedback ? (
        <GameText
          selectable
          accessibilityLiveRegion="polite"
          style={{ color: colors.textSecondary }}
        >
          {model.feedback}
        </GameText>
      ) : null}
      {model.items.length > 0 ? (
        <View
          testID="result-rewards-grid"
          style={{
            flexDirection: horizontal ? 'row' : 'column',
            flexWrap: horizontal ? 'wrap' : 'nowrap',
            gap: 12,
          }}
        >
          {model.items.map((item) => {
            const tone =
              item.tone === 'up'
                ? colors.success
                : item.tone === 'down'
                  ? colors.error
                  : colors.text;
            return (
              <View
                key={item.kind}
                testID={`result-reward-${item.kind}`}
                style={[
                  styles.item,
                  horizontal ? styles.itemHorizontal : undefined,
                ]}
              >
                {item.kind === 'credits' ? null : (
                  <GameIcon
                    name={itemIcons[item.kind]}
                    size={24}
                    color={tone}
                  />
                )}
                <View style={styles.itemText}>
                  <GameText
                    variant="caption"
                    style={{ color: colors.textSecondary }}
                  >
                    {item.label}
                  </GameText>
                  {item.kind === 'credits' ? (
                    <CreditAmount
                      amount={item.amount ?? null}
                      signed
                      size="large"
                    />
                  ) : (
                    <GameText
                      variant="title"
                      style={[
                        styles.value,
                        NumericFontVariant,
                        { color: tone },
                      ]}
                    >
                      {item.value}
                    </GameText>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </GamePanel>
  );
}

/** Null is deliberate: ResultMediaSection uses it to omit the whole slot. */
export function resultRewardsNode(model: ResultRewardsModel): React.ReactNode {
  return model.state === 'empty' ? null : <ResultRewards model={model} />;
}

export function ResultRewardDetails({
  model,
  onViewQuests,
}: {
  model: ResultRewardsModel;
  onViewQuests: () => void;
}) {
  const colors = useThemedColors();
  if (model.details.length === 0 && !model.hasQuestActivity) return null;

  return (
    <GamePanel tone="quiet" style={styles.details}>
      <GameText variant="title" accessibilityRole="header">
        Recorded progress
      </GameText>
      {model.details.map((detail) => (
        <View key={detail.kind} style={styles.detail}>
          <GameText variant="caption" style={{ color: colors.textTertiary }}>
            {detail.label}
          </GameText>
          <GameText selectable style={{ color: colors.textSecondary }}>
            {detail.value}
          </GameText>
        </View>
      ))}
      {model.hasQuestActivity ? (
        <GameButton
          label="View quests"
          tone="secondary"
          chrome="utility"
          onPress={onViewQuests}
        />
      ) : null}
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  item: {
    minWidth: 0,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  itemHorizontal: { flexBasis: '47%', flexGrow: 1 },
  itemText: { minWidth: 0, flex: 1, gap: 2 },
  value: {
    fontSize: Typography.sizes.xl,
    flexShrink: 1,
  },
  details: { gap: 12 },
  detail: { gap: 4 },
});
