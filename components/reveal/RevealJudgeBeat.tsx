import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Motion,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import { RUBRIC_LABELS } from '@/components/RubricBars';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';
import type { RubricScoreSet } from '@/types/battle';
import type { RevealModel, RevealSide } from '@/utils/revealBeats';
import {
  PROMPT_UNAVAILABLE_LINE,
  judgeCardsStacked,
  type RevealInsets,
} from '@/utils/revealLayout';

export interface RevealJudgeBeatProps {
  model: RevealModel;
  /** Which side won; null on a draw. */
  winnerSide: 'me' | 'them' | null;
  winnerColor: string;
  reduceMotion: boolean;
  insets: RevealInsets;
}

export const JUDGE_BEAT_TITLE = 'What the judge saw';

function isMoveType(v: string | null): v is MoveType {
  return v === 'attack' || v === 'defense' || v === 'finisher';
}

/**
 * Beat three: both prompts side by side (stacked on narrow screens), the
 * winner's card framed in the winner colour, the six rubric bars racing from
 * zero to their scores, and the judge's line. Without a rubric only the line
 * shows. Scrolls when Dynamic Type pushes it past the screen.
 */
export default function RevealJudgeBeat({
  model,
  winnerSide,
  winnerColor,
  reduceMotion,
  insets,
}: RevealJudgeBeatProps) {
  const colors = useThemedColors();
  const { width } = useWindowDimensions();
  const stacked = judgeCardsStacked(width);
  const hasRubric = Boolean(model.me.rubric || model.them.rubric);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={[styles.title, { color: colors.text }]}
        accessibilityRole="header"
      >
        {JUDGE_BEAT_TITLE}
      </Text>

      <View style={[styles.cards, stacked && styles.cardsStacked]}>
        <PromptCard
          side={model.me}
          isWinner={winnerSide === 'me'}
          winnerColor={winnerColor}
          reduceMotion={reduceMotion}
          delay={0}
        />
        <PromptCard
          side={model.them}
          isWinner={winnerSide === 'them'}
          winnerColor={winnerColor}
          reduceMotion={reduceMotion}
          delay={80}
        />
      </View>

      {hasRubric ? (
        <RacingRubricBars
          scores={model.me.rubric ?? {}}
          opponentScores={model.them.rubric ?? undefined}
          reduceMotion={reduceMotion}
        />
      ) : null}

      {model.judgeWhy ? (
        <Text style={[styles.quote, { color: colors.textSecondary }]}>
          “{model.judgeWhy}”
        </Text>
      ) : null}
    </ScrollView>
  );
}

function PromptCard({
  side,
  isWinner,
  winnerColor,
  reduceMotion,
  delay,
}: {
  side: RevealSide;
  isWinner: boolean;
  winnerColor: string;
  reduceMotion: boolean;
  delay: number;
}) {
  const colors = useThemedColors();
  const move = isMoveType(side.moveType) ? side.moveType : null;
  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isWinner ? winnerColor : colors.border,
          borderWidth: isWinner ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.duration(Motion.durations.base).delay(delay)
      }
    >
      <View style={styles.cardHead}>
        <Text
          style={[styles.cardName, { color: colors.text }]}
          numberOfLines={2}
        >
          {side.name}
        </Text>
        {isWinner ? (
          <Ionicons
            name="trophy"
            size={14}
            color={winnerColor}
            accessibilityLabel="Winner"
          />
        ) : null}
      </View>
      {move ? (
        <View style={styles.moveRow}>
          <Ionicons
            name={MOVE_META[move].icon}
            size={14}
            color={colors[move]}
          />
          <Text style={[styles.moveText, { color: colors.textSecondary }]}>
            {moveLabel(move)}
          </Text>
        </View>
      ) : null}
      <Text
        style={[styles.excerpt, { color: colors.textSecondary }]}
        numberOfLines={4}
      >
        {side.promptExcerpt ?? PROMPT_UNAVAILABLE_LINE}
      </Text>
    </Animated.View>
  );
}

/**
 * `RubricBars` with fills that grow from zero on mount. Same rows, same
 * legend, same screen-reader values as the original; only the fill is
 * animated, so the two stay interchangeable.
 */
function RacingRubricBars({
  scores,
  opponentScores,
  reduceMotion,
  max = 10,
}: {
  scores: Partial<RubricScoreSet>;
  opponentScores?: Partial<RubricScoreSet>;
  reduceMotion: boolean;
  max?: number;
}) {
  const colors = useThemedColors();
  const keys = Object.keys(RUBRIC_LABELS) as (keyof RubricScoreSet)[];
  const safeMax = Math.max(1, max);
  const hasOpponent = Boolean(opponentScores);

  return (
    <View style={styles.bars}>
      {hasOpponent ? (
        <View
          style={styles.legend}
          accessible
          accessibilityLabel="Legend: the thick bar is your score, the thin bar below it is the opponent's"
        >
          <View
            style={[styles.legendSwatch, { backgroundColor: colors.primary }]}
            importantForAccessibility="no"
          />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Your score
          </Text>
          <Text style={[styles.legendText, { color: colors.textTertiary }]}>
            ·
          </Text>
          <View
            style={[
              styles.legendSwatch,
              styles.legendSwatchThin,
              { backgroundColor: colors.textTertiary },
            ]}
            importantForAccessibility="no"
          />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Opponent
          </Text>
        </View>
      ) : null}
      {keys.map((k, i) => {
        const me = clamp(scores[k] ?? 0, safeMax);
        const opp = opponentScores
          ? clamp(opponentScores[k] ?? 0, safeMax)
          : null;
        return (
          <View
            key={k}
            style={styles.barRow}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={
              opp != null
                ? `${RUBRIC_LABELS[k]}: you ${me.toFixed(1)} out of ${safeMax}, opponent ${opp.toFixed(1)}`
                : `${RUBRIC_LABELS[k]}: ${me.toFixed(1)} out of ${safeMax}`
            }
            accessibilityValue={{ min: 0, max: safeMax, now: me }}
          >
            <Text style={[styles.barLabel, { color: colors.text }]}>
              {RUBRIC_LABELS[k]}
            </Text>
            <View
              style={[
                styles.track,
                {
                  backgroundColor: colors.backgroundTertiary,
                  borderColor: colors.border,
                },
              ]}
            >
              <RacingFill
                pct={(me / safeMax) * 100}
                color={colors.primary}
                delay={i * 60}
                reduceMotion={reduceMotion}
              />
            </View>
            {opp != null ? (
              <View
                style={[
                  styles.track,
                  styles.oppTrack,
                  {
                    backgroundColor: colors.backgroundTertiary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <RacingFill
                  pct={(opp / safeMax) * 100}
                  color={colors.textTertiary}
                  delay={i * 60 + 40}
                  reduceMotion={reduceMotion}
                />
              </View>
            ) : null}
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>
              {me.toFixed(1)}
              {opp != null ? ` vs ${opp.toFixed(1)}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RacingFill({
  pct,
  color,
  delay,
  reduceMotion,
}: {
  pct: number;
  color: string;
  delay: number;
  reduceMotion: boolean;
}) {
  const width = useSharedValue(reduceMotion ? pct : 0);

  useEffect(() => {
    if (reduceMotion) {
      width.value = pct;
      return;
    }
    width.value = withDelay(
      delay,
      withTiming(pct, {
        duration: Motion.durations.count,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [pct, delay, reduceMotion, width]);

  const style = useAnimatedStyle(() => ({
    width: `${width.value}%` as `${number}%`,
  }));

  return (
    <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />
  );
}

function clamp(n: number, max: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, max));
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  cards: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cardsStacked: {
    flexDirection: 'column',
  },
  card: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardName: {
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  moveText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  excerpt: {
    fontSize: Typography.sizes.sm,
    lineHeight: Typography.sizes.sm * 1.4,
  },
  bars: {
    width: '100%',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  legendSwatch: {
    width: 14,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  legendSwatchThin: {
    height: 4,
  },
  legendText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  barRow: {
    marginBottom: Spacing.sm,
  },
  barLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  track: {
    height: 10,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  oppTrack: {
    height: 4,
    marginTop: 3,
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  barValue: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  quote: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * 1.4,
    fontStyle: 'italic',
  },
});
