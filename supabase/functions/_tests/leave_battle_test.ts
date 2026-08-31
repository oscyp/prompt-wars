// Tests for the decisions behind leaving a battle.
//
// The load-bearing one is the anti-pay-to-win assertion: leaving is the first
// action in the game where a player spends credits and a battle result comes
// out the other end, so the guarantee that the payment leaves no trace in
// anything the judge can see needs to be executable, not just intended.

import {
  assertEquals,
  assertFalse,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  LEAVABLE_STATUSES,
  TERMINAL_BATTLE_STATUSES,
  buildLeaveScorePayload,
  leaveIdempotencyKey,
  leaveOutcomeFor,
} from '../_shared/leave-battle.ts';
import { assertNoMonetizationDataInScoring } from '../_shared/anti-p2w.ts';

const LEAVER = '11111111-1111-1111-1111-111111111111';
const OPPONENT = '22222222-2222-2222-2222-222222222222';

Deno.test('leaveOutcomeFor: only a matched ranked human match is a forfeit', () => {
  const cases: {
    mode: string;
    isPlayerTwoBot: boolean;
    playerTwoId: string | null;
    expected: 'cancel' | 'forfeit';
  }[] = [
    { mode: 'ranked', isPlayerTwoBot: false, playerTwoId: OPPONENT, expected: 'forfeit' },
    // A bot has no record worth adjusting.
    { mode: 'ranked', isPlayerTwoBot: true, playerTwoId: OPPONENT, expected: 'cancel' },
    // Nobody was ever matched in.
    { mode: 'ranked', isPlayerTwoBot: false, playerTwoId: null, expected: 'cancel' },
    { mode: 'unranked', isPlayerTwoBot: false, playerTwoId: OPPONENT, expected: 'cancel' },
    { mode: 'friend_challenge', isPlayerTwoBot: false, playerTwoId: OPPONENT, expected: 'cancel' },
    { mode: 'daily_theme', isPlayerTwoBot: false, playerTwoId: OPPONENT, expected: 'cancel' },
    { mode: 'bot', isPlayerTwoBot: true, playerTwoId: OPPONENT, expected: 'cancel' },
  ];

  for (const c of cases) {
    assertEquals(
      leaveOutcomeFor(c),
      c.expected,
      `${c.mode} bot=${c.isPlayerTwoBot} matched=${c.playerTwoId !== null}`,
    );
  }
});

Deno.test('buildLeaveScorePayload: keyed `resolution`, never `outcome`', () => {
  // Both spellings existed. compose-reveal-payload reads `resolution`, so a
  // payload written as `outcome` produced a reveal that could not describe
  // itself. Pinned so it cannot drift back.
  const payload = buildLeaveScorePayload({ leaverId: LEAVER, format: 'single' });

  assertEquals(payload.resolution, 'forfeit');
  assertEquals(payload.reason, 'player_left');
  assertEquals(payload.forfeited_profile_id, LEAVER);
  assertEquals(payload.outcome, undefined);
});

Deno.test('buildLeaveScorePayload: explanation addresses the winner', () => {
  const payload = buildLeaveScorePayload({ leaverId: LEAVER, format: 'single' });
  // The reveal is what the winner reads, matching the timeout-forfeit string.
  assertEquals(
    payload.explanation,
    'Win by forfeit — your opponent left the battle.',
  );
});

Deno.test('buildLeaveScorePayload: no monetization data reaches scoring', () => {
  // The whole anti-pay-to-win contract for this feature: the ONLY record that
  // the exit was paid for is the wallet_transactions row.
  for (const format of ['single', 'bo3']) {
    const payload = buildLeaveScorePayload({
      leaverId: LEAVER,
      format,
      currentRound: 2,
      playerOneRoundsWon: 1,
      playerTwoRoundsWon: 0,
      ratingGated: 'diversity',
    });
    assertNoMonetizationDataInScoring(payload);
  }
});

Deno.test('buildLeaveScorePayload: bo3 records where the series stood', () => {
  const payload = buildLeaveScorePayload({
    leaverId: LEAVER,
    format: 'bo3',
    currentRound: 2,
    playerOneRoundsWon: 1,
    playerTwoRoundsWon: 0,
  });

  assertEquals(payload.format, 'bo3');
  assertEquals(payload.rounds_won, { player_one: 1, player_two: 0 });
  assertEquals(payload.abandoned_round, 2);
});

Deno.test('buildLeaveScorePayload: single format carries no series fields', () => {
  const payload = buildLeaveScorePayload({ leaverId: LEAVER, format: 'single' });

  assertEquals(payload.format, undefined);
  assertEquals(payload.rounds_won, undefined);
  assertEquals(payload.abandoned_round, undefined);
});

Deno.test('buildLeaveScorePayload: rating_gated only when a gate fired', () => {
  const ungated = buildLeaveScorePayload({ leaverId: LEAVER, format: 'single' });
  assertEquals(ungated.rating_gated, undefined);

  const gated = buildLeaveScorePayload({
    leaverId: LEAVER,
    format: 'single',
    ratingGated: 'diversity',
  });
  assertEquals(gated.rating_gated, 'diversity');
});

Deno.test('LEAVABLE_STATUSES: too late once the judge has the battle', () => {
  // Racing round-resolve for the 'resolving' claim would be a far worse
  // failure than telling a player they were a few seconds late.
  for (const status of ['resolving', 'result_ready', 'generating_video']) {
    assertFalse(
      (LEAVABLE_STATUSES as readonly string[]).includes(status),
      `${status} must not be leavable`,
    );
  }
  for (const status of ['created', 'matched', 'waiting_for_prompts']) {
    assert(
      (LEAVABLE_STATUSES as readonly string[]).includes(status),
      `${status} must be leavable`,
    );
  }
});

Deno.test('terminal and leavable statuses never overlap', () => {
  for (const status of LEAVABLE_STATUSES) {
    assertFalse(
      (TERMINAL_BATTLE_STATUSES as readonly string[]).includes(status),
    );
  }
});

Deno.test('leaveIdempotencyKey: stable, and independent of round and clock', () => {
  const first = leaveIdempotencyKey('battle-1', LEAVER);
  const second = leaveIdempotencyKey('battle-1', LEAVER);

  // A double-tap must produce the same key or the player pays twice.
  assertEquals(first, second);
  assertEquals(first, 'leave_battle_battle-1_11111111-1111-1111-1111-111111111111');

  // Different players in the same battle are charged separately.
  assert(first !== leaveIdempotencyKey('battle-1', OPPONENT));
  // Different battles are separate charges.
  assert(first !== leaveIdempotencyKey('battle-2', LEAVER));
});
