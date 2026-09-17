/** Frozen, pure combat rules used by both live resolution and appeal reconstruction. */
import { moveTypePoints } from './judge.ts';
import type { MoveType } from './types.ts';
export interface CombatStats {
  strength: number;
  stamina: number;
  agility: number;
  focus: number;
}
export type CombatWinner = 1 | 2 | null;
export function statModifier(
  self: CombatStats,
  opp: CombatStats,
  version = 1,
): number {
  const raw =
    version >= 2
      ? 0.005 * (self.strength - opp.strength) +
        0.0025 * (self.focus - opp.focus)
      : (self.strength - opp.strength) / 20 + (self.focus - opp.focus) / 40;
  return Math.max(-0.05, Math.min(0.05, raw));
}
export function combatDamage(
  gap: number,
  attacker: CombatStats,
  defender: CombatStats,
  version = 1,
): number {
  const raw = 12 + Math.abs(gap) * 2.2 + (attacker.strength - 5) * 1.5;
  const evasion =
    version >= 2
      ? Math.min(0.18, 0.02 * Math.max(defender.agility - attacker.agility, 0))
      : 0;
  return Math.max(8, Math.min(60, Math.round(raw * (1 - evasion))));
}
export function hpMax(stamina: number): number {
  return 60 + 8 * stamina;
}
export interface CombatRoundInput {
  rulesVersion?: number;
  playerOne: CombatStats;
  playerTwo: CombatStats;
  playerOneBase: number;
  playerTwoBase: number;
  playerOneMove: MoveType;
  playerTwoMove: MoveType;
  playerOneHp: number;
  playerTwoHp: number;
  forfeitWinner?: CombatWinner;
}
export function resolveCombatRound(i: CombatRoundInput) {
  const playerOneStatModifier = statModifier(
    i.playerOne,
    i.playerTwo,
    i.rulesVersion,
  );
  const playerTwoStatModifier = statModifier(
    i.playerTwo,
    i.playerOne,
    i.rulesVersion,
  );
  const playerOneMovePoints = moveTypePoints(i.playerOneMove, i.playerTwoMove);
  const playerTwoMovePoints = moveTypePoints(i.playerTwoMove, i.playerOneMove);
  const playerOneScore = i.forfeitWinner
    ? 0
    : Math.max(
        0,
        i.playerOneBase * (1 + playerOneStatModifier) + playerOneMovePoints,
      );
  const playerTwoScore = i.forfeitWinner
    ? 0
    : Math.max(
        0,
        i.playerTwoBase * (1 + playerTwoStatModifier) + playerTwoMovePoints,
      );
  const scoreGap = i.forfeitWinner
    ? 7
    : Math.abs(playerOneScore - playerTwoScore);
  const isDraw = !i.forfeitWinner && scoreGap < 3;
  const winner: CombatWinner =
    i.forfeitWinner ??
    (isDraw ? null : playerOneScore > playerTwoScore ? 1 : 2);
  const playerOneDamage =
    winner === 2
      ? combatDamage(scoreGap, i.playerTwo, i.playerOne, i.rulesVersion)
      : 0;
  const playerTwoDamage =
    winner === 1
      ? combatDamage(scoreGap, i.playerOne, i.playerTwo, i.rulesVersion)
      : 0;
  const playerOneHpAfter = Math.max(0, i.playerOneHp - playerOneDamage);
  const playerTwoHpAfter = Math.max(0, i.playerTwoHp - playerTwoDamage);
  const isKo =
    !isDraw &&
    scoreGap >= 7 &&
    ((winner === 1 && playerTwoHpAfter <= 0) ||
      (winner === 2 && playerOneHpAfter <= 0));
  return {
    winner,
    isDraw,
    isKo,
    scoreGap,
    playerOneScore,
    playerTwoScore,
    playerOneStatModifier,
    playerTwoStatModifier,
    playerOneMovePoints,
    playerTwoMovePoints,
    playerOneDamage,
    playerTwoDamage,
    playerOneHpAfter,
    playerTwoHpAfter,
  };
}
export interface CombatSeriesInput {
  rulesVersion?: number;
  roundsPlayed: number;
  bestOf: number;
  playerOneWins: number;
  playerTwoWins: number;
  playerOneHp: number;
  playerTwoHp: number;
  playerOneHpMax: number;
  playerTwoHpMax: number;
  playerOneTotal: number;
  playerTwoTotal: number;
  koWinner: CombatWinner;
}
export function resolveCombatSeries(i: CombatSeriesInput): {
  complete: boolean;
  winner: CombatWinner;
  isDraw: boolean;
  decidingRule: string;
  comparison: Record<string, number>;
} {
  const finish = (
    winner: CombatWinner,
    decidingRule: string,
    comparison: Record<string, number> = {},
  ) => ({
    complete: true,
    winner,
    isDraw: winner === null,
    decidingRule,
    comparison,
  });
  if (i.koWinner) return finish(i.koWinner, 'ko');
  const required = Math.ceil(i.bestOf / 2);
  if (i.playerOneWins >= required || i.playerTwoWins >= required)
    return finish(i.playerOneWins >= required ? 1 : 2, 'round_majority', {
      player_one: i.playerOneWins,
      player_two: i.playerTwoWins,
    });
  if (i.roundsPlayed < i.bestOf)
    return {
      complete: false,
      winner: null,
      isDraw: false,
      decidingRule: 'next_round',
      comparison: {},
    };
  if ((i.rulesVersion ?? 1) >= 2 && i.playerOneWins !== i.playerTwoWins)
    return finish(i.playerOneWins > i.playerTwoWins ? 1 : 2, 'round_wins', {
      player_one: i.playerOneWins,
      player_two: i.playerTwoWins,
    });
  const v2 = (i.rulesVersion ?? 1) >= 2;
  const p1 = v2 ? i.playerOneHp / i.playerOneHpMax : i.playerOneHp;
  const p2 = v2 ? i.playerTwoHp / i.playerTwoHpMax : i.playerTwoHp;
  if (Math.abs(p1 - p2) > 1e-12)
    return finish(
      p1 > p2 ? 1 : 2,
      v2 ? 'remaining_hp_percentage' : 'remaining_hp',
      { player_one: p1, player_two: p2 },
    );
  if (i.playerOneTotal !== i.playerTwoTotal)
    return finish(
      i.playerOneTotal > i.playerTwoTotal ? 1 : 2,
      'cumulative_score',
      { player_one: i.playerOneTotal, player_two: i.playerTwoTotal },
    );
  return finish(null, 'draw', {
    player_one: i.playerOneTotal,
    player_two: i.playerTwoTotal,
  });
}
/** Only call when opening a round; never overwrite an assigned deadline. */
export function roundDeadline(
  now: number,
  mode: string | null | undefined,
  isBot: boolean,
  version = 1,
  round = 1,
): string {
  const minutes =
    version >= 2
      ? isBot || mode === 'bot'
        ? 120
        : 1440
      : mode === 'ranked' && round === 1
        ? 45
        : 120;
  return new Date(now + minutes * 60000).toISOString();
}
