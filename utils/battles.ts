/**
 * Battle API Helpers
 * Client-safe wrappers for battle Edge Functions
 */

import {
  FunctionInvokeError,
  invokeAuthenticatedFunction,
  supabase,
} from './supabase';
import type { BattleFormat } from '@/types/battle';
import { generateIdempotencyKey } from './characters';

export type BattleStatus =
  | 'created'
  | 'matched'
  | 'waiting_for_prompts'
  | 'resolving'
  | 'result_ready'
  | 'generating_video'
  | 'completed'
  | 'expired'
  | 'canceled'
  | 'moderation_failed'
  | 'generation_failed';

/**
 * Statuses a battle never leaves. Anything else means the battle is still live.
 *
 * This is the exact list the Edge Functions use to decide whether a character
 * is locked (`assertNoActiveBattleForCharacter`, `edit-character`,
 * `regenerate-portrait`, `restore-portrait`). Client-side checks must use the
 * same list: the home screen's shorter one omits the two failure states, which
 * would leave a character looking locked forever after a moderation failure.
 */
export const FINAL_BATTLE_STATUSES: readonly BattleStatus[] = [
  'completed',
  'expired',
  'canceled',
  'moderation_failed',
  'generation_failed',
];

export const LEAVABLE_BATTLE_STATUSES: readonly BattleStatus[] = [
  'created',
  'matched',
  'waiting_for_prompts',
];

export function canLeaveBattleStatus(status?: string | null): boolean {
  return LEAVABLE_BATTLE_STATUSES.includes(status as BattleStatus);
}

export function leaveActionLabel(args: {
  status?: string | null;
  mode: BattleMode;
  isBot: boolean;
  hasOpponent: boolean;
}): 'Cancel search' | 'Leave' | 'Forfeit' {
  if (args.status === 'created' && !args.hasOpponent) return 'Cancel search';
  if (args.mode === 'ranked' && !args.isBot && args.hasOpponent) {
    return 'Forfeit';
  }
  return 'Leave';
}

export type BattleMode =
  | 'ranked'
  | 'unranked'
  | 'friend_challenge'
  | 'daily_theme'
  | 'bot';
export type MoveType = 'attack' | 'defense' | 'finisher';

export interface MatchmakingResult {
  battle_id: string;
  matched: boolean;
  theme?: string;
  message?: string;
  opponent_name?: string;
  is_bot_battle?: boolean;
  converted_from_queue?: boolean;
  /** True when the server returned the battle already assigned to this action. */
  replayed_request?: boolean;
}

export interface MatchmakingRequestOptions {
  /** Accept an existing invitation using its frozen battle contract. */
  acceptBattleId?: string;
  /** Reuse this value for every network retry of one explicit player action. */
  requestId?: string;
  /** Waiting screens provide the row they are already presenting. */
  resumeBattleId?: string;
}

export interface SubmitPromptResult {
  success: boolean;
  prompt_id?: string;
  battle_status?: BattleStatus;
  message?: string;
  error?: string;
  /** HTTP status of a failed lock-in, so the screen can write its own copy. */
  status?: number;
  /** Machine-readable failure code when the function sent one. */
  code?: string;
}

export interface AppealBattleResult {
  success: boolean;
  appeal_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface ResolveBattleResult {
  battle_id?: string;
  winner_id?: string | null;
  is_draw?: boolean;
  explanation?: string;
  score_diff?: number;
  error?: string;
}

export interface LeaveBattleResult {
  success: boolean;
  action?: 'canceled' | 'forfeited' | 'already_terminal';
  winner_id?: string;
  /** 0 when the exit was free, i.e. before this player locked a prompt. */
  credits_charged?: number;
  /** Machine-readable failure, so the UI never matches on prose. */
  code?: 'insufficient_credits' | 'battle_in_progress' | 'not_participant';
  price?: number;
  balance?: number;
  shortfall?: number;
  error?: string;
}

export interface LeaveDialogCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface LeaveDialogArgs {
  format: BattleFormat;
  mode: BattleMode;
  isBot: boolean;
  /** Whether THIS player has locked a prompt — the thing being paid for. */
  isLocked: boolean;
  price: number;
  hasOpponent?: boolean;
}

/** Free explicit forfeit/cancel copy; parking is a separate local navigation action. */
export function leaveDialogCopy(args: LeaveDialogArgs): LeaveDialogCopy {
  const isRankedHuman =
    args.mode === 'ranked' && !args.isBot && args.hasOpponent !== false;
  return isRankedHuman
    ? {
        title: args.format === 'bo3' ? 'Forfeit series?' : 'Forfeit battle?',
        message:
          'This is free. Your opponent wins and this counts as a ranked loss.',
        confirmLabel: 'Forfeit',
      }
    : {
        title: 'Cancel battle?',
        message: 'This is free. The battle will be canceled.',
        confirmLabel: 'Cancel battle',
      };
}

/**
 * Start matchmaking for a battle
 */
export async function startMatchmaking(
  characterId: string,
  mode: BattleMode = 'ranked',
  options: MatchmakingRequestOptions = {},
): Promise<MatchmakingResult> {
  try {
    const data = await invokeAuthenticatedFunction<MatchmakingResult>(
      'matchmaking',
      {
        character_id: characterId,
        client_contract_version: 3,
        mode,
        request_id: options.requestId ?? generateIdempotencyKey(),
        resume_battle_id: options.resumeBattleId,
        accept_battle_id: options.acceptBattleId,
      },
    );

    return {
      battle_id: data.battle_id,
      matched: data.matched,
      theme: data.theme,
      message: data.message,
      opponent_name: data.opponent_name,
      is_bot_battle: data.is_bot_battle,
      converted_from_queue: data.converted_from_queue,
      replayed_request: data.replayed_request,
    };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Matchmaking error');
  }
}

/**
 * Leave a battle. Free before this player locks a prompt, charged after.
 *
 * Ranked human matches become forfeits that award the opponent the win;
 * unranked, bot and unmatched battles are canceled. The server decides which,
 * and decides the price — this only reports back what happened.
 *
 * A failure is returned rather than thrown, and it carries the structured
 * `code`/`shortfall` off the 402 so the caller can offer the shop instead of
 * matching on the error prose.
 */
export async function leaveBattle(
  battleId: string,
): Promise<LeaveBattleResult> {
  try {
    return await invokeAuthenticatedFunction<LeaveBattleResult>(
      'leave-battle',
      { battle_id: battleId },
    );
  } catch (err) {
    if (err instanceof FunctionInvokeError) {
      const body = (err.body ?? {}) as Record<string, unknown>;
      return {
        success: false,
        error: err.message,
        code: body.code as LeaveBattleResult['code'],
        price: typeof body.price === 'number' ? body.price : undefined,
        balance: typeof body.balance === 'number' ? body.balance : undefined,
        shortfall:
          typeof body.shortfall === 'number' ? body.shortfall : undefined,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to leave battle',
    };
  }
}

/**
 * Submit a prompt for a battle. `roundNumber` is optional and defaults on the
 * server to `battles.current_round`; single-format clients can omit it.
 *
 * Always custom text. The static `prompt_templates` library is retired -- the
 * arena offers per-fighter generated suggestions instead, and a suggestion has
 * no template row to reference. `submit-prompt` still accepts
 * `prompt_template_id` for the battles that were fought with one, but nothing
 * in the app sends it any more.
 */
export async function submitPrompt(
  battleId: string,
  moveType: MoveType,
  customPromptText: string,
  roundNumber?: number,
  authoringOrigin?: AuthoringOrigin,
): Promise<SubmitPromptResult> {
  try {
    const data = await invokeAuthenticatedFunction<SubmitPromptResult>(
      'submit-prompt',
      {
        battle_id: battleId,
        move_type: moveType,
        custom_prompt_text: customPromptText,
        round_number: roundNumber,
        client_contract_version: 3,
        ...(authoringOrigin ? { authoring_origin: authoringOrigin } : {}),
      },
    );

    return {
      success: data.success ?? false,
      prompt_id: data.prompt_id,
      battle_status: data.battle_status,
      message: data.message,
    };
  } catch (err) {
    // Keep the status and any code: the message is developer prose
    // ("Round not accepting prompts (status=resolving)") that the screen must
    // never show a player verbatim.
    if (err instanceof FunctionInvokeError) {
      const body = err.body as { error?: unknown; code?: unknown } | null;
      const nestedCode =
        body?.error && typeof body.error === 'object'
          ? (body.error as { code?: unknown }).code
          : body?.code;
      return {
        success: false,
        error: err.message,
        status: err.status,
        code: typeof nestedCode === 'string' ? nestedCode : undefined,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Whether a battle row has someone on the other side yet.
 *
 * Bots count the moment `bot_persona_id` is set; a human counts once
 * `player_two_id` is filled. Shared by matchmaking and waiting, which used to
 * carry identical copies.
 */
export function hasOpponent(battle: {
  player_two_id?: string | null;
  bot_persona_id?: string | null;
  is_player_two_bot?: boolean | null;
}): boolean {
  return (
    Boolean(battle.player_two_id) ||
    Boolean(battle.bot_persona_id) ||
    battle.is_player_two_bot === true
  );
}

/**
 * Appeal a battle result (ranked losses only, 1/day cap)
 */
export async function appealBattle(
  battleId: string,
): Promise<AppealBattleResult> {
  try {
    const data = await invokeAuthenticatedFunction<AppealBattleResult>(
      'appeal-battle',
      {
        battle_id: battleId,
      },
    );

    return {
      success: data.success ?? false,
      appeal_id: data.appeal_id,
      status: data.status,
      message: data.message,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Retry server-side battle resolution for a stuck resolving battle.
 */
export async function retryBattleResolution(
  battleId: string,
): Promise<ResolveBattleResult> {
  try {
    return await invokeAuthenticatedFunction<ResolveBattleResult>(
      'resolve-battle',
      {
        battle_id: battleId,
      },
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resolve battle',
    };
  }
}

/**
 * Get a battle by ID (with RLS)
 */
export async function getBattle(battleId: string) {
  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to fetch battle');
  }

  return data;
}

/**
 * Get battles for current user
 */
export async function getMyBattles(limit = 20) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('battles')
    .select(
      '*, player_one:profiles!battles_player_one_id_fkey(username, display_name), player_two:profiles!battles_player_two_id_fkey(username, display_name)',
    )
    .or(`player_one_id.eq.${user.id},player_two_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to fetch battles');
  }

  return data;
}

export interface ApproachHint { id: string; text: string }
export interface IntentHint { id: string; text: string; approachHints?: ApproachHint[] }
export interface MoveSuggestion {
  id?: string;
  structureVersion?: 2;
  compositionVersion?: 3;
  action?: string;
  intentHints?: IntentHint[];
  affordanceIds?: string[];
  title: string;
  body: string;
}

export type AuthoringOrigin = 'builder' | 'manual' | 'mixed' | 'unknown';
export type ComposerActionSuggestion = MoveSuggestion & {
  moveType: MoveType;
  source: 'authored' | 'ai';
};

export interface MoveSuggestionSet {
  id: string;
  suggestions: MoveSuggestion[];
  isPaid: boolean;
  creditsSpent: number;
}

export type MoveSuggestionFailure =
  | 'insufficient_credits'
  | 'rate_limited'
  | 'unavailable'
  | 'failed';

export interface MoveSuggestionResult {
  compositionStatus?: 'ready' | 'pending' | 'failed';
  code?: string;
  status?: 'ready' | 'pending' | 'failed';
  operationId?: string;
  set: MoveSuggestionSet | null;
  failure: MoveSuggestionFailure | null;
  message: string | null;
}

/**
 * What a read of a suggestion slot actually found.
 *
 * Three states rather than two, because "nothing I can show you" splits into
 * two cases the screen must treat differently: a set that is still being
 * generated, and a slot that is genuinely empty. Collapsing them is expensive
 * in a very specific way -- a `pending` row read as empty makes the screen
 * call the generate endpoint on top of a claim that already exists, the free
 * slot 23505s, and the player is CHARGED A CREDIT for a set that was already
 * on its way to them.
 *
 * That window used to be a rare race (background the app mid-generation, come
 * back). Once suggestions are prefetched server-side it becomes the normal
 * case, so the distinction has to live in the type.
 */
export type MoveSuggestionRead =
  | { status: 'ready'; suggestions: MoveSuggestion[]; isPaid?: boolean; id?: string }
  | { status: 'pending' }
  | { status: 'none' };

/**
 * Moderation statuses whose text may be shown to a player.
 *
 * An allow-list, not `!== 'pending'`: a status added to the enum later must
 * default to "do not show", and a deny-list would silently leak it.
 */
const READABLE_MODERATION_STATUSES = ['approved', 'flagged_human_review'];

const EMPTY_READ: MoveSuggestionRead = { status: 'none' };

/**
 * Reads the suggestion sets ALREADY generated for this (battle, round), for
 * every move type at once.
 *
 * This exists to stop the arena from charging a player for simply walking back
 * into the screen. `generateMoveSuggestions` spends the free slot on its first
 * call and charges a credit on every call after -- so calling it on mount
 * would bill someone for navigating back from prompt-entry and forward again.
 * Mount reads; only an explicit reroll generates.
 *
 * All three move types come back in one query rather than one query per move,
 * so switching moves in the workspace never waits on the network.
 *
 * THROWS on a query error, and that is deliberate. Returning an empty result
 * would be indistinguishable from "no set exists", which sends the caller
 * straight to the generate path -- i.e. a transient network blip would spend
 * the player's free slot, or a credit. The caller has a read-retry path built
 * for exactly this; it was previously unreachable because this function
 * swallowed its own errors.
 *
 * Owner-only under RLS (`move_prompt_suggestions_select_own`), and the client
 * holds SELECT and nothing else, so this cannot be used to see an opponent's
 * suggestions or to forge one.
 */
export async function readMoveSuggestions(
  battleId: string,
  roundNumber: number,
): Promise<Record<MoveType, MoveSuggestionRead>> {
  const result: Record<MoveType, MoveSuggestionRead> = {
    attack: EMPTY_READ,
    defense: EMPTY_READ,
    finisher: EMPTY_READ,
  };

  const { data, error } = await supabase
    .from('move_prompt_suggestions')
    .select('id, suggestions, created_at, moderation_status, move_type, is_paid')
    .eq('battle_id', battleId)
    .eq('round_number', roundNumber)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Move suggestions read error:', error);
    throw new Error(error.message || 'Failed to read move suggestions');
  }
  if (!Array.isArray(data)) return result;

  const seen = new Set<MoveType>();
  for (const raw of data) {
    const row = raw as {
      id?: string;
      suggestions?: unknown;
      moderation_status?: string | null;
      move_type?: string | null;
      is_paid?: boolean;
    };
    const moveType = row.move_type as MoveType | undefined;
    if (!moveType || !(moveType in result)) continue;
    // Rows arrive newest-first, so the first one seen for a move type is the
    // set that counts; a superseded reroll behind it is not.
    if (seen.has(moveType)) continue;
    seen.add(moveType);

    const status = row.moderation_status ?? '';
    if (status === 'pending') {
      result[moveType] = { status: 'pending' };
      continue;
    }
    // A rejected set must not resurface on a later visit. It reads as empty,
    // which matches the behaviour before this function grew a third state.
    if (!READABLE_MODERATION_STATUSES.includes(status)) continue;
    if (!Array.isArray(row.suggestions)) continue;

    result[moveType] = {
      status: 'ready',
      ...(typeof row.id === 'string' ? { id: row.id } : {}),
      suggestions: row.suggestions as MoveSuggestion[],
      ...(typeof row.is_paid === 'boolean' ? { isPaid: row.is_paid } : {}),
    };
  }

  return result;
}

/**
 * Single-move-type view of {@link readMoveSuggestions}, for callers that only
 * care about the move the player has picked.
 */
export async function getMoveSuggestions(
  battleId: string,
  moveType: MoveType,
  roundNumber: number,
): Promise<MoveSuggestionRead> {
  const all = await readMoveSuggestions(battleId, roundNumber);
  return all[moveType] ?? EMPTY_READ;
}

/**
 * Three prompt suggestions written for this player's fighter.
 *
 * The FIRST set per (battle, round, move type) is free; the server decides
 * that, not this call -- there is no "is this free" parameter, because a
 * client-asserted answer would be both racy and trivially forged. The returned
 * `isPaid` reports what actually happened.
 *
 * Failures are classified rather than thrown: the arena has a working fallback
 * (the static templates), so an outage here should degrade the screen, not
 * break it. Only `insufficient_credits` needs a distinct message to the player.
 */
/**
 * Classify a failed suggestion call from what the function actually sent.
 *
 * The previous classifier matched on the error MESSAGE for the substrings
 * `insufficient_credits` / `rate_limited`, but the function puts those in
 * `error.code` and writes prose in `error.message` — so no paywall or
 * rate-limit hit was ever recognised and every one became "unavailable" with
 * a retry button that re-ran the same doomed paid call. Status and code are
 * both authoritative; prose never is.
 */
export function classifySuggestionFailure(
  status: number | undefined,
  code: string | undefined,
): MoveSuggestionFailure {
  if (code === 'insufficient_credits' || status === 402)
    return 'insufficient_credits';
  if (code === 'rate_limited' || status === 429) return 'rate_limited';
  return 'unavailable';
}

/** A batch can only ensure existing per-type free slots; it can never purchase. */
export async function ensureFreeMoveSuggestionBanks(
  battleId: string,
  roundNumber: number,
  moveTypes: MoveType[] = ['attack', 'defense', 'finisher'],
): Promise<Partial<Record<MoveType, MoveSuggestionResult>>> {
  const types = [...new Set(moveTypes)];
  if (
    !types.length ||
    types.some((type) => !['attack', 'defense', 'finisher'].includes(type))
  )
    throw new Error('Select valid suggestion types');
  const unavailable = (
    code?: string,
    message = 'Suggestions unavailable',
  ): MoveSuggestionResult => ({
    set: null,
    failure: classifySuggestionFailure(undefined, code),
    message,
    ...(code ? { code } : {}),
  });
  const result: Partial<Record<MoveType, MoveSuggestionResult>> = {};
  for (const type of types) result[type] = unavailable();
  try {
    const reply = await invokeAuthenticatedFunction<{
      ok?: boolean;
      data?: { results?: unknown[] };
      error?: { code?: string; message?: string };
    }>('generate-move-suggestions', {
      battle_id: battleId,
      round_number: roundNumber,
      operation: 'ensure_free',
      move_types: types,
      client_contract_version: 3,
      composition_version: 3,
    });
    if (!Array.isArray(reply?.data?.results)) {
      for (const type of types)
        result[type] = unavailable(reply?.error?.code, reply?.error?.message);
      return result;
    }
    const seen = new Set<MoveType>();
    for (const value of reply.data.results) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      const type = row.move_type as MoveType;
      if (!types.includes(type) || seen.has(type)) continue;
      seen.add(type);
      const operationId =
        typeof row.operation_id === 'string' ? row.operation_id : undefined;
      const code = typeof row.error === 'string' ? row.error : undefined;
      if (row.status === 'pending' || row.status === 'stale') {
        result[type] = {
          set: null,
          status: 'pending',
          operationId,
          failure: null,
          message: null,
        };
      } else if (row.status === 'failed') {
        result[type] = {
          set: null,
          status: 'failed',
          operationId,
          failure: 'failed',
          code,
          message:
            'These ideas could not be delivered. Your free choices are ready.',
        };
      } else if (
        row.status === 'ready' &&
        typeof row.id === 'string' &&
        Array.isArray(row.suggestions)
      ) {
        result[type] = {
          status: 'ready',
          compositionStatus: row.composition_status as MoveSuggestionResult['compositionStatus'],
          operationId,
          failure: null,
          message: null,
          set: {
            id: row.id,
            suggestions: row.suggestions as MoveSuggestion[],
            isPaid: Boolean(row.is_paid),
            creditsSpent: Number(row.credits_spent ?? 0),
          },
        };
      } else result[type] = unavailable(code);
    }
  } catch (error) {
    let code: string | undefined;
    let status: number | undefined;
    if (error instanceof FunctionInvokeError) {
      status = error.status;
      const body = error.body as { error?: { code?: unknown } } | null;
      if (typeof body?.error?.code === 'string') code = body.error.code;
    }
    for (const type of types)
      result[type] = {
        ...unavailable(code),
        failure: classifySuggestionFailure(status, code),
      };
  }
  return result;
}

export async function generateMoveSuggestions(
  battleId: string,
  moveType: MoveType,
  roundNumber: number,
  options: {
    operation: 'ensure_free' | 'reroll';
    idempotencyKey?: string;
    expectedCredits?: number;
    compositionVersion?: 3;
    suggestionSetId?: string;
  } = { operation: 'ensure_free' },
): Promise<MoveSuggestionResult> {
  let data: {
    ok?: boolean;
    data?: {
      status?: 'ready' | 'pending' | 'failed';
      operation_id?: string;
      id: string;
      suggestions: MoveSuggestion[];
      is_paid: boolean;
      credits_spent: number;
      composition_status?: 'ready' | 'pending' | 'failed';
    };
    error?: { code?: string; message?: string };
  } | null = null;

  try {
    data = await invokeAuthenticatedFunction('generate-move-suggestions', {
      battle_id: battleId,
      move_type: moveType,
      round_number: roundNumber,
      operation: options.operation,
      idempotency_key: options.idempotencyKey,
      expected_credits: options.expectedCredits,
      client_contract_version: 3,
      composition_version: options.compositionVersion,
      ...(options.suggestionSetId ? { suggestion_set_id: options.suggestionSetId } : {}),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Suggestions unavailable';
    let status: number | undefined;
    let code: string | undefined;
    if (err instanceof FunctionInvokeError) {
      status = err.status;
      const body = err.body as { error?: unknown } | null;
      if (body?.error && typeof body.error === 'object') {
        const c = (body.error as { code?: unknown }).code;
        if (typeof c === 'string') code = c;
      }
    }
    const failure = classifySuggestionFailure(status, code);
    console.error('Move suggestions error:', { status, code, message });
    return { set: null, failure, message, code };
  }

  if (!data) {
    return {
      set: null,
      failure: 'unavailable',
      message: 'Suggestions unavailable',
    };
  }

  const payload = data.data;
  if (payload?.status === 'pending') {
    return {
      set: null,
      failure: null,
      message: null,
      status: 'pending',
      operationId: payload.operation_id,
    };
  }
  if (payload?.status === 'failed') {
    return {
      set: null,
      failure: 'failed',
      message:
        data.error?.message ??
        'Suggestions could not be delivered. Any charge has been refunded.',
      status: 'failed',
      operationId: payload.operation_id,
    };
  }
  if (!payload || !Array.isArray(payload.suggestions)) {
    return {
      set: null,
      failure: 'failed',
      message: data.error?.message ?? 'Suggestions unavailable',
    };
  }

  return {
    status: 'ready',
    compositionStatus: payload.composition_status,
    operationId: payload.operation_id,
    set: {
      id: payload.id,
      suggestions: payload.suggestions,
      isPaid: Boolean(payload.is_paid),
      creditsSpent: Number(payload.credits_spent ?? 0),
    },
    failure: null,
    message: null,
  };
}

export interface MoveCompletionResult {
  status: 'ready' | 'pending' | 'failed';
  operationId?: string;
  contextKey?: string;
  remainingAdaptations?: number;
  intentHints?: IntentHint[];
  approachHints?: ApproachHint[];
  error?: string;
}

/** Free, idempotent adaptation. No purchase or wallet fields are accepted. */
export async function completeMoveSuggestion(
  battleId: string, round: number, moveType: MoveType,
  target: 'intent' | 'approach', actionText: string, intentText?: string,
): Promise<MoveCompletionResult> {
  const reply = await invokeAuthenticatedFunction<{
    ok?: boolean;
    data?: { status: 'ready' | 'pending' | 'failed'; operation_id?: string;
      context_key?: string; remaining_adaptations?: number;
      intentHints?: IntentHint[]; approachHints?: ApproachHint[]; result?: { intentHints?: IntentHint[]; approachHints?: ApproachHint[] }; error?: string };
    error?: { code?: string };
  }>('complete-move-suggestion', {
    battle_id: battleId, round_number: round, move_type: moveType, target,
    action_text: actionText.trim(),
    ...(target === 'approach' ? { intent_text: intentText?.trim() } : {}),
    composition_version: 3, client_contract_version: 3,
  });
  const value = reply.data;
  if (!value) return { status: 'failed', error: reply.error?.code ?? 'unavailable' };
  return { status: value.status, operationId: value.operation_id,
    contextKey: value.context_key, remainingAdaptations: value.remaining_adaptations,
    intentHints: value.result?.intentHints ?? value.intentHints, approachHints: value.result?.approachHints ?? value.approachHints,
    error: value.error ?? reply.error?.code };
}

/**
 * Get daily theme
 */
export async function getDailyTheme() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_themes')
    .select('*')
    .eq('theme_date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Failed to fetch daily theme');
  }

  return data;
}

/**
 * Get daily quests for current user
 */
export async function getDailyQuests() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('player_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('profile_id', user.id)
    .eq('quest_date', today)
    .order('quest_date', { ascending: false });

  if (error) {
    console.error('Failed to fetch daily quests:', error);
    return [];
  }

  return data;
}

export interface OpponentMoveProfile {
  recent_moves: MoveType[];
  opponent_archetype: string | null;
  counter_win_rates: Partial<
    Record<MoveType, { total: number; wins: number; win_rate: number }>
  >;
}

/**
 * Opponent move-type profile for a battle (§7.1 legibility): last 5 move
 * types from resolved battles + per-move-type win rates vs their archetype.
 * Server-validated (participants only); returns null on any failure so the
 * prompt screen never blocks on it.
 */
export async function getOpponentMoveProfile(
  battleId: string,
): Promise<OpponentMoveProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_opponent_move_profile', {
      p_battle_id: battleId,
    });

    if (error || !data) {
      if (error) console.error('Opponent move profile error:', error);
      return null;
    }

    return data as OpponentMoveProfile;
  } catch (err) {
    console.error('Opponent move profile exception:', err);
    return null;
  }
}

/** Only completed historical moves, oldest first; never expose prediction fields. */
export async function getOpponentMoveHistory(
  battleId: string,
): Promise<{ move_type: MoveType }[]> {
  const profile = await getOpponentMoveProfile(battleId);
  return (profile?.recent_moves ?? [])
    .slice(-5)
    .map((move_type) => ({ move_type }));
}

export interface RivalSummary {
  rivalProfileId: string;
  displayName: string;
  username: string | null;
  battlesCount: number;
  lastBattleAt: string | null;
}

/**
 * Most-played opponents over the last 30 days (concept §5 "Rivals").
 *
 * `apply_post_battle_rewards` has been writing the `rivals` table on every
 * completed non-bot battle since the beginning, and nothing has ever read it --
 * the table, its purpose-built index and its RLS policy all existed with zero
 * client references. This is the read path.
 *
 * Note `battles_count_30d` is a monotonic counter that nothing decays, so the
 * "30d" in its name is aspirational. `last_battle_at` is filtered here so a
 * long-dormant pairing does not sit at the top of the list forever; fixing the
 * counter itself needs a server-side sweep.
 */
export async function getRivals(limit = 5): Promise<RivalSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('rivals')
    .select('rival_profile_id, battles_count_30d, last_battle_at')
    .eq('profile_id', user.id)
    .gte('last_battle_at', since)
    .order('battles_count_30d', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in(
      'id',
      data.map((r) => r.rival_profile_id),
    );

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as Record<string, string>]),
  );

  return data.map((r) => {
    const p = byId.get(r.rival_profile_id);
    return {
      rivalProfileId: r.rival_profile_id,
      displayName: p?.display_name || p?.username || 'Unknown player',
      username: p?.username ?? null,
      battlesCount: r.battles_count_30d ?? 0,
      lastBattleAt: r.last_battle_at ?? null,
    };
  });
}
