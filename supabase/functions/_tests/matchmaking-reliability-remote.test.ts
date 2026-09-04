import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cleanupFixture,
  createTestCharacter,
  skipUnlessRemoteEnabled,
  type TestCharacterFixture,
} from './remote-character-helpers.ts';

type MatchRow = {
  battle_id: string;
  replayed_request: boolean;
  matched: boolean;
};

function first(data: unknown): MatchRow {
  const row = Array.isArray(data) ? data[0] : data;
  assertExists(row);
  return row as MatchRow;
}

Deno.test(
  'remote matchmaking requests are atomic, replayable and service-only',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    let opponent: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'matchmaking-idempotency');
      opponent = await createTestCharacter(config, 'matchmaking-opponent');
      const requestId = crypto.randomUUID();
      const args = {
        p_player_one_id: fixture.profileId,
        p_character_id: fixture.characterId,
        p_mode: 'ranked',
        p_request_id: requestId,
        p_bot_persona_id: null,
        p_theme: null,
      };

      const [a, b] = await Promise.all([
        fixture.admin.rpc('create_matchmaking_battle', args),
        fixture.admin.rpc('create_matchmaking_battle', args),
      ]);
      assertEquals(a.error, null, a.error?.message);
      assertEquals(b.error, null, b.error?.message);
      assertEquals(first(a.data).battle_id, first(b.data).battle_id);
      assert(
        first(a.data).replayed_request || first(b.data).replayed_request,
        'one concurrent call should report a replay',
      );

      // Different request ids for the same natural queue key still resume one
      // open row; a separate mode is allowed to own a separate row.
      const alias = await fixture.admin.rpc('create_matchmaking_battle', {
        ...args,
        p_request_id: crypto.randomUUID(),
      });
      assertEquals(alias.error, null, alias.error?.message);
      assertEquals(first(alias.data).battle_id, first(a.data).battle_id);

      const casual = await fixture.admin.rpc('create_matchmaking_battle', {
        ...args,
        p_mode: 'unranked',
        p_request_id: crypto.randomUUID(),
      });
      assertEquals(casual.error, null, casual.error?.message);
      assertNotEquals(first(casual.data).battle_id, first(a.data).battle_id);

      const { data: bot } = await fixture.admin
        .from('bot_personas')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      const botId = bot?.id;
      assertExists(botId, 'active bot persona required');
      const botRequest = crypto.randomUUID();
      const botArgs = {
        ...args,
        p_mode: 'bot',
        p_request_id: botRequest,
        p_bot_persona_id: botId,
        p_theme: 'Retry the impossible',
      };
      const botFirst = await fixture.admin.rpc(
        'create_matchmaking_battle',
        botArgs,
      );
      const botReplay = await fixture.admin.rpc(
        'create_matchmaking_battle',
        botArgs,
      );
      assertEquals(botFirst.error, null, botFirst.error?.message);
      assertEquals(botReplay.error, null, botReplay.error?.message);
      assertEquals(
        first(botFirst.data).battle_id,
        first(botReplay.data).battle_id,
      );
      assertEquals(first(botReplay.data).replayed_request, true);

      const opponentRequest = crypto.randomUUID();
      const opponentQueue = await opponent.admin.rpc(
        'create_matchmaking_battle',
        {
          p_player_one_id: opponent.profileId,
          p_character_id: opponent.characterId,
          p_mode: 'ranked',
          p_request_id: opponentRequest,
          p_bot_persona_id: null,
          p_theme: null,
        },
      );
      assertEquals(opponentQueue.error, null, opponentQueue.error?.message);
      const opponentQueueId = first(opponentQueue.data).battle_id;

      const claimed = await opponent.admin.rpc('match_battle_request', {
        p_battle_id: first(a.data).battle_id,
        p_player_two_id: opponent.profileId,
        p_player_two_character_id: opponent.characterId,
        p_theme: 'Atomic rivals',
        p_request_id: opponentRequest,
        p_previous_battle_id: opponentQueueId,
      });
      assertEquals(claimed.error, null, claimed.error?.message);
      assertEquals(claimed.data, true);

      const { data: remapped } = await opponent.admin
        .from('matchmaking_requests')
        .select('battle_id')
        .eq('profile_id', opponent.profileId)
        .eq('request_id', opponentRequest)
        .single();
      assertEquals(remapped?.battle_id, first(a.data).battle_id);
      const { data: canceledQueue } = await opponent.admin
        .from('battles')
        .select('status')
        .eq('id', opponentQueueId)
        .single();
      assertEquals(canceledQueue?.status, 'canceled');

      await fixture.admin
        .from('battles')
        .update({
          created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        })
        .eq('id', first(casual.data).battle_id);
      const swept = await fixture.admin.rpc(
        'cancel_stale_matchmaking_battles',
        {
          p_stale_minutes: 5,
        },
      );
      assertEquals(swept.error, null, swept.error?.message);
      assert(Number(swept.data) >= 1, 'stale queue was not canceled');

      const denied = await fixture.userClient.rpc('create_matchmaking_battle', {
        ...args,
        p_request_id: crypto.randomUUID(),
      });
      assert(
        denied.error,
        'authenticated client unexpectedly executed service RPC',
      );
    } finally {
      await cleanupFixture(opponent);
      await cleanupFixture(fixture);
    }
  },
);
