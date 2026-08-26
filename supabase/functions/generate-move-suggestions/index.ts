// Generate Move Suggestions Edge Function
//
// Returns three prompt suggestions written for the caller's fighter, for one
// move type in one round. The first set per (battle, round, move type) is
// free; further sets cost a credit.
//
// Free-vs-paid is decided by ATTEMPTING the free insert, not by counting rows
// first. Counting is check-then-act: two taps milliseconds apart both read
// zero and both get a free set. The partial unique index
// idx_move_prompt_suggestions_free_slot makes Postgres pick the winner, and a
// 23505 means "this call is paid".
//
// Anti-pay-to-win: whether a prompt came from a paid suggestion is recorded on
// move_prompt_suggestions and NOWHERE else. It must never reach the judge --
// assertNoMonetizationDataInScoring throws on such a key, and round-resolve
// claims the round into `resolving` before judging, so a leak here would
// strand the round rather than merely bias it.

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { err, getEditPrice, ok } from '../_shared/character-creation.ts';
import { isTestUser } from '../_shared/test-user.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import {
  generateSuggestions,
  type MoveType,
  SUGGESTION_PROMPT_VERSION,
  SuggestionError,
} from '../_shared/move-suggestions.ts';

const MOVE_TYPES: MoveType[] = ['attack', 'defense', 'finisher'];
const PRICE_KIND = 'prompt_suggestions_reroll';

interface SuggestionRequestBody {
  battle_id: string;
  move_type: MoveType;
  round_number?: number;
  idempotency_key?: string;
}

/** Maps a provider failure to a status the client can act on differently. */
function statusForSuggestionError(code: SuggestionError['code']): number {
  switch (code) {
    case 'not_configured':
      return 503;
    case 'timeout':
    case 'server_error':
    case 'network':
      return 502;
    default:
      return 500;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  try {
    userId = await getAuthUserId(req);
  } catch {
    return err('unauthorized', 'authentication required', 401);
  }

  let body: SuggestionRequestBody;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }

  if (!body.battle_id || !MOVE_TYPES.includes(body.move_type)) {
    return err('bad_request', 'battle_id and a valid move_type are required', 400);
  }

  const supabase = createServiceClient();

  // ---------------------------------------------------------------------
  // Participation. Service role bypasses RLS, so this is the only thing
  // stopping a caller from generating suggestions for someone else's battle.
  // ---------------------------------------------------------------------
  const { data: battle, error: battleErr } = await supabase
    .from('battles')
    // Single string literal, not a concatenation: postgrest-js parses this at
    // the type level and a runtime-built string collapses every column to
    // GenericStringError.
    .select('id, status, theme, current_round, player_one_id, player_two_id, player_one_character_id, player_two_character_id')
    .eq('id', body.battle_id)
    .maybeSingle();

  if (battleErr) return err('server_error', battleErr.message, 500);
  if (!battle) return err('not_found', 'battle not found', 404);

  const isPlayerOne = battle.player_one_id === userId;
  const isPlayerTwo = battle.player_two_id === userId;
  if (!isPlayerOne && !isPlayerTwo) {
    return err('forbidden', 'not a participant in this battle', 403);
  }

  // Terminal-state exclusion rather than an allow-list of live states, matching
  // assertNoActiveBattleForCharacter. An allow-list would 409 during the
  // round-advance window, when the battle briefly sits in `resolving` /
  // `result_ready` before the next round opens -- exactly when a player is
  // looking at the next round's move select.
  const TERMINAL = [
    'completed',
    'expired',
    'canceled',
    'moderation_failed',
    'generation_failed',
  ];
  if (TERMINAL.includes(String(battle.status))) {
    return err('conflict', `battle is ${battle.status}`, 409);
  }

  const roundNumber = Number(body.round_number ?? battle.current_round ?? 1);
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 3) {
    return err('bad_request', 'round_number must be 1-3', 400);
  }

  const characterId = isPlayerOne
    ? battle.player_one_character_id
    : battle.player_two_character_id;

  // ---------------------------------------------------------------------
  // Idempotency: a retried request returns the original set rather than
  // charging again. Checked before the rate limit so a retry storm caused by
  // a flaky connection cannot rate-limit the player out of a set they have
  // already paid for.
  // ---------------------------------------------------------------------
  const headerKey = req.headers.get('Idempotency-Key')?.trim() ??
    body.idempotency_key;
  const idempotencyKey = headerKey
    ? generateIdempotencyKey([
      'suggest',
      body.battle_id,
      String(roundNumber),
      body.move_type,
      userId,
      headerKey,
    ])
    : null;

  if (idempotencyKey) {
    const { data: replay } = await supabase
      .from('move_prompt_suggestions')
      .select('id, suggestions, is_paid, credits_spent')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (replay) {
      return ok({
        idempotent: true,
        id: replay.id,
        suggestions: replay.suggestions,
        is_paid: replay.is_paid,
        credits_spent: replay.credits_spent,
      });
    }
  }

  const testUser = await isTestUser(supabase, userId);

  // ---------------------------------------------------------------------
  // Rate limit. FAILS CLOSED: an RPC error here means we cannot prove the
  // caller is within limits, and this endpoint spends money per call.
  // ---------------------------------------------------------------------
  if (!testUser) {
    const { data: rl, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_profile_id: userId,
      p_action: 'prompt_suggestions',
    });
    if (rlErr) {
      console.error('Rate limit check failed (failing closed):', rlErr);
      return err('server_error', 'rate limit unavailable', 503);
    }
    if (!rl?.allowed) {
      return err(
        'rate_limited',
        `suggestion limit reached (${rl?.reason ?? 'unknown'})`,
        429,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Fighter context. Read server-side because the client cannot: these
  // columns are owner-only under characters_select_own, and the prompt needs
  // all of them to produce something specific to this fighter.
  // ---------------------------------------------------------------------
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, profile_id, name, archetype, vibe, silhouette, era, expression, palette_key, battle_cry, style_description, signature_item:signature_items(name, prompt_fragment)')
    .eq('id', characterId)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }

  // ---------------------------------------------------------------------
  // Free slot first. A 23505 here IS the answer to "is this call paid".
  //
  // The row is claimed with a placeholder before the provider is called, so
  // the slot cannot be lost to a concurrent request while we wait on the LLM.
  // It is deleted again if generation fails, which returns the free slot to
  // the player rather than burning it on an outage.
  // ---------------------------------------------------------------------
  const PLACEHOLDER = [{ title: 'pending', body: 'generation in progress' }];

  const { data: freeRow, error: freeErr } = await supabase
    .from('move_prompt_suggestions')
    .insert({
      battle_id: battle.id,
      profile_id: userId,
      character_id: character.id,
      round_number: roundNumber,
      move_type: body.move_type,
      suggestions: PLACEHOLDER,
      is_paid: false,
      credits_spent: 0,
      moderation_status: 'pending',
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .maybeSingle();

  let rowId: string | null = freeRow?.id ?? null;
  let isPaid = false;
  let creditsSpent = 0;
  let walletTxId: string | null = null;

  if (freeErr) {
    // 23505 on the free-slot index means the free set is used; anything else
    // is a real failure and must not silently become a charge.
    if (freeErr.code !== '23505') {
      return err('server_error', freeErr.message, 500);
    }

    const price = await getEditPrice(supabase, PRICE_KIND);
    const credits = price?.credits ?? 1;

    if (credits > 0 && !testUser) {
      const spendKey = idempotencyKey ??
        `suggest_${battle.id}_${roundNumber}_${body.move_type}_${userId}_${Date.now()}`;

      const { data: spend, error: spendErr } = await supabase.rpc(
        'spend_for_prompt_suggestions',
        {
          p_profile_id: userId,
          p_battle_id: battle.id,
          p_credits: credits,
          p_idempotency_key: spendKey,
        },
      );
      if (spendErr) return err('server_error', spendErr.message, 500);
      if (!spend?.success) {
        return err(
          spend?.error === 'insufficient_credits'
            ? 'insufficient_credits'
            : 'server_error',
          spend?.error === 'insufficient_credits'
            ? 'not enough credits for another suggestion set'
            : String(spend?.error ?? 'spend failed'),
          spend?.error === 'insufficient_credits' ? 402 : 500,
        );
      }
      creditsSpent = credits;
      walletTxId = spend.transaction_id ?? null;
    }

    isPaid = creditsSpent > 0;

    const { data: paidRow, error: paidErr } = await supabase
      .from('move_prompt_suggestions')
      .insert({
        battle_id: battle.id,
        profile_id: userId,
        character_id: character.id,
        round_number: roundNumber,
        move_type: body.move_type,
        suggestions: PLACEHOLDER,
        // A test user rerolling pays nothing, and the paid-consistency CHECK
        // forbids is_paid with zero credits -- so they take a free-shaped row.
        // The free slot is already occupied, so this can only be a second row.
        is_paid: isPaid,
        credits_spent: creditsSpent,
        wallet_transaction_id: walletTxId,
        moderation_status: 'pending',
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .maybeSingle();

    if (paidErr || !paidRow) {
      await refund(supabase, userId, creditsSpent, walletTxId, battle.id);
      return err('server_error', paidErr?.message ?? 'insert failed', 500);
    }
    rowId = paidRow.id;
  }

  if (!rowId) {
    await refund(supabase, userId, creditsSpent, walletTxId, battle.id);
    return err('server_error', 'could not claim a suggestion slot', 500);
  }

  // ---------------------------------------------------------------------
  // Generate. Any failure past this point must undo the claim AND the charge.
  // ---------------------------------------------------------------------
  try {
    const sigItem = Array.isArray(character.signature_item)
      ? character.signature_item[0]
      : character.signature_item;

    const result = await generateSuggestions({
      fighter: {
        name: character.name,
        archetype: character.archetype,
        vibe: character.vibe,
        silhouette: character.silhouette,
        era: character.era,
        expression: character.expression,
        paletteKey: character.palette_key,
        battleCry: character.battle_cry,
        styleDescription: character.style_description,
        signatureItemName: sigItem?.name ?? null,
        signatureItemFragment: sigItem?.prompt_fragment ?? null,
      },
      moveType: body.move_type,
      theme: battle.theme ?? 'an open arena',
      roundNumber,
      // Varied per row so a reroll cannot return the previous set verbatim.
      seed: Math.floor(Math.random() * 2_147_483_647),
    });

    // Moderate BEFORE persisting, so a player never pays for three rejected
    // suggestions and never sees text that should not have been shown.
    const moderator = new TextModerationProvider();
    const verdicts = await Promise.all(
      result.suggestions.map((s) => moderator.moderate(`${s.title}\n${s.body}`)),
    );
    const kept = result.suggestions.filter(
      (_, i) => verdicts[i].status !== 'rejected',
    );

    if (kept.length === 0) {
      throw new SuggestionError(
        'malformed_response',
        'all generated suggestions were rejected by moderation',
      );
    }

    const anyFlagged = verdicts.some(
      (v) => v.status === 'flagged_human_review',
    );

    const { error: updErr } = await supabase
      .from('move_prompt_suggestions')
      .update({
        suggestions: kept,
        moderation_status: anyFlagged ? 'flagged_human_review' : 'approved',
        provider: result.provider,
        provider_model: result.model,
        provider_cost_usd: result.costUsd ?? null,
        provider_latency_ms: result.latencyMs,
      })
      .eq('id', rowId);

    if (updErr) throw new SuggestionError('server_error', updErr.message);

    return ok({
      id: rowId,
      suggestions: kept,
      is_paid: isPaid,
      credits_spent: creditsSpent,
      move_type: body.move_type,
      round_number: roundNumber,
      prompt_version: SUGGESTION_PROMPT_VERSION,
    });
  } catch (e) {
    // Release the slot so a provider outage does not consume the free set,
    // then refund. Order matters: the delete is the thing the player would
    // notice losing, and it cannot fail for lack of credits.
    await supabase.from('move_prompt_suggestions').delete().eq('id', rowId);
    await refund(supabase, userId, creditsSpent, walletTxId, battle.id);

    const code = e instanceof SuggestionError ? e.code : 'server_error';
    console.error('Suggestion generation failed:', code, e);
    return err(
      'generation_failed',
      e instanceof Error ? e.message : 'suggestion generation failed',
      statusForSuggestionError(code as SuggestionError['code']),
    );
  }
});

/**
 * Returns the credits for a failed set. Keyed on the wallet transaction id so
 * a retry of this same failure cannot refund twice.
 */
async function refund(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  credits: number,
  walletTxId: string | null,
  battleId: string,
): Promise<void> {
  if (credits <= 0 || !walletTxId) return;
  const { error } = await supabase.rpc('grant_credits', {
    p_profile_id: userId,
    p_amount: credits,
    p_reason: 'prompt_suggestions_refund:generation_failed',
    p_idempotency_key: `refund_${walletTxId}`,
    p_battle_id: battleId,
    p_purchase_id: null,
    p_metadata: { feature: 'move_prompt_suggestions' },
  });
  if (error) {
    // Surfaced loudly: the player is out a credit and only the log will say so.
    console.error('CREDIT REFUND FAILED', { userId, credits, walletTxId, error });
  }
}
