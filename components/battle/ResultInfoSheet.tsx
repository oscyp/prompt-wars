import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';
import BottomSheet from '@/components/sheets/BottomSheet';
import { GamePanel, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { ResultRewardDetails } from './ResultRewards';
import type { ResultRewardsModel } from './resultRewardsView';

export interface ResultInfoContent {
  rewards: ResultRewardsModel;
  decisionExplanation: string | null;
  judgeLine: string | null;
  matchupNote: string | null;
  judgeNotesHistorical: boolean;
}

export interface ResultInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<View | null>;
  content: ResultInfoContent;
  onViewQuests: () => void;
}

export function hasResultInfo(content: ResultInfoContent): boolean {
  return Boolean(
    content.rewards.details.length ||
    content.rewards.hasQuestActivity ||
    content.decisionExplanation?.trim() ||
    content.judgeLine?.trim() ||
    content.matchupNote?.trim(),
  );
}

export default function ResultInfoSheet({
  visible,
  onClose,
  returnFocusRef,
  content,
  onViewQuests,
}: ResultInfoSheetProps) {
  const colors = useThemedColors();
  const navigateAfterDismiss = useRef(false);
  const handleViewQuests = () => {
    navigateAfterDismiss.current = true;
    onClose();
  };
  const handleDismiss = useCallback(() => {
    if (!navigateAfterDismiss.current) return;
    navigateAfterDismiss.current = false;
    onViewQuests();
  }, [onViewQuests]);
  const hasJudgeNotes = Boolean(
    content.judgeLine?.trim() || content.matchupNote?.trim(),
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismiss={handleDismiss}
      returnFocusRef={navigateAfterDismiss.current ? undefined : returnFocusRef}
      title="Result info"
      fixedHeading
      showHandle={false}
      closeAccessibilityLabel="Close result info"
      closeButtonLabel="Close result info"
    >
      <View style={{ gap: 20 }}>
        <ResultRewardDetails
          model={content.rewards}
          onViewQuests={handleViewQuests}
        />
        {content.decisionExplanation?.trim() ? (
          <GamePanel tone="quiet" style={{ gap: 8 }}>
            <GameText variant="title" accessibilityRole="header">
              How the result was decided
            </GameText>
            <GameText selectable style={{ color: colors.textSecondary }}>
              {content.decisionExplanation}
            </GameText>
          </GamePanel>
        ) : null}
        {hasJudgeNotes ? (
          <GamePanel tone="quiet" style={{ gap: 8 }}>
            <GameText variant="title" accessibilityRole="header">
              Judge’s notes
            </GameText>
            {content.judgeNotesHistorical ? (
              <GameText variant="caption" style={{ color: colors.warning }}>
                Before review
              </GameText>
            ) : null}
            {content.judgeLine?.trim() ? (
              <GameText selectable style={{ color: colors.textSecondary }}>
                {content.judgeLine}
              </GameText>
            ) : null}
            {content.matchupNote?.trim() ? (
              <GameText selectable style={{ color: colors.textSecondary }}>
                {content.matchupNote}
              </GameText>
            ) : null}
          </GamePanel>
        ) : null}
      </View>
    </BottomSheet>
  );
}
