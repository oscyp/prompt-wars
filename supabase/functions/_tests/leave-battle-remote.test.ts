// Remote integration tests for leave-battle.
//
// Gated on PROMPT_WARS_REMOTE_FUNCTION_TESTS=1 and skipped otherwise.
//
// This is the only place `claim_leave_battle` is actually executed. A clean
// `db push` says nothing about whether a PL/pgSQL body works -- bodies are not
// planned until first call -- and this function moves money, so the properties
// worth proving are the ones that cost a player if they are wrong: charged
// exactly once, never charged for a free exit, and never charged for an exit
// that was blocked.

import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cleanupFixture,
  createActiveBattle,
  createTestCharacter,
  getCreditBalance,
  grantCredits,
  invokeFunction,
  skipUnlessRemoteEnabled,
  type TestCharacterFixture,
} from './remote-character-helpers.ts';

const LEAVE_PRICE = 2;

interface LeaveResponse {
  success: boolean;
  action?: string;
  credits_charged?: number;
  code?: string;
  shortfall?: number;
}

/**
 * leave-battle answers with a bare object (successResponse), not the
 * `{ok, data}` envelope some functions use, so the union needs narrowing.
 */
function leaveBody(result: { body: unknown }): LeaveResponse {
  return (result.body ?? {}) as LeaveResponse;
}

/** Wallet rows written by a leave, for the given battle. */
async function leaveTransactions(
  fixture: TestCharacterFixture,
  battleId: string,
) {
  const { data, error } = await fixture.admin
    .from('wallet_transactions')
    .select('id, amount, reason, idempotency_key')
    .eq('profile_id', fixture.profileId)
    .eq('battle_id', battleId)
    .eq('reason', 'leave_battle');
  assertEquals(error, null, error?.message);
  return data ?? [];
}

async function lockPrompt(fixture: TestCharacterFixture, battleId: string) {
  const { error } = await fixture.admin.from('battle_prompts').insert({
    battle_id: battleId,
    profile_id: fixture.profileId,
    custom_prompt_text: 'A prompt long enough to satisfy the check constraint.',
    move_type: 'attack',
    is_locked: true,
    locked_at: new Date().toISOString(),
    moderation_status: 'approved',
  });
  assertEquals(error, null, `prompt insert failed: ${error?.message}`);
}

async function battleRow(fixture: TestCharacterFixture, battleId: string) {
  const { data, error } = await fixture.admin
    .from('battles')
    .select('status, winner_id, score_payload')
    .eq('id', battleId)
    .single();
  assertEquals(error, null, error?.message);
  return data;
}

Deno.test('remote leave-battle: free before this player locks', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'leave-free');
    const battleId = await createActiveBattle(fixture);
    const before = await getCreditBalance(fixture);

    const result = await invokeFunction<LeaveResponse>(
      config,
      fixture.accessToken,
      'leave-battle',
      { battle_id: battleId },
    );

    assertEquals(result.status, 200, result.bodyText);
    assertEquals(leaveBody(result).action, 'canceled');

    // The toll is for walking out on a commitment. There was none.
    assertEquals(await getCreditBalance(fixture), before);
    assertEquals((await leaveTransactions(fixture, battleId)).length, 0);
    assertEquals((await battleRow(fixture, battleId))?.status, 'canceled');
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test(
  'remote leave-battle: charges exactly once after locking',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'leave-paid');
      await grantCredits(fixture, 10);
      const battleId = await createActiveBattle(fixture);
      await lockPrompt(fixture, battleId);

      const before = await getCreditBalance(fixture);
      const result = await invokeFunction<LeaveResponse>(
        config,
        fixture.accessToken,
        'leave-battle',
        { battle_id: battleId },
      );

      assertEquals(result.status, 200, result.bodyText);
      assertEquals(await getCreditBalance(fixture), before - LEAVE_PRICE);

      const txs = await leaveTransactions(fixture, battleId);
      assertEquals(txs.length, 1);
      assertEquals(Number(txs[0].amount), -LEAVE_PRICE);
      assertEquals(
        txs[0].idempotency_key,
        `leave_battle_${battleId}_${fixture.profileId}`,
      );
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote leave-battle: a second call does not charge again',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    // The money test. Two taps landing on one battle must cost one toll.
    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'leave-double');
      await grantCredits(fixture, 10);
      const battleId = await createActiveBattle(fixture);
      await lockPrompt(fixture, battleId);

      const before = await getCreditBalance(fixture);
      await invokeFunction(config, fixture.accessToken, 'leave-battle', {
        battle_id: battleId,
      });
      const second = await invokeFunction<LeaveResponse>(
        config,
        fixture.accessToken,
        'leave-battle',
        { battle_id: battleId },
      );

      assertEquals(second.status, 200, second.bodyText);
      assertEquals(leaveBody(second).action, 'already_terminal');
      assertEquals(await getCreditBalance(fixture), before - LEAVE_PRICE);
      assertEquals((await leaveTransactions(fixture, battleId)).length, 1);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test('remote leave-battle: a blocked exit leaves no trace', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  // The whole reason claim_leave_battle reads and rejects before it writes
  // anything: a player who cannot afford the toll must find the battle exactly
  // as they left it, with no wallet row and no status change to undo.
  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'leave-broke');
    const battleId = await createActiveBattle(fixture);
    await lockPrompt(fixture, battleId);

    // New accounts get a welcome grant, so being broke has to be arranged.
    // Spent rather than deleted, so the ledger stays a real ledger.
    const granted = await getCreditBalance(fixture);
    if (granted > 0) {
      const { error: spendErr } = await fixture.admin.rpc('spend_credits', {
        p_profile_id: fixture.profileId,
        p_amount: granted,
        p_reason: 'test_zero_out',
        p_idempotency_key: `zero_${fixture.profileId}`,
        p_battle_id: null,
        p_video_job_id: null,
        p_metadata: {},
      });
      assertEquals(spendErr, null, spendErr?.message);
    }

    const balance = await getCreditBalance(fixture);
    assert(balance < LEAVE_PRICE, `fixture should be broke, had ${balance}`);

    const result = await invokeFunction<LeaveResponse>(
      config,
      fixture.accessToken,
      'leave-battle',
      { battle_id: battleId },
    );

    assertEquals(result.status, 402, result.bodyText);
    assertEquals(leaveBody(result).code, 'insufficient_credits');

    assertEquals(await getCreditBalance(fixture), balance);
    assertEquals((await leaveTransactions(fixture, battleId)).length, 0);
    // Still playable. The player can write, or wait out the deadline.
    assertEquals(
      (await battleRow(fixture, battleId))?.status,
      'waiting_for_prompts',
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote leave-battle: bo3 closes the open round', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  // A round left in waiting_for_prompts keeps a live lock_in_deadline, and the
  // expire-battles sweep would hand an already-finished battle's round to
  // round-resolve long after it was over.
  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'leave-bo3');
    await grantCredits(fixture, 10);

    const { data: battle, error: battleErr } = await fixture.admin
      .from('battles')
      .insert({
        mode: 'bot',
        status: 'waiting_for_prompts',
        format: 'bo3',
        // battles_format_best_of_consistent: a bo3 battle must say best_of 3.
        best_of: 3,
        current_round: 2,
        player_one_id: fixture.profileId,
        player_one_character_id: fixture.characterId,
        is_player_two_bot: true,
        player_one_rounds_won: 1,
        player_two_rounds_won: 0,
      })
      .select('id')
      .single();
    assertEquals(battleErr, null, battleErr?.message);
    const battleId = (battle as { id: string }).id;

    const { error: roundErr } = await fixture.admin
      .from('battle_rounds')
      .insert({
        battle_id: battleId,
        round_number: 2,
        status: 'waiting_for_prompts',
        lock_in_deadline: new Date(Date.now() + 3_600_000).toISOString(),
      });
    assertEquals(roundErr, null, roundErr?.message);

    await lockPrompt(fixture, battleId);
    const result = await invokeFunction(
      config,
      fixture.accessToken,
      'leave-battle',
      { battle_id: battleId },
    );
    assertEquals(result.status, 200, result.bodyText);

    const { data: round } = await fixture.admin
      .from('battle_rounds')
      .select('status, resolved_at, round_winner_id')
      .eq('battle_id', battleId)
      .eq('round_number', 2)
      .single();
    assertEquals(round?.status, 'canceled');
    assertExists(round?.resolved_at);
    // The series is already awarded; awarding the round too would double-count
    // it in rounds_won.
    assertEquals(round?.round_winner_id, null);

    const { data: after } = await fixture.admin
      .from('battles')
      .select('player_one_rounds_won, player_two_rounds_won')
      .eq('id', battleId)
      .single();
    // Frozen: the honest record of where the series stood.
    assertEquals(after?.player_one_rounds_won, 1);
    assertEquals(after?.player_two_rounds_won, 0);
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote can_appeal: a forfeit is not appealable', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  // An appeal is a claim that the JUDGE got it wrong. In a forfeit the judge
  // never ran, so there is nothing to appeal -- yet can_appeal only asked
  // "ranked loss, under the daily cap", which a forfeiter satisfies.
  //
  // Two real players, because `winner_is_participant` will not accept a winner
  // who is not in the battle, and the whole point is that the LOSER of a
  // forfeit is refused.
  let leaver: TestCharacterFixture | undefined;
  let winner: TestCharacterFixture | undefined;
  try {
    leaver = await createTestCharacter(config, 'appeal-leaver');
    winner = await createTestCharacter(config, 'appeal-winner');

    const makeBattle = async (scorePayload: Record<string, unknown>) => {
      const { data, error } = await leaver!.admin
        .from('battles')
        .insert({
          mode: 'ranked',
          status: 'completed',
          player_one_id: leaver!.profileId,
          player_one_character_id: leaver!.characterId,
          player_two_id: winner!.profileId,
          player_two_character_id: winner!.characterId,
          is_player_two_bot: false,
          winner_id: winner!.profileId,
          completed_at: new Date().toISOString(),
          score_payload: scorePayload,
        })
        .select('id')
        .single();
      assertEquals(error, null, error?.message);
      return (data as { id: string }).id;
    };

    const canAppeal = async (battleId: string) => {
      const { data, error } = await leaver!.admin.rpc('can_appeal', {
        p_profile_id: leaver!.profileId,
        p_battle_id: battleId,
      });
      assertEquals(error, null, error?.message);
      return data;
    };

    // Control: an ordinary judged ranked loss IS appealable. Without this the
    // test below would pass even if can_appeal returned FALSE for everything.
    const judged = await makeBattle({ resolution: 'judged', winner_score: 84 });
    assertEquals(await canAppeal(judged), true);

    // A voluntary leave is not.
    const left = await makeBattle({
      resolution: 'forfeit',
      reason: 'player_left',
      forfeited_profile_id: leaver.profileId,
    });
    assertEquals(await canAppeal(left), false);

    // Neither is a timeout forfeit -- the same hole, closed by the same guard.
    const timedOut = await makeBattle({
      resolution: 'forfeit',
      reason: 'opponent_timeout',
      forfeited_profile_id: leaver.profileId,
    });
    assertEquals(await canAppeal(timedOut), false);
  } finally {
    await cleanupFixture(leaver);
    await cleanupFixture(winner);
  }
});
