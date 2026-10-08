import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BattleRound } from '@/types/battle';
import { GameButton, GamePanel, GameText } from '@/components/game';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { inkFor } from '@/utils/contrast';
import { roundMiniView } from '@/utils/resultView';
import ResultInfoSheet, {
  hasResultInfo,
  type ResultInfoContent,
} from './ResultInfoSheet';
import RoundMoveReview from './RoundMoveReview';

export interface ResultDetailsProps {
  theme: string | null | undefined;
  isBo3: boolean;
  rounds: BattleRound[];
  myProfileId: string | null;
  playerOneId: string | null;
  noContest: boolean;
  info: ResultInfoContent;
  onViewQuests: () => void;
  onExplanationOpen?: (roundNumber: number) => void;
}

export default function ResultDetails({
  theme,
  isBo3,
  rounds,
  myProfileId,
  playerOneId,
  noContest,
  info,
  onViewQuests,
  onExplanationOpen,
}: ResultDetailsProps) {
  const colors = useThemedColors();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoOpener = useRef<View>(null);
  const hasInfo = hasResultInfo(info);
  if (!theme?.trim() && !isBo3 && !hasInfo) return null;

  return (
    <View style={styles.section}>
      {theme?.trim() ? <BattleThemePlaque theme={theme} /> : null}
      {isBo3 ? (
        <GamePanel tone="quiet" style={{ gap: 8 }}>
          <GameText variant="title" accessibilityRole="header">
            {noContest ? 'Played rounds' : 'Round by round'}
          </GameText>
          {noContest ? (
            <GameText style={{ color: colors.textSecondary }}>
              Shown for reference. The current series result is no contest.
            </GameText>
          ) : null}
          {rounds.length === 0 ? (
            <GameText style={{ color: colors.textSecondary }}>
              No round data yet.
            </GameText>
          ) : (
            rounds.map((round) => (
              <View key={round.id} style={{ gap: 12 }}>
                <RoundMiniCard
                  round={round}
                  myProfileId={myProfileId}
                  playerOneId={playerOneId}
                />
                <RoundMoveReview
                  round={round}
                  isPlayerOne={myProfileId === playerOneId}
                  onOpen={() => {
                    if (round.judge_payload?.explanation?.trim())
                      onExplanationOpen?.(round.round_number);
                  }}
                />
              </View>
            ))
          )}
        </GamePanel>
      ) : null}
      {hasInfo ? (
        <GameButton
          ref={infoOpener}
          label="Result info"
          tone="secondary"
          chrome="utility"
          onPress={() => {
            setInfoOpen(true);
            if (info.judgeLine?.trim() || info.decisionExplanation?.trim()) {
              onExplanationOpen?.(rounds[rounds.length - 1]?.round_number ?? 1);
            }
          }}
          accessibilityHint="Opens recorded progress and result explanations."
        />
      ) : null}
      <ResultInfoSheet
        visible={infoOpen && hasInfo}
        onClose={() => setInfoOpen(false)}
        returnFocusRef={infoOpener}
        content={info}
        onViewQuests={onViewQuests}
      />
    </View>
  );
}

/** Original server-owned round presentation, independent of the info sheet. */
function RoundMiniCard({
  round,
  myProfileId,
  playerOneId,
}: {
  round: BattleRound;
  myProfileId: string | null;
  playerOneId: string | null;
}) {
  const colors = useThemedColors();
  const view = roundMiniView(round, { myProfileId, playerOneId });
  const tone =
    view.outcome === 'won'
      ? colors.success
      : view.outcome === 'lost'
        ? colors.error
        : view.outcome === 'draw'
          ? colors.warning
          : colors.textTertiary;
  const icon: React.ComponentProps<typeof GameSymbol>['name'] =
    view.outcome === 'won'
      ? 'checkmark'
      : view.outcome === 'lost'
        ? 'close'
        : view.outcome === 'draw'
          ? 'remove'
          : 'time-outline';
  const title = `Round ${round.round_number} · ${view.status}${view.scoreLine ? ` · ${view.scoreLine}` : ''}`;
  return (
    <View
      style={[styles.miniCard, { borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${title}. ${view.hpLine}`}
    >
      <View style={[styles.miniBadge, { backgroundColor: tone }]}>
        <GameSymbol name={icon} size={18} color={inkFor(tone)} />
      </View>
      <View style={{ flex: 1 }}>
        <GameText
          style={[styles.miniTitle, NumericFontVariant, { color: colors.text }]}
        >
          {title}
        </GameText>
        <GameText
          style={[
            styles.miniLine,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {view.hpLine}
        </GameText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 20 },
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  miniBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  miniTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  miniLine: { fontSize: Typography.sizes.sm },
});
