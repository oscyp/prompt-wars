import {
  type CompletionResult,
  COMPOSITION_SUGGESTION_PROMPT_VERSION,
  type CompositionExtensionRequest,
  type CompositionExtensionResult,
  generateCompositionExtension,
  type MoveType,
  type Suggestion,
  SuggestionError,
} from "./move-suggestions.ts";
import {
  type ModerationUnit,
  TextModerationProvider,
  type TextModerationResult,
} from "./moderation.ts";
import {
  ALL_MOVE_TYPES,
  type SuggestionClaim,
  type SuggestionDb,
  suggestionModerationUnits,
} from "./suggestion-service.ts";
import { requiresPromptClientUpdate } from "./prompt-situations.ts";

export interface CompletionRequestBody {
  battle_id: string;
  round_number?: number;
  move_type: MoveType;
  target: "intent" | "approach";
  action_text: string;
  intent_text?: string;
  composition_version: 3;
}
export interface CompletionClaim {
  status: "claimed" | "pending" | "ready" | "failed" | "stale";
  operation_id?: string;
  lease_token?: string;
  context_key?: string;
  target?: "intent" | "approach" | "upgrade_v3";
  composition_version?: number;
  result?: CompletionResult;
  remaining_adaptations?: number;
  error?: string;
}
export function parseCompletionRequest(value: unknown): CompletionRequestBody {
  if (!value || typeof value !== "object") throw new Error("invalid request");
  const body = value as Record<string, unknown>;
  if (requiresPromptClientUpdate(2, body.client_contract_version)) {
    throw new SuggestionError(
      "client_update_required",
      "Update Prompt Wars to adapt your ideas.",
    );
  }
  const action = typeof body.action_text === "string"
    ? body.action_text.trim()
    : "";
  const intent = typeof body.intent_text === "string"
    ? body.intent_text.trim()
    : undefined;
  if (
    typeof body.battle_id !== "string" || !body.battle_id ||
    !ALL_MOVE_TYPES.includes(body.move_type as MoveType) ||
    (body.target !== "intent" && body.target !== "approach") ||
    body.composition_version !== 3 || action.length < 5 ||
    action.length > 240 ||
    (body.target === "approach" &&
      (!intent || intent.length < 5 || intent.length > 180)) ||
    (body.target === "intent" && body.intent_text !== undefined) ||
    (body.round_number !== undefined &&
      (!Number.isInteger(body.round_number) || Number(body.round_number) < 1 ||
        Number(body.round_number) > 3))
  ) throw new Error("invalid composition context");
  return {
    battle_id: body.battle_id,
    round_number: body.round_number as number | undefined,
    move_type: body.move_type as MoveType,
    target: body.target,
    action_text: action,
    ...(intent ? { intent_text: intent } : {}),
    composition_version: 3,
  };
}
export function publicCompletionResult(claim: CompletionClaim) {
  const { lease_token: _private, ...result } = claim;
  return result;
}
export async function reserveCompletion(db: SuggestionDb, input: {
  profileId: string;
  battleId: string;
  roundNumber: number;
  moveType: MoveType;
  target: "intent" | "approach" | "upgrade_v3";
  actionText?: string;
  intentText?: string;
  suggestionId?: string;
  allowGenerate: boolean;
}): Promise<CompletionClaim> {
  const { data, error } = await db.rpc("reserve_suggestion_completion", {
    p_profile_id: input.profileId,
    p_battle_id: input.battleId,
    p_round_number: input.roundNumber,
    p_move_type: input.moveType,
    p_target: input.target,
    p_action_text: input.actionText ?? null,
    p_intent_text: input.intentText ?? null,
    p_suggestion_id: input.suggestionId ?? null,
    p_composition_version: 3,
    p_allow_generate: input.allowGenerate,
  });
  if (error || !data) {
    throw new SuggestionError(
      "server_error",
      "composition reservation unavailable",
    );
  }
  return data;
}
function completionUnits(
  req: CompositionExtensionRequest,
  result: CompletionResult,
): ModerationUnit[] {
  if (Array.isArray(result)) return result.flatMap(suggestionModerationUnits);
  const action = req.actionText!;
  const intents = req.target === "intent" ? result.intentHints! : [{
    id: "prefix",
    text: req.intentText!,
    approachHints: result.approachHints,
  }];
  return [
    { kind: "action", text: action },
    ...intents.flatMap((h): ModerationUnit[] => [
      { kind: "intent", text: h.text },
      ...(h.approachHints ?? []).flatMap((a): ModerationUnit[] => [
        { kind: "approach", text: a.text },
        { kind: "triple", text: `${action} ${h.text} ${a.text}` },
      ]),
    ]),
  ];
}
export async function generateClaimedCompletion(
  db: SuggestionDb,
  claim: CompletionClaim,
  req: CompositionExtensionRequest,
  dependencies: {
    generate?: (
      req: CompositionExtensionRequest,
    ) => Promise<CompositionExtensionResult>;
    moderate?: (text: string) => Promise<TextModerationResult>;
    moderationDeadlineMs?: number;
  } = {},
): Promise<CompletionClaim> {
  if (claim.status !== "claimed" || !claim.operation_id || !claim.lease_token) {
    throw new Error("unowned completion");
  }
  let lost = false;
  let finalizing = false;
  let heartbeat: Promise<void> | null = null;
  const renew = async () => {
    const { data, error } = await db.rpc("renew_suggestion_completion", {
      p_operation_id: claim.operation_id,
      p_lease_token: claim.lease_token,
    });
    if ((error || data !== true) && !finalizing) {
      lost = true;
      throw new Error("composition lease lost");
    }
  };
  const finish = async (
    result: CompletionResult | null,
    failure: string | null,
    metadata: Record<string, unknown> = {},
  ) => {
    finalizing = true;
    const { data, error } = await db.rpc("finish_suggestion_completion", {
      p_operation_id: claim.operation_id,
      p_lease_token: claim.lease_token,
      p_result: result,
      p_metadata: metadata,
      p_failure: failure,
    });
    if (error || !data) throw new Error("composition completion unavailable");
    return data as CompletionClaim;
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
    const generated =
      await (dependencies.generate ?? generateCompositionExtension)(req);
    if (lost) throw new Error("composition lease lost");
    const units = completionUnits(req, generated.result);
    const moderation = await new TextModerationProvider().moderateUnits(units, {
      classify: dependencies.moderate,
      deadlineMs: dependencies.moderationDeadlineMs,
    });
    const approved = moderation.length === units.length &&
      moderation.every((v) => v.status === "approved");
    if (lost) throw new Error("composition lease lost");
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
    // The RPC fence is authoritative, including when its successful HTTP response was lost.
    return await finish(
      null,
      error instanceof SuggestionError ? error.code : "generation_failed",
    );
  } finally {
    clearInterval(timer);
    if (heartbeat) await heartbeat;
  }
}

/** Keep delivery and enrichment distinct; an old successful purchase never becomes failed. */
export async function enrichSuggestionBank(
  db: SuggestionDb,
  bank: SuggestionClaim,
  input: {
    profileId: string;
    battleId: string;
    roundNumber: number;
    allowGenerate: boolean;
    loadContext: () => Promise<
      Omit<
        CompositionExtensionRequest,
        "target" | "suggestions" | "idNamespace" | "moveType"
      >
    >;
  },
): Promise<SuggestionClaim> {
  if (
    bank.status !== "ready" || !bank.id || !bank.suggestions?.length ||
    bank.suggestions.every((s) => s.compositionVersion === 3)
  ) return bank;
  try {
    let completion = await reserveCompletion(db, {
      ...input,
      target: "upgrade_v3",
      moveType: bank.move_type,
      suggestionId: bank.id,
    });
    if (completion.status === "claimed") {
      try {
        completion = await generateClaimedCompletion(db, completion, {
          ...await input.loadContext(),
          target: "upgrade_v3",
          moveType: bank.move_type,
          suggestions: bank.suggestions,
          idNamespace: completion.operation_id!,
        });
      } catch {
        // Context failures also release the reservation under its owner token.
        const { data } = await db.rpc("finish_suggestion_completion", {
          p_operation_id: completion.operation_id,
          p_lease_token: completion.lease_token,
          p_result: null,
          p_metadata: {},
          p_failure: "generation_failed",
        });
        completion = data ?? { status: "pending" };
      }
    }
    return {
      ...bank,
      ...(completion.status === "ready" && Array.isArray(completion.result)
        ? {
          suggestions: completion.result as Suggestion[],
          composition_version: 3 as const,
        }
        : {}),
      composition_status: completion.status === "ready"
        ? "ready"
        : completion.status === "failed" || completion.error
        ? "failed"
        : "pending",
      ...(completion.error ? { composition_error: completion.error } : {}),
    };
  } catch {
    return {
      ...bank,
      composition_status: "failed",
      composition_error: "enrichment_unavailable",
    };
  }
}
