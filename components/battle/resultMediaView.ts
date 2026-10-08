export function resultMediaRoundNumber(
  job: { battle_round_id?: string | null } | null,
  rounds: { id: string; round_number: number }[],
) {
  if (!job?.battle_round_id) return null;
  return (
    rounds.find((round) => round.id === job.battle_round_id)?.round_number ??
    null
  );
}
