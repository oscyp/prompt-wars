import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import HPBar from '@/components/HPBar';
import PortraitPreview from '@/components/PortraitPreview';
import type { ShareCardFighter } from '@/components/ResultShareCard';
import BrandMark from '@/components/game/BrandMark';
import { GamePanel, GameText } from '@/components/game';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import {
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { inkFor } from '@/utils/contrast';

export interface ResultVerdictFighter
  extends
    Pick<ShareCardFighter, 'name'>,
    Partial<Omit<ShareCardFighter, 'name'>> {
  role?: 'You' | 'Opponent' | 'AI opponent';
  isBot?: boolean;
}

export interface ResultVerdictHp {
  current: number;
  max: number;
}

export interface ResultVerdictProps {
  outcome: 'won' | 'lost' | 'draw' | 'no_contest';
  isKo: boolean;
  scoreLine?: string | null;
  ratingLine?: string | null;
  adjudicationRevision?: number;
  me?: ResultVerdictFighter;
  them?: ResultVerdictFighter;
  winnerSide?: 'me' | 'them' | null;
  exhibition?: boolean;
  finalHp?: {
    me?: ResultVerdictHp;
    them?: ResultVerdictHp;
  } | null;
}

interface FinalHpRound {
  player_one_hp_after?: number | null;
  player_two_hp_after?: number | null;
}

interface FinalHpBattle {
  player_one_hp_max?: number | null;
  player_two_hp_max?: number | null;
}

export function resultFinalHp({
  round,
  battle,
  isPlayerOne,
  noContest,
}: {
  round: FinalHpRound | null | undefined;
  battle: FinalHpBattle;
  isPlayerOne: boolean;
  noContest: boolean;
}): ResultVerdictProps['finalHp'] {
  if (noContest || !round) return null;
  const p1 = {
    current: round.player_one_hp_after,
    max: battle.player_one_hp_max,
  };
  const p2 = {
    current: round.player_two_hp_after,
    max: battle.player_two_hp_max,
  };
  if (
    p1.current == null ||
    p1.max == null ||
    p2.current == null ||
    p2.max == null ||
    !Number.isFinite(p1.current) ||
    !Number.isFinite(p1.max) ||
    !Number.isFinite(p2.current) ||
    !Number.isFinite(p2.max) ||
    p1.max <= 0 ||
    p2.max <= 0
  )
    return null;
  const playerOne = { current: p1.current, max: p1.max };
  const playerTwo = { current: p2.current, max: p2.max };
  return isPlayerOne
    ? { me: playerOne, them: playerTwo }
    : { me: playerTwo, them: playerOne };
}

const AVATAR_SIZE = 68;
const REFLOW_WIDTH = 300;

function isKnownHp(
  value: ResultVerdictHp | undefined,
): value is ResultVerdictHp {
  return Boolean(
    value &&
    Number.isFinite(value.current) &&
    Number.isFinite(value.max) &&
    value.max > 0,
  );
}

/** Current adjudication; export artwork remains a separate full-size surface. */
export default function ResultVerdict({
  outcome,
  isKo: originalKo,
  scoreLine: originalScore,
  ratingLine,
  adjudicationRevision = 0,
  me,
  them,
  winnerSide: originalWinner,
  exhibition = false,
  finalHp,
}: ResultVerdictProps) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const availableWidth = measuredWidth ?? Math.max(0, width - Spacing.md * 2);
  const reflow = availableWidth < REFLOW_WIDTH || fontScale > 1.15;
  const noContest = outcome === 'no_contest';
  const isKo = !noContest && originalKo;
  const scoreLine = noContest ? null : originalScore;
  const winnerSide = noContest || outcome === 'draw' ? null : originalWinner;
  const knownHp =
    !noContest && isKnownHp(finalHp?.me) && isKnownHp(finalHp?.them)
      ? { me: finalHp.me, them: finalHp.them }
      : null;
  const color =
    outcome === 'won'
      ? colors.success
      : outcome === 'lost'
        ? colors.error
        : colors.warning;
  const heading = {
    won: 'Victory',
    lost: 'Defeat',
    draw: 'Draw',
    no_contest: 'No contest',
  }[outcome];

  return (
    <GamePanel tone="ornate" style={styles.panel}>
      <BrandMark size={132} />
      <GameText
        variant="display"
        accessibilityRole="header"
        style={[styles.heading, { color }]}
      >
        {heading}
      </GameText>

      {me && them ? (
        <View
          testID="result-matchup"
          onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
          style={[styles.matchup, reflow && styles.matchupReflow]}
        >
          <Fighter
            side="me"
            fighter={me}
            isWinner={winnerSide === 'me'}
            hp={knownHp?.me}
            reflow={reflow}
          />
          {!noContest ? (
            <ScoreCluster
              scoreLine={scoreLine}
              isKo={isKo}
              color={color}
              reflow={reflow}
            />
          ) : null}
          <Fighter
            side="them"
            fighter={them}
            isWinner={winnerSide === 'them'}
            hp={knownHp?.them}
            reflow={reflow}
          />
        </View>
      ) : null}

      {exhibition ? (
        <GameText style={[styles.supporting, { color: colors.warning }]}>
          Unrated exhibition — backup judge used; rating and competitive streak
          unchanged.
        </GameText>
      ) : null}
      {adjudicationRevision > 0 ? (
        <GameText
          variant="caption"
          style={[styles.supporting, { color: colors.textSecondary }]}
        >
          Reviewed result · revision {adjudicationRevision}
        </GameText>
      ) : null}
      {adjudicationRevision > 0 && ratingLine ? (
        <GameText
          variant="caption"
          style={[styles.supporting, { color: colors.textSecondary }]}
        >
          {ratingLine}
        </GameText>
      ) : null}
    </GamePanel>
  );
}

function Fighter({
  side,
  fighter,
  isWinner,
  hp,
  reflow,
}: {
  side: 'me' | 'them';
  fighter: ResultVerdictFighter;
  isWinner: boolean;
  hp?: ResultVerdictHp;
  reflow: boolean;
}) {
  const colors = useThemedColors();
  const archetype = fighter.archetype ?? 'strategist';
  const accent = fighter.signatureColor ?? colors.primary;
  const uri = fighter.avatarUrl ?? archetypeIllustrationUri(archetype) ?? '';
  const role = fighter.isBot
    ? 'AI opponent · Practice'
    : (fighter.role ?? (side === 'me' ? 'You' : 'Opponent'));

  return (
    <View
      testID={`result-fighter-${side}`}
      style={[styles.fighter, reflow && styles.fighterReflow]}
    >
      <View style={styles.avatarWrap}>
        <PortraitPreview
          uri={uri}
          size={AVATAR_SIZE}
          frame={fighter.cosmetics?.frame}
          avatarEffect={fighter.cosmetics?.avatarEffect}
          accentColor={accent}
          accessibilityLabel={`${fighter.name} — ${archetype} portrait`}
        />
        {isWinner ? (
          <View
            testID={`result-winner-${side}`}
            style={[styles.winner, { backgroundColor: accent }]}
            accessible
            accessibilityLabel={`${fighter.name}, winner`}
          >
            <GameSymbol name="trophy" size={12} color={inkFor(accent)} />
          </View>
        ) : null}
      </View>
      <GameText
        variant="caption"
        style={[styles.role, { color: colors.textTertiary }]}
      >
        {role}
      </GameText>
      <GameText variant="fighter" style={[styles.name, { color: colors.text }]}>
        {fighter.name}
      </GameText>
      <GameText variant="caption" style={[styles.archetype, { color: accent }]}>
        {archetype.toUpperCase()}
      </GameText>
      {hp ? (
        <HPBar
          current={hp.current}
          max={hp.max}
          side={side === 'me' ? 'left' : 'right'}
          playerName={fighter.name}
          showName={false}
          compact
        />
      ) : null}
    </View>
  );
}

function ScoreCluster({
  scoreLine,
  isKo,
  color,
  reflow,
}: {
  scoreLine: string | null | undefined;
  isKo: boolean;
  color: string;
  reflow: boolean;
}) {
  const label = scoreLine
    ? `Series score ${scoreLine}.${isKo ? ' Knockout.' : ''}`
    : `Versus.${isKo ? ' Knockout.' : ''}`;
  return (
    <View
      testID="result-score-cluster"
      accessible
      accessibilityLabel={label}
      style={[styles.scoreCluster, reflow && styles.scoreClusterReflow]}
    >
      <GameText
        variant={scoreLine ? 'title' : 'label'}
        numberOfLines={1}
        style={[styles.score, NumericFontVariant]}
      >
        {scoreLine ?? 'VS'}
      </GameText>
      {isKo ? (
        <View style={[styles.ko, { borderColor: color }]}>
          <GameText variant="caption" style={[styles.koText, { color }]}>
            KO
          </GameText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 12,
  },
  heading: { textAlign: 'center' },
  matchup: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  matchupReflow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  fighter: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    width: 0,
    minWidth: 0,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  fighterReflow: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  winner: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  role: {
    textAlign: 'center',
    fontWeight: Typography.weights.semibold,
  },
  name: {
    fontSize: 22,
    lineHeight: 27,
    textAlign: 'center',
  },
  archetype: {
    textAlign: 'center',
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  scoreCluster: {
    minWidth: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingTop: 18,
  },
  scoreClusterReflow: {
    alignSelf: 'center',
    paddingTop: 0,
  },
  score: {
    flexShrink: 0,
    textAlign: 'center',
  },
  ko: {
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  koText: {
    fontWeight: Typography.weights.bold,
    letterSpacing: 1.2,
  },
  supporting: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
