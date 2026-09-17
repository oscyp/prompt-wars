import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { computeRatingDeltas } from './glicko2.ts';
export interface TimeoutCandidate {
  id: string;
  battle_id: string;
  round_number: number;
  mode: string;
  player_one_id: string;
  player_two_id: string | null;
  player_one_rounds_won: number | null;
  player_two_rounds_won: number | null;
  is_player_two_bot: boolean;
}
/** Candidate reads are hints only; the RPC rechecks and commits under parent/round locks. */
export async function resolveTimedOutRound(
  db: SupabaseClient,
  c: TimeoutCandidate,
  invoke: (name: string, body: Record<string, unknown>) => Promise<void>,
): Promise<'stale' | 'resolve' | 'expired' | 'awarded'> {
  let deltas: Record<string, unknown> | null = null;
  if (
    c.mode === 'ranked' &&
    !c.is_player_two_bot &&
    c.player_two_id &&
    (c.player_one_rounds_won ?? 0) !== (c.player_two_rounds_won ?? 0)
  ) {
    const { data: profiles, error } = await db
      .from('profiles')
      .select('id,rating,rating_deviation,rating_volatility')
      .in('id', [c.player_one_id, c.player_two_id]);
    if (error) throw new Error(`Timeout rating read failed: ${error.message}`);
    const one = profiles?.find((p) => p.id === c.player_one_id),
      two = profiles?.find((p) => p.id === c.player_two_id);
    if (!one || !two) throw new Error('Timeout profiles missing');
    const result = computeRatingDeltas(
      Number(one.rating),
      Number(one.rating_deviation),
      Number(one.rating_volatility),
      Number(two.rating),
      Number(two.rating_deviation),
      Number(two.rating_volatility),
      (c.player_one_rounds_won ?? 0) > (c.player_two_rounds_won ?? 0),
      false,
    );
    deltas = { [one.id]: result.playerOne, [two.id]: result.playerTwo };
  }
  const { data, error } = await db.rpc('resolve_round_timeout', {
    p_round_id: c.id,
    p_rating_delta_payload: deltas,
  });
  if (error) throw new Error(`Round timeout failed: ${error.message}`);
  const action = data?.action;
  if (action === 'resolve')
    await invoke('round-resolve', {
      battle_id: c.battle_id,
      round_number: c.round_number,
    });
  return ['resolve', 'expired', 'awarded'].includes(action) ? action : 'stale';
}
