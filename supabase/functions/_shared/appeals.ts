import {
  hpMax,
  resolveCombatRound,
  resolveCombatSeries,
  type CombatStats,
  type CombatWinner,
} from './combat.ts';
import type { MoveType } from './types.ts';
export interface AppealRound {
  playerOneBase: number;
  playerTwoBase: number;
  playerOneMove: MoveType;
  playerTwoMove: MoveType;
  forfeitWinner?: CombatWinner;
  singleWinner?: CombatWinner;
  judge?: unknown;
  roundId?: string;
}
export function reconstructAppeal(input: {
  format: 'single' | 'bo3';
  rulesVersion: number;
  playerOne: CombatStats;
  playerTwo: CombatStats;
  originalWinner: CombatWinner;
  rounds: AppealRound[];
}) {
  const rounds: (ReturnType<typeof resolveCombatRound> & {
    roundId?: string;
    judge?: unknown;
  })[] = [];
  let one = hpMax(input.playerOne.stamina),
    two = hpMax(input.playerTwo.stamina),
    w1 = 0,
    w2 = 0,
    t1 = 0,
    t2 = 0;
  let winner: CombatWinner = null,
    complete = false,
    decidingRule = 'missing_played_inputs';
  let comparison: Record<string, number> = {};
  for (const r of input.rounds) {
    const c = resolveCombatRound({
      ...r,
      rulesVersion: input.rulesVersion,
      playerOne: input.playerOne,
      playerTwo: input.playerTwo,
      playerOneHp: one,
      playerTwoHp: two,
    });
    if (input.format === 'single') {
      c.winner = r.forfeitWinner ?? r.singleWinner ?? null;
      c.isDraw = c.winner === null;
    }
    rounds.push({ ...c, roundId: r.roundId, judge: r.judge });
    one = c.playerOneHpAfter;
    two = c.playerTwoHpAfter;
    w1 += c.winner === 1 ? 1 : 0;
    w2 += c.winner === 2 ? 1 : 0;
    t1 += c.playerOneScore;
    t2 += c.playerTwoScore;
    if (input.format === 'single') {
      winner = c.winner;
      complete = true;
      decidingRule = r.forfeitWinner
        ? 'timeout_preserved'
        : 'independent_single_judge';
      break;
    }
    const s = resolveCombatSeries({
      rulesVersion: input.rulesVersion,
      roundsPlayed: rounds.length,
      bestOf: 3,
      playerOneWins: w1,
      playerTwoWins: w2,
      playerOneHp: one,
      playerTwoHp: two,
      playerOneHpMax: hpMax(input.playerOne.stamina),
      playerTwoHpMax: hpMax(input.playerTwo.stamina),
      playerOneTotal: t1,
      playerTwoTotal: t2,
      koWinner: c.isKo ? c.winner : null,
    });
    ({ winner, complete, decidingRule, comparison } = s);
    if (complete) break;
  }
  return {
    status: !complete
      ? 'no_contest'
      : winner === input.originalWinner
        ? 'upheld'
        : 'overturned',
    winner: complete ? winner : null,
    isDraw: complete && winner === null,
    rounds,
    playedRounds: input.rounds.length,
    decidingRule: complete ? decidingRule : 'unplayed_deciding_round',
    comparison,
    playerOneHp: one,
    playerTwoHp: two,
    playerOneWins: w1,
    playerTwoWins: w2,
  };
}
export interface ActualCall {
  model_id: string;
  fallback: boolean;
  prompt_version: string;
}
export function assertIndependentCalls(
  calls: ActualCall[],
  model: string,
  originalModels: string[],
  version: string,
) {
  if (
    !calls.length ||
    calls.some(
      (c) =>
        c.fallback ||
        c.model_id !== model ||
        c.model_id.startsWith('mock') ||
        originalModels.includes(c.model_id) ||
        c.prompt_version !== version,
    )
  )
    throw new Error(
      'Independent reviewer provenance unavailable or mismatched',
    );
}
export function calibrationEligible(
  c: unknown,
  model: string,
  version: string,
  locale: string,
  maxAgeHours: number,
): boolean {
  if (
    !c ||
    typeof c !== 'object' ||
    !Number.isFinite(maxAgeHours) ||
    maxAgeHours <= 0
  )
    return false;
  const r = c as Record<string, unknown>;
  if (
    r.status !== 'passed' ||
    r.judge_model_id !== model ||
    r.judge_prompt_version !== version ||
    r.locale !== locale ||
    Number(r.threshold) < 0.9 ||
    Number(r.accuracy) < Number(r.threshold) ||
    Number(r.total_count) < 1 ||
    !Number.isFinite(Date.parse(String(r.created_at))) ||
    Date.now() - Date.parse(String(r.created_at)) > maxAgeHours * 3600000
  )
    return false;
  const items = r.per_item_results as { calls?: ActualCall[] }[];
  if (!Array.isArray(items) || items.length !== r.total_count) return false;
  try {
    items.forEach((i) =>
      assertIndependentCalls(i.calls ?? [], model, [], version),
    );
    return true;
  } catch {
    return false;
  }
}
