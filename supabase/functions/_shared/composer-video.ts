/** Select recorded scene/moves before video generation. Missing v2 inputs cannot be invented. */
export function composerVideoInputs(
  battle: {
    prompt_experience_version?: number;
    theme?: string;
    player_one_id?: string;
    player_two_id?: string | null;
    is_player_two_bot?: boolean;
  },
  round: Record<string, any> | null,
) {
  if (
    battle.prompt_experience_version !== 2 &&
    !round?.judge_payload?.frozen_inputs
  )
    return null;
  if (round?.status !== 'result_ready')
    throw new Error('Resolved composer round required');
  const validWinner =
    round.is_draw === true
      ? round.round_winner_id == null
      : round.round_winner_id === battle.player_one_id ||
        (battle.is_player_two_bot === true
          ? round.round_winner_id == null
          : typeof battle.player_two_id === 'string' &&
            round.round_winner_id === battle.player_two_id);
  if (!validWinner) throw new Error('Recorded outcome unavailable');
  const frozen = round?.judge_payload?.frozen_inputs;
  const scene = round?.situation_snapshot;
  if (
    (battle.prompt_experience_version === 2 && !scene?.text) ||
    !frozen?.player_one?.text ||
    !frozen?.player_two?.text
  )
    throw new Error('Recorded composer inputs unavailable');
  return {
    playerOnePrompt: frozen.player_one.text as string,
    playerTwoPrompt: frozen.player_two.text as string,
    playerOneMoveType: frozen.player_one.moveType as
      | 'attack'
      | 'defense'
      | 'finisher',
    playerTwoMoveType: frozen.player_two.moveType as
      | 'attack'
      | 'defense'
      | 'finisher',
    theme: scene?.text
      ? `${battle.theme ?? ''}\nShared situation: ${scene.text}`
      : (battle.theme ?? ''),
    winnerId: round?.is_draw
      ? null
      : round?.round_winner_id === battle.player_one_id
        ? 'p1'
        : 'p2',
    isDraw: Boolean(round?.is_draw),
  };
}
