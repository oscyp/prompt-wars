import { GameButton, GameFooter } from '@/components/game';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useRevealBeats } from '@/hooks/useRevealBeats';
import {
  BorderRadius,
  Ink,
  Motion,
  Scrim,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import type { BattleFormat, RewardSummary } from '@/types/battle';
import {
  REVEAL_DONE_LABEL,
  REVEAL_NEXT_LABEL,
  REVEAL_SKIP_LABEL,
  REVEAL_TAP_HINT,
  beatAnnouncement,
  hasJudgeContent,
  payoffFallbackLine,
  payoffRows,
  revealBeatsFor,
  stingPresetFor,
  verdictCopy,
  winnerBeatCopy,
  type RevealBeatKind,
  type RevealModel,
  type RevealOutcome,
} from '@/utils/revealBeats';
import {
  REVEAL_HEADER_OFFSET,
  REVEAL_TOP_BAR_HEIGHT,
  REVEAL_BOTTOM_BAR_HEIGHT,
  judgeBeatLabel,
  payoffBeatLabel,
} from '@/utils/revealLayout';
import RevealVerdictBeat from './RevealVerdictBeat';
import RevealWinnerBeat from './RevealWinnerBeat';
import RevealJudgeBeat from './RevealJudgeBeat';
import RevealPayoffBeat from './RevealPayoffBeat';

export interface RevealPortraits {
  meFighterUrl: string | null;
  meAvatarUrl: string | null;
  themFighterUrl: string | null;
  themAvatarUrl: string | null;
  meCosmetics?: EquippedCosmetics;
  themCosmetics?: EquippedCosmetics;
}

export interface RevealSequenceProps {
  model: RevealModel;
  format: BattleFormat;
  outcome: RevealOutcome;
  /** Rounds won, from the viewer's side. */
  mine: number;
  theirs: number;
  isBot: boolean;
  mode: string | null | undefined;
  myProfileId: string | null;
  /** Fresh signed renders from `useBattleCharacters`. */
  portraits: RevealPortraits;
  rating: { delta: number | null; line: string | null; gated: boolean };
  reward: RewardSummary | null;
  /** True once the battle row is `completed`, so a missing reward is final. */
  battleCompleted: boolean;
  onDone: () => void;
}

/**
 * Whether a screen reader is running. The reveal then paces itself like
 * Reduce Motion — nothing advances on its own and a Next button appears — so
 * VoiceOver is never talked over by a timer. Visuals still follow the motion
 * setting alone.
 */
function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (mounted) setEnabled(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return enabled;
}

/**
 * The series result as a cinematic sequence: verdict → winner → judge →
 * payoff, on one screen with an internal beat machine (`useRevealBeats`), so
 * back and exit-guard behaviour is untouched. Beats cross-fade; a tap on the
 * content advances; Skip ends it; the payoff waits for the player. Under
 * Reduce Motion there are no entering/exiting animations and a Next button
 * replaces the timer.
 */
export default function RevealSequence({
  model,
  format,
  outcome,
  mine,
  theirs,
  isBot,
  mode,
  portraits,
  rating,
  reward,
  battleCompleted,
  onDone,
}: RevealSequenceProps) {
  const colors = useThemedColors();
  const active = useBattlePresentationActive();
  const reduceMotion = useReducedMotion() || !active;
  const screenReader = useScreenReaderEnabled();
  const safe = useSafeAreaInsets();
  const manualPacing = reduceMotion || screenReader;

  const beats = useMemo(
    () => revealBeatsFor({ outcome, hasJudge: hasJudgeContent(model) }),
    [outcome, model],
  );
  const { index, current, isLast, autoAdvancing, next, skipAll } =
    useRevealBeats({
      beats,
      reduceMotion: manualPacing,
      enabled: active,
      onDone,
    });

  const insets = useMemo(() => ({ top: 16, bottom: 16 }), []);

  // --- Per-beat view models -------------------------------------------------
  const verdict = verdictCopy({
    format,
    outcome,
    mine,
    theirs,
    isKo: model.isKo,
  });
  const winnerIsMe = outcome === 'won';
  const winner = winnerIsMe ? model.me : model.them;
  const winnerColor =
    model.winnerColor ?? winner.signatureColor ?? colors.primary;
  const winnerCopy = winnerBeatCopy({
    name: winner.name,
    isMe: winnerIsMe,
    isKo: model.isKo,
    battleCry: winner.battleCry,
  });
  const sting = stingPresetFor({
    animationPreset: model.animationPreset,
    winnerMoveType: winner.moveType,
  });
  const winnerSide: 'me' | 'them' | null =
    outcome === 'draw' ? null : winnerIsMe ? 'me' : 'them';

  const rows = useMemo(
    () => payoffRows({ outcome, isBot, mode, rating, reward, battleCompleted }),
    [outcome, isBot, mode, rating, reward, battleCompleted],
  );
  const fallbackLine = payoffFallbackLine({ reward, battleCompleted });
  const pending = !reward && !battleCompleted;

  const announcement = current
    ? beatAnnouncement(current, {
        headline: current === 'winner' ? winnerCopy.name : verdict.headline,
      })
    : '';
  const stageLabel = labelFor(current, {
    announcement,
    battleCry: winnerCopy.battleCry,
    model,
    rows,
    fallbackLine,
  });

  useEffect(() => {
    if (!current || !active) return;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [current, announcement, active]);

  if (!current) return null;

  const renderBeat = (kind: RevealBeatKind) => {
    switch (kind) {
      case 'verdict':
        return (
          <RevealVerdictBeat
            format={format}
            outcome={outcome}
            mine={mine}
            theirs={theirs}
            isKo={model.isKo}
            reduceMotion={reduceMotion}
            insets={insets}
          />
        );
      case 'winner':
        return (
          <RevealWinnerBeat
            winner={winner}
            isMe={winnerIsMe}
            isKo={model.isKo}
            color={winnerColor}
            fighterUrl={
              winnerIsMe ? portraits.meFighterUrl : portraits.themFighterUrl
            }
            avatarUrl={
              winnerIsMe ? portraits.meAvatarUrl : portraits.themAvatarUrl
            }
            cosmetics={
              winnerIsMe ? portraits.meCosmetics : portraits.themCosmetics
            }
            sting={sting}
            reduceMotion={reduceMotion}
            insets={insets}
          />
        );
      case 'judge':
        return (
          <RevealJudgeBeat
            model={model}
            winnerSide={winnerSide}
            winnerColor={winnerColor}
            reduceMotion={reduceMotion}
            insets={insets}
          />
        );
      case 'payoff':
        return (
          <RevealPayoffBeat
            rows={rows}
            fallbackLine={fallbackLine}
            pending={pending}
            reduceMotion={reduceMotion}
            insets={insets}
          />
        );
    }
  };

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
      testID="reveal-sequence"
    >
      <View
        style={[
          styles.flowTopBar,
          { paddingTop: safe.top + REVEAL_HEADER_OFFSET },
        ]}
      >
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Part ${index + 1} of ${beats.length}`}
        >
          {beats.map((beat, i) => (
            <View
              key={beat}
              testID="reveal-progress-dot"
              style={[
                styles.progressDot,
                {
                  backgroundColor:
                    i === index ? colors.ornament : 'transparent',
                  borderColor: colors.ornament,
                  opacity: i < index ? 0.5 : 1,
                },
              ]}
            />
          ))}
        </View>
        <GameButton
          tone="secondary"
          label={REVEAL_SKIP_LABEL}
          onPress={skipAll}
        />
      </View>
      <Pressable
        style={styles.stage}
        onPress={next}
        accessible
        accessibilityRole="button"
        accessibilityLabel={stageLabel}
        accessibilityHint={isLast ? undefined : REVEAL_TAP_HINT}
        testID="reveal-stage"
      >
        <Animated.View
          key={current}
          style={styles.stage}
          entering={
            reduceMotion ? undefined : FadeIn.duration(Motion.durations.base)
          }
          exiting={
            reduceMotion ? undefined : FadeOut.duration(Motion.durations.base)
          }
        >
          {renderBeat(current)}
        </Animated.View>
      </Pressable>
      <GameFooter
        style={{ paddingHorizontal: 20, paddingBottom: safe.bottom + 12 }}
      >
        {isLast ? (
          <GameButton label={REVEAL_DONE_LABEL} onPress={next} />
        ) : manualPacing ? (
          <GameButton label={REVEAL_NEXT_LABEL} onPress={next} />
        ) : autoAdvancing ? (
          <GameButton tone="secondary" label={REVEAL_TAP_HINT} onPress={next} />
        ) : null}
      </GameFooter>
    </View>
  );
}

/** The one label a screen reader gets for the tappable stage. */
function labelFor(
  kind: RevealBeatKind | null,
  input: {
    announcement: string;
    battleCry: string | null;
    model: RevealModel;
    rows: ReturnType<typeof payoffRows>;
    fallbackLine: string | null;
  },
): string {
  switch (kind) {
    case 'winner':
      return input.battleCry
        ? `${input.announcement}. ${input.battleCry}`
        : input.announcement;
    case 'judge':
      return judgeBeatLabel(input.model);
    case 'payoff':
      return payoffBeatLabel(input.rows, input.fallbackLine);
    default:
      return input.announcement;
  }
}

const styles = StyleSheet.create({
  flowTopBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  root: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    height: REVEAL_TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Ink.onAccentLight,
  },
  skip: {
    minHeight: REVEAL_TOP_BAR_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  skipText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  bottomBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    minHeight: REVEAL_BOTTOM_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    alignSelf: 'stretch',
    minHeight: REVEAL_BOTTOM_BAR_HEIGHT,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  hintPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  hintText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
