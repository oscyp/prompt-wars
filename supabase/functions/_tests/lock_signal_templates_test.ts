// Per-side lock timestamps + server-side template serving tests
// Covers migrations:
//   - 20260731120000_battle_lock_timestamps.sql (battles.player_one_locked_at /
//     player_two_locked_at stamped by lock_prompt)
//   - 20260731121000_get_battle_templates_rpc.sql (get_battle_templates RPC)
//
// NOTE: These are integration tests that require:
//   - SUPABASE_URL environment variable
//   - SUPABASE_SECRET_KEYS (or legacy service key) environment variable
//   - SUPABASE_PUBLISHABLE_KEYS / SUPABASE_ANON_KEY for the user-context RPC tests
//   - Running Supabase instance with all migrations + starter seed applied

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getSupabasePublishableKey, getSupabaseSecretKey } from '../_shared/utils.ts';
import { createTestPlayer, deleteTestPlayer, type ServiceClient } from './integration-helpers.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = getSupabaseSecretKey();
const supabasePublishableKey = getSupabasePublishableKey();

const skipIntegrationTests = !supabaseUrl || !supabaseServiceKey;
const skipUserContextTests = skipIntegrationTests || !supabasePublishableKey;

const MOVE_TYPES = ['attack', 'defense', 'finisher'];

function createAdmin(): ServiceClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface SignedInPlayer {
  profileId: string;
  characterId: string;
  userClient: SupabaseClient;
}

/**
 * Like createTestPlayer, but with a known password and a signed-in
 * user-context client so `auth.uid()` resolves inside SECURITY DEFINER RPCs.
 */
async function createSignedInPlayer(
  admin: ServiceClient,
  displayName: string,
): Promise<SignedInPlayer> {
  const email = `it_${crypto.randomUUID()}@example.test`;
  const password = `PwTest-${crypto.randomUUID()}!1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, age_confirmed: true },
  });
  if (userError || !userData?.user) {
    throw userError ?? new Error('Failed to create test auth user');
  }
  const profileId = userData.user.id;

  // Wait for the on_auth_user_created trigger to materialize the profile.
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const { data } = await admin.from('profiles').select('id').eq('id', profileId).maybeSingle();
    if (data?.id) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const { data: character, error: charError } = await admin
    .from('characters')
    .insert({
      profile_id: profileId,
      name: displayName.slice(0, 40),
      archetype: 'strategist',
      battle_cry: 'For determinism!',
    })
    .select('id')
    .single();
  if (charError || !character) {
    await admin.auth.admin.deleteUser(profileId).catch(() => {});
    throw charError ?? new Error('Failed to create test character');
  }

  const anonClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session?.access_token) {
    await admin.auth.admin.deleteUser(profileId).catch(() => {});
    throw signInError ?? new Error('Failed to sign in test user');
  }

  const userClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  return { profileId, characterId: (character as { id: string }).id, userClient };
}

async function createMatchedBattle(
  admin: ServiceClient,
  p1: { profileId: string; characterId: string },
  p2: { profileId: string; characterId: string },
): Promise<string> {
  const { data: battleId, error: battleError } = await admin.rpc('create_battle', {
    p_player_one_id: p1.profileId,
    p_character_id: p1.characterId,
    p_mode: 'unranked',
  });
  if (battleError) throw battleError;
  assertExists(battleId);

  const { error: matchError } = await admin.rpc('match_battle', {
    p_battle_id: battleId,
    p_player_two_id: p2.profileId,
    p_player_two_character_id: p2.characterId,
    p_theme: 'Test theme for lock signal tests',
  });
  if (matchError) throw matchError;

  return battleId as string;
}

Deno.test({
  name: 'Lock signal: lock_prompt stamps per-side lock timestamps on battles',
  ignore: skipIntegrationTests,
  async fn() {
    const admin = createAdmin();
    const player1 = await createTestPlayer(admin, {
      displayName: 'Lock Signal P1',
      archetype: 'strategist',
      characterName: 'Signal One',
    });
    const player2 = await createTestPlayer(admin, {
      displayName: 'Lock Signal P2',
      archetype: 'titan',
      characterName: 'Signal Two',
    });

    try {
      const battleId = await createMatchedBattle(admin, player1, player2);

      // Fresh battle: no lock stamps.
      let { data: battle, error } = await admin
        .from('battles')
        .select('status, player_one_locked_at, player_two_locked_at')
        .eq('id', battleId)
        .single();
      if (error) throw error;
      assertExists(battle);
      assertEquals(battle.player_one_locked_at, null);
      assertEquals(battle.player_two_locked_at, null);

      // Player 1 locks: only their side is stamped.
      const { data: prompt1Id, error: lock1Error } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player1.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: 'Player 1 attacks with precision and strategy.',
        p_move_type: 'attack',
        p_moderation_status: 'approved',
      });
      if (lock1Error) throw lock1Error;
      assertExists(prompt1Id);

      ({ data: battle, error } = await admin
        .from('battles')
        .select('status, player_one_locked_at, player_two_locked_at')
        .eq('id', battleId)
        .single());
      if (error) throw error;
      assertExists(battle);
      assertExists(battle.player_one_locked_at, 'player_one_locked_at should be stamped');
      assertEquals(battle.player_two_locked_at, null, 'player_two_locked_at must stay NULL');
      const firstStamp = battle.player_one_locked_at;

      // Idempotent retry: same prompt id, stamp unchanged.
      const { data: retryId, error: retryError } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player1.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: 'Player 1 attacks with precision and strategy.',
        p_move_type: 'attack',
        p_moderation_status: 'approved',
      });
      if (retryError) throw retryError;
      assertEquals(retryId, prompt1Id);

      ({ data: battle, error } = await admin
        .from('battles')
        .select('player_one_locked_at')
        .eq('id', battleId)
        .single());
      if (error) throw error;
      assertEquals(battle?.player_one_locked_at, firstStamp, 'retry must not move the stamp');

      // Player 2 locks: both stamped, battle resolving.
      const { data: prompt2Id, error: lock2Error } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player2.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: 'Player 2 defends with unbreakable will.',
        p_move_type: 'defense',
        p_moderation_status: 'approved',
      });
      if (lock2Error) throw lock2Error;
      assertExists(prompt2Id);

      ({ data: battle, error } = await admin
        .from('battles')
        .select('status, player_one_locked_at, player_two_locked_at')
        .eq('id', battleId)
        .single());
      if (error) throw error;
      assertExists(battle);
      assertExists(battle.player_one_locked_at);
      assertExists(battle.player_two_locked_at);
      assertEquals(battle.status, 'resolving');
    } finally {
      await deleteTestPlayer(admin, player1.profileId);
      await deleteTestPlayer(admin, player2.profileId);
    }
  },
});

Deno.test({
  name: 'Lock signal: lock_prompt is round-aware — Bo3 rounds 2-3 get their own prompt rows',
  ignore: skipIntegrationTests,
  async fn() {
    const admin = createAdmin();
    const player1 = await createTestPlayer(admin, {
      displayName: 'Round Aware P1',
      archetype: 'strategist',
      characterName: 'Round One',
    });
    const player2 = await createTestPlayer(admin, {
      displayName: 'Round Aware P2',
      archetype: 'titan',
      characterName: 'Round Two',
    });

    try {
      const battleId = await createMatchedBattle(admin, player1, player2);

      // Promote to Bo3 so lock_prompt does NOT run the single-format round sync
      // and per-round rows are the contract under test. best_of must be 3 to
      // satisfy the battles_format_best_of_consistent CHECK.
      const { error: fmtErr } = await admin
        .from('battles')
        .update({ format: 'bo3', best_of: 3, current_round: 1 })
        .eq('id', battleId);
      if (fmtErr) throw fmtErr;

      // Round 1: player 1 locks distinctive text.
      const round1Text = 'Round one: I open with a probing feint to bait the guard.';
      const { data: r1Id, error: r1Err } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player1.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: round1Text,
        p_move_type: 'attack',
        p_moderation_status: 'approved',
        p_round_number: 1,
      });
      if (r1Err) throw r1Err;
      assertExists(r1Id);

      // Round 2: same player, DIFFERENT text — must NOT early-return round 1's id.
      const round2Text = 'Round two: I pivot to an overwhelming finisher combination.';
      const { data: r2Id, error: r2Err } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player1.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: round2Text,
        p_move_type: 'finisher',
        p_moderation_status: 'approved',
        p_round_number: 2,
      });
      if (r2Err) throw r2Err;
      assertExists(r2Id);
      assert(r1Id !== r2Id, 'round 2 must create a distinct prompt row, not reuse round 1');

      // Two distinct rows exist with the correct round_number + text mapping.
      const { data: rows, error: rowsErr } = await admin
        .from('battle_prompts')
        .select('id, round_number, custom_prompt_text, move_type')
        .eq('battle_id', battleId)
        .eq('profile_id', player1.profileId)
        .order('round_number', { ascending: true });
      if (rowsErr) throw rowsErr;
      assertExists(rows);
      assertEquals(rows.length, 2, 'expected exactly one row per round');
      assertEquals(rows[0].round_number, 1);
      assertEquals(rows[0].custom_prompt_text, round1Text);
      assertEquals(rows[1].round_number, 2);
      assertEquals(rows[1].custom_prompt_text, round2Text);

      // Idempotency is per-round: re-locking round 2 returns the same id and does
      // NOT overwrite the stored text.
      const { data: r2Retry, error: retryErr } = await admin.rpc('lock_prompt', {
        p_battle_id: battleId,
        p_profile_id: player1.profileId,
        p_prompt_template_id: null,
        p_custom_prompt_text: 'A different round-two attempt that must be ignored.',
        p_move_type: 'attack',
        p_moderation_status: 'approved',
        p_round_number: 2,
      });
      if (retryErr) throw retryErr;
      assertEquals(r2Retry, r2Id, 'same-round retry must be idempotent');

      const { data: r2Row, error: r2RowErr } = await admin
        .from('battle_prompts')
        .select('custom_prompt_text')
        .eq('id', r2Id as string)
        .single();
      if (r2RowErr) throw r2RowErr;
      assertEquals(r2Row?.custom_prompt_text, round2Text, 'retry must not mutate stored text');
    } finally {
      await deleteTestPlayer(admin, player1.profileId);
      await deleteTestPlayer(admin, player2.profileId);
    }
  },
});

Deno.test({
  name: 'Templates: get_battle_templates returns one template per move type, deterministically',
  ignore: skipUserContextTests,
  async fn() {
    const admin = createAdmin();
    let p1: SignedInPlayer | undefined;
    let p2: SignedInPlayer | undefined;
    let outsider: SignedInPlayer | undefined;

    try {
      p1 = await createSignedInPlayer(admin, 'Templates P1');
      p2 = await createSignedInPlayer(admin, 'Templates P2');
      outsider = await createSignedInPlayer(admin, 'Templates Outsider');

      const battleId = await createMatchedBattle(admin, p1, p2);

      // Participant call: seed content covers all three move types, so the
      // full contract of 3 rows applies.
      const { data: rows1, error: rpcError } = await p1.userClient.rpc('get_battle_templates', {
        p_battle_id: battleId,
      });
      if (rpcError) throw rpcError;
      assertExists(rows1);
      assertEquals(rows1.length, 3, 'starter seed covers all move types, expected 3 rows');

      const moveTypes = rows1.map((r: { suggested_move_type: string }) => r.suggested_move_type);
      assertEquals(
        [...moveTypes].sort(),
        [...MOVE_TYPES].sort(),
        'expected exactly one template per move type',
      );
      for (const row of rows1) {
        assertExists(row.id);
        assertExists(row.title);
        assertExists(row.body);
        assertExists(row.category);
      }

      // Deterministic: an identical refetch returns the identical set/order.
      const { data: rows1Again, error: againError } = await p1.userClient.rpc(
        'get_battle_templates',
        { p_battle_id: battleId },
      );
      if (againError) throw againError;
      assertEquals(JSON.stringify(rows1Again), JSON.stringify(rows1), 'refetch must not reshuffle');

      // The opponent gets their own deterministic set (may or may not overlap).
      const { data: rows2, error: p2Error } = await p2.userClient.rpc('get_battle_templates', {
        p_battle_id: battleId,
      });
      if (p2Error) throw p2Error;
      assertExists(rows2);
      assertEquals(rows2.length, 3);
      const { data: rows2Again, error: p2AgainError } = await p2.userClient.rpc(
        'get_battle_templates',
        { p_battle_id: battleId },
      );
      if (p2AgainError) throw p2AgainError;
      assertEquals(JSON.stringify(rows2Again), JSON.stringify(rows2));

      // Non-participant is rejected.
      const { data: outsiderRows, error: outsiderError } = await outsider.userClient.rpc(
        'get_battle_templates',
        { p_battle_id: battleId },
      );
      assertExists(outsiderError, 'non-participant call must fail');
      assert(
        (outsiderError.message ?? '').includes('not_a_participant'),
        `expected not_a_participant, got: ${outsiderError.message}`,
      );
      assertEquals(outsiderRows, null);

      // No user context (service role: auth.uid() is NULL) is rejected.
      const { error: anonError } = await admin.rpc('get_battle_templates', {
        p_battle_id: battleId,
      });
      assertExists(anonError, 'call without auth.uid() must fail');
      assert(
        (anonError.message ?? '').includes('not_authenticated'),
        `expected not_authenticated, got: ${anonError.message}`,
      );
    } finally {
      if (p1) await deleteTestPlayer(admin, p1.profileId);
      if (p2) await deleteTestPlayer(admin, p2.profileId);
      if (outsider) await deleteTestPlayer(admin, outsider.profileId);
    }
  },
});
