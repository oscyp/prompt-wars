import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { MoveType } from './types.ts';

export interface PreparedBotMove {
  text: string;
  moveType: MoveType;
  wordCount: number;
}

/** Service-only read. Selection happened atomically before the round opened.
 * Deliberately accepts no human prompt or public scene-based fallback.
 */
export async function readPrivateBotMove(
  db: Pick<SupabaseClient, 'rpc'>,
  battleId: string,
  roundNumber: number,
): Promise<PreparedBotMove> {
  const { data, error } = await db.rpc('get_private_bot_move', {
    p_battle_id: battleId,
    p_round_number: roundNumber,
  });
  if (
    error ||
    !data ||
    typeof data.text !== 'string' ||
    data.text.length < 20 ||
    data.text.length > 800 ||
    !['attack', 'defense', 'finisher'].includes(data.moveType) ||
    !Number.isInteger(data.wordCount) ||
    data.wordCount !== data.text.trim().split(/\s+/).length
  ) {
    // Never include provider/database details or private selection metadata.
    throw new Error('bot_choice_integrity_error');
  }
  return {
    text: data.text,
    moveType: data.moveType,
    wordCount: data.wordCount,
  };
}
