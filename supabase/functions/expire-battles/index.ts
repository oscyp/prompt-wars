// Expire Battles Cron Function
// Runs periodically to:
//   1. Expire single-format battles via the existing DB function.
//   2. For Bo3 battles: handle per-round timeouts. If one side locked, forfeit
//      that round via round-resolve. If neither locked, mark the round expired
//      and the battle expired.

import {
  createServiceClient,
  corsHeaders,
  successResponse,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();

    // ---- Single-format path (unchanged) ----
    const { data: expiredCount, error: singleErr } = await supabase.rpc(
      'expire_timed_out_battles',
    );
    if (singleErr) {
      console.error('Single-format expire error:', singleErr);
    }

    // ---- Bo3 path: per-round deadlines ----
    let bo3Forfeited = 0;
    let bo3Expired = 0;

    const { data: timedOutRounds } = await supabase
      .from('battle_rounds')
      .select(
        `
        id, battle_id, round_number, status,
        player_one_locked_at, player_two_locked_at, lock_in_deadline,
        battles!inner(id, format, player_one_id, player_two_id, is_player_two_bot, status)
      `,
      )
      .eq('status', 'waiting_for_prompts')
      .lt('lock_in_deadline', new Date().toISOString());

    for (const row of timedOutRounds ?? []) {
      // Supabase typings render an embedded relation as an array; coerce to the
      // single row we know we get back from a !inner join on PK.
      const battlesField = (row as unknown as { battles: unknown }).battles;
      const b = (Array.isArray(battlesField)
        ? battlesField[0]
        : battlesField) as
        | {
            format: string;
            player_one_id: string;
            player_two_id: string;
          }
        | undefined;
      if (!b || b.format !== 'bo3') continue;

      const p1Locked = !!row.player_one_locked_at;
      const p2Locked = !!row.player_two_locked_at;

      if (!p1Locked && !p2Locked) {
        // Neither locked → expire round and battle.
        await supabase
          .from('battle_rounds')
          .update({
            status: 'expired',
            resolved_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        await supabase
          .from('battles')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.battle_id);
        bo3Expired += 1;
        continue;
      }

      // One side locked → forfeit the other side via round-resolve.
      const forfeitId = p1Locked ? b.player_two_id : b.player_one_id;
      try {
        await invokeFn('round-resolve', {
          battle_id: row.battle_id,
          round_number: row.round_number,
          forfeit_profile_id: forfeitId,
        });
        bo3Forfeited += 1;
      } catch (err) {
        console.error('Failed to invoke round-resolve for forfeit:', err);
      }
    }

    return successResponse({
      success: true,
      expired_count: expiredCount ?? 0,
      bo3_forfeited: bo3Forfeited,
      bo3_expired: bo3Expired,
    });
  } catch (error) {
    console.error('Expire battles error:', error);
    return successResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      },
      500,
    );
  }
});

async function invokeFn(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getSupabasePublishableKey();
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new Error('Missing Supabase environment variables');
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Invoke ${fn} failed:`, await res.text());
  }
}
