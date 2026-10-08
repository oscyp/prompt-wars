import type { MoveType } from './battles';
import type { ApproachHint, IntentHint } from './promptComposer';
import { FunctionInvokeError, invokeAuthenticatedFunction } from './supabase';

export interface MoveStepContext {
  battleId: string;
  roundNumber: number;
  moveType: MoveType;
  target: 'intent' | 'approach';
  actionText: string;
  intentText?: string;
}
export interface MoveStepRequest extends MoveStepContext {
  idempotencyKey: string;
  expectedCredits: number;
}
export interface MoveStepResult {
  status: 'ready' | 'pending' | 'failed';
  operationId: string;
  contextKey: string;
  target: 'intent' | 'approach';
  creditsSpent: number;
  refunded: boolean;
  intentHints?: IntentHint[];
  approachHints?: ApproachHint[];
  error?: string;
}
export class MoveStepRequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MoveStepRequestError';
  }
}
/** Local identity never substitutes for the authoritative server context hash. */
export function moveStepContextKey(context: MoveStepContext): string {
  return JSON.stringify([
    context.battleId,
    context.roundNumber,
    context.moveType,
    context.target,
    context.actionText,
    context.target === 'approach' ? context.intentText : null,
  ]);
}
function isHints(value: unknown, max: number): value is ApproachHint[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value.map((hint) => hint?.id)).size === 3 &&
    value.every(
      (hint) =>
        hint &&
        typeof hint.id === 'string' &&
        hint.id.length > 0 &&
        typeof hint.text === 'string' &&
        hint.text.trim().length >= 5 &&
        hint.text.length <= max,
    )
  );
}
export async function rerollMoveStepSuggestions(
  request: MoveStepRequest,
): Promise<MoveStepResult> {
  if (![0, 1].includes(request.expectedCredits) || !request.idempotencyKey) {
    throw new MoveStepRequestError(
      'purchase_confirmation_required',
      'Check the price before requesting new choices.',
    );
  }
  let reply;
  try {
    reply = await invokeAuthenticatedFunction<{
      ok?: boolean;
      data?: {
        status: string;
        operation_id: string;
        context_key: string;
        target: string;
        composition_version: number;
        credits_spent: number;
        refunded: boolean;
        result?: {
          intentHints?: IntentHint[];
          approachHints?: ApproachHint[];
        } | null;
        error?: string;
      };
      error?: { code?: string; message?: string };
    }>('reroll-move-step-suggestions', {
      battle_id: request.battleId,
      round_number: request.roundNumber,
      move_type: request.moveType,
      target: request.target,
      action_text: request.actionText,
      ...(request.target === 'approach'
        ? { intent_text: request.intentText }
        : {}),
      composition_version: 3,
      client_contract_version: 3,
      idempotency_key: request.idempotencyKey,
      expected_credits: request.expectedCredits,
    });
  } catch (error) {
    if (error instanceof FunctionInvokeError) {
      const detail = error.body?.error as
        | { code?: string; message?: string }
        | undefined;
      throw new MoveStepRequestError(
        detail?.code ?? 'unavailable',
        detail?.message ?? error.message,
      );
    }
    throw error;
  }
  if (!reply?.ok)
    throw new MoveStepRequestError(
      reply?.error?.code ?? 'unavailable',
      reply?.error?.message ?? 'Could not check this request.',
    );
  const data = reply.data;
  if (
    !data ||
    !['ready', 'pending', 'stale', 'failed'].includes(data.status) ||
    !data.operation_id ||
    !data.context_key ||
    data.target !== request.target ||
    data.composition_version !== 3 ||
    !Number.isFinite(data.credits_spent) ||
    data.credits_spent < 0
  ) {
    throw new MoveStepRequestError(
      'invalid_response',
      'Could not verify delivery. Check this request again.',
    );
  }
  if (data.status === 'ready') {
    const complete =
      request.target === 'intent'
        ? isHints(data.result?.intentHints, 180) &&
          data.result!.intentHints!.every((hint) =>
            isHints(hint.approachHints, 240),
          )
        : isHints(data.result?.approachHints, 240);
    if (!complete)
      throw new MoveStepRequestError(
        'invalid_response',
        'Could not verify all three choices. Check this request again.',
      );
  }
  return {
    status:
      data.status === 'stale'
        ? 'pending'
        : (data.status as MoveStepResult['status']),
    operationId: data.operation_id,
    contextKey: data.context_key,
    target: request.target,
    creditsSpent: data.credits_spent,
    refunded: data.refunded === true,
    ...(data.status === 'ready' ? data.result : {}),
    ...(data.error ? { error: data.error } : {}),
  };
}
