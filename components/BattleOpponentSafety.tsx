import React from 'react';
import PlayerSafetyActions from './PlayerSafetyActions';

type Participants = {
  player_one_id: string;
  player_two_id?: string | null;
  is_player_two_bot?: boolean | null;
};
export function humanOpponentId(
  battle: Participants | null | undefined,
  myId?: string | null,
): string | undefined {
  if (!battle || !myId || battle.is_player_two_bot) return undefined;
  const opponent =
    battle.player_one_id === myId
      ? battle.player_two_id
      : battle.player_two_id === myId
        ? battle.player_one_id
        : null;
  return opponent && opponent !== myId ? opponent : undefined;
}
/** A separate action beside battle content, with no dependency on forfeiting. */
export default function BattleOpponentSafety({
  battle,
  myId,
  name = 'opponent',
}: {
  battle: Participants | null | undefined;
  myId?: string | null;
  name?: string;
}) {
  const profileId = humanOpponentId(battle, myId);
  return profileId ? (
    <PlayerSafetyActions profileId={profileId} name={name} />
  ) : null;
}
