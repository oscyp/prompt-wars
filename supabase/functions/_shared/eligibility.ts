interface EligibilityReader {
  rpc(
    name: string,
    args: { p_profile_id: string },
  ): PromiseLike<{ data: { can_generate?: boolean } | null; error: unknown }>;
}
/** Recheck background work because consent may change after the job is queued. */
export async function canGenerateBattle(
  client: EligibilityReader,
  battle: { player_one_id: string; player_two_id?: string | null },
): Promise<boolean> {
  const participants = [
    ...new Set(
      [battle.player_one_id, battle.player_two_id].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
  if (!participants.length) return false;
  for (const id of participants) {
    const { data, error } = await client.rpc('get_account_eligibility', {
      p_profile_id: id,
    });
    if (error || data?.can_generate !== true) return false;
  }
  return true;
}
