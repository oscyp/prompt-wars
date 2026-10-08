import {
  type CompletionResult,
  COMPOSITION_SUGGESTION_PROMPT_VERSION,
  type CompositionExtensionRequest,
  type CompositionExtensionResult,
  generateCompositionExtension,
  SuggestionError,
} from "./move-suggestions.ts";
import {
  type CompletionRequestBody,
  parseCompletionRequest,
} from "./suggestion-completion.ts";
import {
  type ModerationUnit,
  TextModerationProvider,
  type TextModerationResult,
} from "./moderation.ts";
import type { SuggestionDb } from "./suggestion-service.ts";

export interface StepRerollRequest extends CompletionRequestBody {
  idempotency_key: string;
  expected_credits: number;
}
export interface StepClaim {
  status?: "claimed" | "pending" | "ready" | "failed" | "stale";
  operation_id?: string;
  lease_token?: string;
  context_key?: string;
  target?: "intent" | "approach";
  composition_version?: number;
  credits_spent?: number;
  is_paid?: boolean;
  refunded?: boolean;
  current_credits?: number;
  result?: CompletionResult | null;
  error?: string;
}

export function parseStepRerollRequest(
  value: unknown,
  headerKey?: string | null,
): StepRerollRequest {
  const parent = parseCompletionRequest(value);
  const body = value as Record<string, unknown>;
  const key = headerKey?.trim() ||
    (typeof body.idempotency_key === "string"
      ? body.idempotency_key.trim()
      : "");
  if (
    key.length < 8 || key.length > 128 ||
    !Number.isSafeInteger(body.expected_credits) ||
    Number(body.expected_credits) < 0
  ) {
    throw new SuggestionError(
      "purchase_confirmation_required",
      "Confirm the price before requesting new ideas.",
    );
  }
  return {
    ...parent,
    idempotency_key: key,
    expected_credits: Number(body.expected_credits),
  };
}

/** Allow-list the response: an RPC's private worker context is never client data. */
export function publicStepResult(claim: StepClaim): Record<string, unknown> {
  return {
    status: claim.status === "claimed" ? "pending" : claim.status,
    operation_id: claim.operation_id,
    context_key: claim.context_key,
    target: claim.target,
    composition_version: claim.composition_version,
    credits_spent: claim.credits_spent,
    is_paid: claim.is_paid,
    refunded: claim.refunded,
    result: claim.status === "ready" ? claim.result : null,
    error: claim.error,
  };
}

export async function reserveStepReroll(
  db: SuggestionDb,
  profileId: string,
  body: StepRerollRequest,
  roundNumber: number,
  flags: { allowGenerate: boolean; allowReroll: boolean },
): Promise<StepClaim> {
  const { data, error } = await db.rpc("reserve_suggestion_step_operation", {
    p_profile_id: profileId,
    p_battle_id: body.battle_id,
    p_round_number: roundNumber,
    p_move_type: body.move_type,
    p_target: body.target,
    p_action_text: body.action_text,
    p_intent_text: body.intent_text ?? null,
    p_idempotency_key: body.idempotency_key,
    p_expected_credits: body.expected_credits,
    p_allow_generate: flags.allowGenerate,
    p_allow_reroll: flags.allowReroll,
  });
  if (error || !data) {
    throw new SuggestionError(
      "server_error",
      "Purchase reservation unavailable. Retry the same purchase.",
    );
  }
  return data;
}

function moderationUnits(
  req: CompositionExtensionRequest,
  result: CompletionResult,
): ModerationUnit[] {
  if (Array.isArray(result)) {
    throw new SuggestionError(
      "malformed_response",
      "A step purchase must not replace its parent bank.",
    );
  }
  const action = req.actionText!;
  const intents = req.target === "intent" ? result.intentHints : [{
    id: "parent",
    text: req.intentText!,
    approachHints: result.approachHints,
  }];
  if (
    !intents || intents.length !== (req.target === "intent" ? 3 : 1) ||
    intents.some((h) => h.approachHints?.length !== 3)
  ) {
    throw new SuggestionError(
      "malformed_response",
      "Complete step ideas are required.",
    );
  }
  return [
    { kind: "action", text: action },
    ...intents.flatMap((intent): ModerationUnit[] => [
      { kind: "intent", text: intent.text },
      { kind: "pair", text: `${action} ${intent.text}` },
      ...intent.approachHints!.flatMap((approach): ModerationUnit[] => [
        { kind: "approach", text: approach.text },
        { kind: "triple", text: `${action} ${intent.text} ${approach.text}` },
      ]),
    ]),
  ];
}

/** The database owns delivery and refunds; this worker owns only its renewable token. */
export async function generateClaimedStep(
  db: SuggestionDb,
  claim: StepClaim,
  loadContext: () => Promise<CompositionExtensionRequest>,
  dependencies: {
    generate?: (
      req: CompositionExtensionRequest,
    ) => Promise<CompositionExtensionResult>;
    moderate?: (text: string) => Promise<TextModerationResult>;
    moderationDeadlineMs?: number;
  } = {},
): Promise<StepClaim> {
  if (claim.status !== "claimed" || !claim.operation_id || !claim.lease_token) {
    throw new Error("Unowned step purchase");
  }
  let lost = false;
  let finalizing = false;
  let heartbeat: Promise<void> | null = null;
  const renew = async () => {
    const { data, error } = await db.rpc("renew_suggestion_step_operation", {
      p_operation_id: claim.operation_id,
      p_lease_token: claim.lease_token,
    });
    if ((error || data !== true) && !finalizing) {
      lost = true;
      throw new Error("Step purchase lease lost");
    }
  };
  const finish = async (
    result: CompletionResult | null,
    failure: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<StepClaim> => {
    finalizing = true;
    const { data, error } = await db.rpc("finish_suggestion_step_operation", {
      p_operation_id: claim.operation_id,
      p_lease_token: claim.lease_token,
      p_result: result,
      p_failure: failure,
      p_metadata: metadata,
    });
    if (error || !data) {
      throw new Error("Step purchase finalization unavailable");
    }
    // A stale token cannot read its successor's delivery, but the client still
    // needs its original identity to poll the same purchase instead of retrying a buy.
    return data.status === "stale" ? { ...claim, ...data, result: null } : data;
  };
  const timer = setInterval(() => {
    if (!heartbeat) {
      heartbeat = renew().catch(() => {
        lost = true;
      }).finally(() => {
        heartbeat = null;
      });
    }
  }, 10_000);
  try {
    await renew();
    const req = await loadContext();
    if (lost) throw new Error("Step purchase lease lost");
    const generated =
      await (dependencies.generate ?? generateCompositionExtension)(req);
    if (lost) throw new Error("Step purchase lease lost");
    const units = moderationUnits(req, generated.result);
    const moderation = await new TextModerationProvider().moderateUnits(units, {
      classify: dependencies.moderate,
      deadlineMs: dependencies.moderationDeadlineMs,
    });
    const approved = moderation.length === units.length &&
      moderation.every((unit) => unit.status === "approved");
    if (lost) throw new Error("Step purchase lease lost");
    await renew();
    return await finish(
      approved ? generated.result : null,
      approved ? null : "moderation_rejected",
      {
        composition_version: 3,
        prompt_version: COMPOSITION_SUGGESTION_PROMPT_VERSION,
        provider: generated.provider,
        model: generated.model,
        cost_usd: generated.costUsd ?? null,
        latency_ms: generated.latencyMs,
        moderation,
      },
    );
  } catch (error) {
    // A lost success response replays success; a stale token can never refund its successor.
    return await finish(
      null,
      error instanceof SuggestionError ? error.code : "generation_failed",
    );
  } finally {
    clearInterval(timer);
    if (heartbeat) await heartbeat;
  }
}
