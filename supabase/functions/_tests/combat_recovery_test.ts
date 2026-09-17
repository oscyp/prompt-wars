import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolveTimedOutRound } from '../_shared/round-timeout.ts';
import { composePerRoundPayload } from '../_shared/per-round-payload.ts';
const candidate = {
  id: 'r1',
  battle_id: 'b1',
  round_number: 1,
  mode: 'ranked',
  player_one_id: 'p1',
  player_two_id: 'p2',
  player_one_rounds_won: 0,
  player_two_rounds_won: 0,
  is_player_two_bot: false,
};
Deno.test(
  'stale timeout cannot trigger follow-up resolution or notification',
  async () => {
    let invoked = false;
    const db = {
      rpc: () => Promise.resolve({ data: { action: 'stale' }, error: null }),
    };
    const outcome = await resolveTimedOutRound(db as unknown as SupabaseClient, candidate, () => {
      invoked = true;
      return Promise.resolve();
    });
    assertEquals(outcome, 'stale');
    assertEquals(invoked, false);
  },
);
Deno.test(
  'timeout dispatch re-reads prompts rather than sending stale forfeit identity',
  async () => {
    const requests: unknown[] = [];
    const db = {
      rpc: () => Promise.resolve({ data: { action: 'resolve' }, error: null }),
    };
    const outcome = await resolveTimedOutRound(
      db as unknown as SupabaseClient,
      candidate,
      (_name, body) => {
        requests.push(body);
        return Promise.resolve();
      },
    );
    assertEquals(outcome, 'resolve');
    assertEquals(requests, [{ battle_id: 'b1', round_number: 1 }]);
  },
);
Deno.test('atomic timeout failure does not dispatch a resolver', async () => {
  let invoked = false;
  let failed = false;
  const db = {
    rpc: () =>
      Promise.resolve({
        data: null,
        error: { message: 'transaction aborted' },
      }),
  };
  try {
    await resolveTimedOutRound(db as unknown as SupabaseClient, candidate, () => {
      invoked = true;
      return Promise.resolve();
    });
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
  assertEquals(invoked, false);
});
Deno.test(
  'Tier1 preserves frozen bot finisher despite absent prompt row',
  async () => {
    const round = {
      status: 'result_ready',
      id: 'r1',
      battle_id: 'b1',
      round_number: 1,
      round_winner_id: 'p1',
      is_draw: false,
      is_ko: false,
      score_gap: 5,
      judge_payload: {
        frozen_inputs: {
          player_one: { text: 'Human text', moveType: 'defense' },
          player_two: { text: 'Bot text', moveType: 'finisher' },
        },
      },
    };
    const db = {
      from: (_table: string) => {
        const api = {
          select: () => api,
          eq: () => api,
          single: () => Promise.resolve({ data: round, error: null }),
          then: (done: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(done),
        };
        return api;
      },
    };
    const payload = await composePerRoundPayload(
      db as unknown as SupabaseClient,
      {
        id: 'b1',
        player_one_id: 'p1',
        player_two_id: null,
        is_player_two_bot: true,
        identity_snapshot: { player_one: {}, player_two: {} },
      },
      'r1',
      1,
    );
    assertEquals((payload.prompts as {move_type:string}[])[1].move_type, 'finisher');
  },
);
