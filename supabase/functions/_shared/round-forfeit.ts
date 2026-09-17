import type { CombatWinner } from './combat.ts';
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
interface RoundEvidence {
  judge_payload?: unknown;
  judge_model_id?: unknown;
  round_winner_id?: string | null;
  player_one_locked_at?: string | null;
  player_two_locked_at?: string | null;
}
interface Players {
  player_one_id: string;
  player_two_id: string | null;
}
/** Undefined means no proven forfeit, distinct from an explicitly recorded draw. */
export function recordedRoundForfeit(
  round: RoundEvidence,
  players: Players,
): CombatWinner | undefined {
  const payload = record(round.judge_payload);
  const loser = payload.forfeit_profile_id ?? payload.forfeited_profile_id;
  const winner =
    round.round_winner_id === players.player_one_id
      ? 1
      : players.player_two_id && round.round_winner_id === players.player_two_id
        ? 2
        : null;
  if (
    loser === players.player_one_id &&
    (winner === 2 || !players.player_two_id)
  )
    return 2;
  if (players.player_two_id && loser === players.player_two_id && winner === 1)
    return 1;
  if (
    ['forfeit', 'timeout', 'series_abandoned'].includes(
      String(payload.resolution),
    )
  )
    return winner;
  // Legacy timeout writer stored only the forfeit sentinel. Do not infer from
  // missing model identity or a missing prompt read: require one-sided durable
  // locks or explicit frozen prompt texts, and a matching recorded winner.
  if (
    String(round.judge_model_id).trim().toLowerCase() !== 'forfeit' ||
    (Array.isArray(payload.calls) && payload.calls.length)
  )
    return undefined;
  const frozen = record(payload.frozen_inputs);
  const p1 = record(frozen.player_one).text,
    p2 = record(frozen.player_two).text;
  const promptWinner =
    typeof p1 === 'string' && typeof p2 === 'string'
      ? p1.trim() && !p2.trim()
        ? 1
        : p2.trim() && !p1.trim()
          ? 2
          : undefined
      : undefined;
  const one = Boolean(round.player_one_locked_at),
    two = Boolean(round.player_two_locked_at);
  const lockWinner = one !== two ? (one ? 1 : 2) : undefined;
  if (
    lockWinner !== undefined &&
    promptWinner !== undefined &&
    lockWinner !== promptWinner
  )
    return undefined;
  const proven = lockWinner ?? promptWinner;
  return proven !== undefined && proven === winner ? proven : undefined;
}
export function forfeitRoundPayload(input: {
  loserId: string | null;
  explicit: boolean;
  playerOne: unknown;
  playerTwo: unknown;
  theme: string | null;
  rulesVersion: number;
}) {
  if (!input.loserId)
    throw new Error(
      'Cannot persist an unjudged round without a proven forfeit',
    );
  return {
    resolution: input.explicit ? 'forfeit' : 'timeout',
    forfeit_profile_id: input.loserId,
    frozen_inputs: {
      player_one: input.playerOne,
      player_two: input.playerTwo,
      theme: input.theme,
      rules_version: input.rulesVersion,
    },
  };
}
