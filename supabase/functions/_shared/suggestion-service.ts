// One reservation/generation path for free requests, purchases and prefetch.
// Only the atomic RPC owns row writes, debits, refunds and lease transitions.
import {
  COMPOSITION_SUGGESTION_PROMPT_VERSION,
  type FighterContext,
  generateSuggestions,
  type MoveType,
  STRUCTURED_SUGGESTION_PROMPT_VERSION,
  type Suggestion,
  SUGGESTION_PROMPT_VERSION,
  SuggestionError,
  type SuggestionResult,
} from "./move-suggestions.ts";
import {
  type ModerationUnit,
  TextModerationProvider,
  type TextModerationResult,
} from "./moderation.ts";
import { getSupabaseSecretKey } from "./utils.ts";
import { requiresPromptClientUpdate } from "./prompt-situations.ts";
// deno-lint-ignore no-explicit-any
export type SuggestionDb = any;
export const ALL_MOVE_TYPES: MoveType[] = ["attack", "defense", "finisher"];
export interface SuggestionClaim {
  status: "claimed" | "pending" | "ready" | "failed" | "stale";
  id?: string;
  operation_id?: string;
  lease_token?: string;
  credits_spent: number;
  is_paid: boolean;
  suggestions?: Suggestion[];
  move_type: MoveType;
  error?: string;
  current_credits?: number;
  refunded?: boolean;
  composition_version?: 2 | 3;
  composition_status?: "pending" | "ready" | "failed";
  composition_error?: string;
}
export interface SuggestionRequestBody {
  battle_id: string;
  move_type?: MoveType;
  move_types?: MoveType[];
  round_number?: number;
  operation: "ensure_free" | "reroll";
  idempotency_key?: string;
  expected_credits?: number;
  composition_version?: 2 | 3;
  suggestion_set_id?: string;
}
export function parseSuggestionRequest(
  value: unknown,
  headerKey?: string | null,
): SuggestionRequestBody {
  if (!value || typeof value !== "object") throw new Error("invalid request");
  const body = value as Record<string, unknown>;
  if (
    typeof body.battle_id !== "string" || !body.battle_id
  ) throw new Error("battle_id is required");
  const isBatch = body.move_types !== undefined;
  if (isBatch) {
    if (
      body.move_type !== undefined || !Array.isArray(body.move_types) ||
      body.move_types.length < 1 || body.move_types.length > 3 ||
      new Set(body.move_types).size !== body.move_types.length ||
      body.move_types.some((type) => !ALL_MOVE_TYPES.includes(type as MoveType))
    ) {
      throw new Error(
        "move_types must contain 1-3 unique types and cannot accompany move_type",
      );
    }
  } else if (!ALL_MOVE_TYPES.includes(body.move_type as MoveType)) {
    throw new Error("a valid move_type is required");
  }
  const operation = body.operation ?? "ensure_free";
  if (isBatch && operation !== "ensure_free") {
    throw new Error("batch requests are free-only");
  }
  if (operation !== "ensure_free" && operation !== "reroll") {
    throw new Error("invalid operation");
  }
  if (
    operation === "reroll" &&
    requiresPromptClientUpdate(2, body.client_contract_version)
  ) {
    throw new SuggestionError(
      "client_update_required",
      "Update Prompt Wars to request another set of ideas.",
    );
  }
  const idempotency_key = headerKey?.trim() ||
    (typeof body.idempotency_key === "string"
      ? body.idempotency_key.trim()
      : undefined);
  const expected_credits = body.expected_credits;
  if (
    operation === "reroll" &&
    (!idempotency_key || idempotency_key.length < 8 ||
      idempotency_key.length > 128 ||
      !Number.isSafeInteger(expected_credits) || Number(expected_credits) < 0)
  ) throw new Error("reroll requires idempotency_key and expected_credits");
  if (
    body.round_number !== undefined &&
    (!Number.isInteger(body.round_number) || Number(body.round_number) < 1 ||
      Number(body.round_number) > 3)
  ) throw new Error("round_number must be 1-3");
  if (
    body.composition_version !== undefined && body.composition_version !== 2 &&
    body.composition_version !== 3
  ) throw new Error("invalid composition_version");
  if (
    body.suggestion_set_id !== undefined &&
    (typeof body.suggestion_set_id !== "string" || !body.suggestion_set_id ||
      isBatch || operation !== "ensure_free" || body.composition_version !== 3)
  ) {
    throw new Error(
      "suggestion_set_id requires a single composition v3 ensure_free",
    );
  }
  return {
    ...(body.suggestion_set_id
      ? { suggestion_set_id: body.suggestion_set_id as string }
      : {}),
    ...(body.composition_version !== undefined
      ? { composition_version: body.composition_version as 2 | 3 }
      : {}),
    battle_id: body.battle_id,
    ...(isBatch
      ? { move_types: body.move_types as MoveType[] }
      : { move_type: body.move_type as MoveType }),
    operation,
    round_number: body.round_number as number | undefined,
    idempotency_key,
    expected_credits: expected_credits as number | undefined,
  };
}
export function suggestionFlags(
  env = (key: string) => Deno.env.get(key),
) {
  return {
    allowGenerate: env("SUGGESTIONS_AI_DISABLED") !== "true",
    allowReroll: true,
  };
}
export async function reserveSuggestion(db: SuggestionDb, input: {
  profileId: string;
  battleId: string;
  roundNumber: number;
  moveType: MoveType;
  operation: "ensure_free" | "reroll";
  idempotencyKey?: string;
  expectedCredits?: number;
  compositionVersion?: 2 | 3;
  source: "player" | "prefetch";
  allowGenerate: boolean;
  allowReroll: boolean;
}): Promise<SuggestionClaim> {
  const { data, error } = await db.rpc("reserve_suggestion_operation", {
    p_profile_id: input.profileId,
    p_battle_id: input.battleId,
    p_round_number: input.roundNumber,
    p_move_type: input.moveType,
    p_operation: input.operation,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_expected_credits: input.expectedCredits ?? null,
    p_source: input.source,
    p_allow_generate: input.allowGenerate,
    p_allow_reroll: input.allowReroll,
    p_composition_version: input.compositionVersion ?? 2,
  });
  if (error || !data) {
    throw new SuggestionError(
      "server_error",
      error?.message ?? "reservation unavailable",
    );
  }
  return { ...data, move_type: input.moveType };
}
export function publicSuggestionResult(claim: SuggestionClaim) {
  // The lease token is a worker capability, never a client response.
  const { lease_token: _lease, ...result } = claim;
  return result;
}
export function statusForSuggestionError(code: string): number {
  switch (code) {
    case "client_update_required":
      return 426;
    case "insufficient_credits":
      return 402;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "adaptation_limit_reached":
    case "attempt_limit_reached":
    case "attempts_exhausted":
    case "rate_limited":
      return 429;
    case "price_changed":
    case "idempotency_conflict":
    case "round_not_open":
    case "prompt_locked":
      return 409;
    case "purchase_confirmation_required":
    case "bad_request":
      return 400;
    case "generation_disabled":
    case "rerolls_disabled":
    case "price_unavailable":
    case "not_configured":
      return 503;
    case "timeout":
    case "server_error":
    case "network":
      return 502;
    default:
      return 500;
  }
}
export function suggestionModerationUnits(s: Suggestion): ModerationUnit[] {
  return [
    { kind: "title", text: s.title },
    { kind: "body", text: s.body },
    ...(s.action ? [{ kind: "action" as const, text: s.action }] : []),
    ...(s.intentHints ?? []).flatMap((h) => [
      { kind: "intent" as const, text: h.text },
      { kind: "pair" as const, text: (s.action ?? "") + " " + h.text },
      ...(h.approachHints ?? []).flatMap((a) => [
        { kind: "approach" as const, text: a.text },
        {
          kind: "triple" as const,
          text: `${s.action ?? ""} ${h.text} ${a.text}`,
        },
      ]),
    ]),
  ];
}
export async function generateClaimedSuggestions(db: SuggestionDb, input: {
  claims: SuggestionClaim[];
  fighter: FighterContext;
  theme: string;
  roundNumber: number;
  structureVersion: 1 | 2;
  compositionVersion?: 2 | 3;
  situation?: string | null;
  allowedAffordanceIds?: string[];
}, dependencies: {
  generate?: (
    request: Parameters<typeof generateSuggestions>[0],
  ) => Promise<SuggestionResult>;
  moderate?: (text: string) => Promise<TextModerationResult>;
  moderationDeadlineMs?: number;
} = {}): Promise<SuggestionClaim[]> {
  if (!input.claims.length) return [];
  const active = new Map(input.claims.map((c) => [c.operation_id!, c]));
  if (
    input.claims.some((c) =>
      c.status !== "claimed" || !c.operation_id || !c.lease_token
    )
  ) throw new Error("unowned suggestion claim");
  const finalizing = new Set<string>();
  const renew = async () => {
    for (const c of active.values()) {
      const { data, error } = await db.rpc("renew_suggestion_operation", {
        p_operation_id: c.operation_id,
        p_lease_token: c.lease_token,
      });
      // A committed finish can precede its HTTP response. Its own DB fence
      // decides ownership; a terminal row is not evidence that another bank lost
      // its lease. Keep renewing pending finalizations until that point.
      if (
        (error || data !== true) && active.has(c.operation_id!) &&
        !finalizing.has(c.operation_id!)
      ) {
        throw new Error("suggestion lease lost");
      }
    }
  };
  let lost: unknown = null;
  let heartbeat: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (heartbeat) return;
    heartbeat = renew().catch((e) => {
      lost = e;
    }).finally(() => {
      heartbeat = null;
    });
  }, 10_000);
  const finish = async (
    c: SuggestionClaim,
    suggestions: Suggestion[] | null,
    metadata: Record<string, unknown>,
    failure: string | null,
  ) => {
    finalizing.add(c.operation_id!);
    try {
      const { data, error } = await db.rpc("finish_suggestion_operation", {
        p_operation_id: c.operation_id,
        p_lease_token: c.lease_token,
        p_suggestions: suggestions,
        p_metadata: metadata,
        p_failure: failure,
      });
      if (error || !data) {
        throw new Error(error?.message ?? "suggestion completion unavailable");
      }
      active.delete(c.operation_id!);
      return { ...data, move_type: c.move_type } as SuggestionClaim;
    } finally {
      finalizing.delete(c.operation_id!);
    }
  };
  try {
    await renew();
    const generate = dependencies.generate ?? generateSuggestions;
    const generated = await generate({
      fighter: input.fighter,
      moveTypes: input.claims.map((c) => c.move_type),
      theme: input.theme,
      roundNumber: input.roundNumber,
      structureVersion: input.structureVersion,
      compositionVersion: input.compositionVersion,
      situation: input.situation,
      allowedAffordanceIds: input.allowedAffordanceIds,
      idNamespace: input.claims[0].operation_id,
      seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647,
    });
    if (lost) throw lost;
    const moderator = new TextModerationProvider();
    // One shared moderation budget covers every claimed bank, including fallback.
    const cards = input.claims.flatMap((c) =>
      (generated.suggestions[c.move_type] ?? []).map(suggestionModerationUnits)
    );
    const allVerdicts = await moderator.moderateUnits(cards.flat(), {
      classify: dependencies.moderate,
      deadlineMs: dependencies.moderationDeadlineMs,
    });
    let offset = 0;
    const verdictsByCard = cards.map((units) => {
      const verdicts = allVerdicts.slice(offset, offset + units.length);
      offset += units.length;
      return verdicts;
    });
    let cardOffset = 0;
    const results: SuggestionClaim[] = [];
    let costCarried = false;
    for (const c of input.claims) {
      const suggestions = generated.suggestions[c.move_type] ?? [];
      const verdicts = verdictsByCard.slice(
        cardOffset,
        cardOffset + suggestions.length,
      );
      cardOffset += suggestions.length;
      if (lost) throw lost;
      await renew();
      const kept = suggestions.filter((_, i) =>
        verdicts[i]?.length && verdicts[i].every((v) => v.status === "approved")
      );
      const rejected = kept.length === 0 ||
        (input.structureVersion === 2 && kept.length !== 3);
      const metadata = {
        structure_version: input.structureVersion,
        composition_version: input.compositionVersion ?? 2,
        prompt_version: input.compositionVersion === 3
          ? COMPOSITION_SUGGESTION_PROMPT_VERSION
          : input.structureVersion === 2
          ? STRUCTURED_SUGGESTION_PROMPT_VERSION
          : SUGGESTION_PROMPT_VERSION,
        provider: generated.provider,
        model: generated.model,
        cost_usd: costCarried ? null : generated.costUsd ?? null,
        latency_ms: costCarried ? null : generated.latencyMs,
        moderation: verdicts,
      };
      results.push(
        await finish(
          c,
          rejected ? null : kept,
          metadata,
          generated.errors?.[c.move_type] ??
            (rejected ? "moderation_rejected" : null),
        ),
      );
      costCarried = true;
    }
    return results;
  } catch (error) {
    // Failure is a fenced DB transition. Never delete rows or issue an unfenced refund.
    await Promise.all(
      [...active.values()].map((c) =>
        finish(c, null, {}, "generation_failed").catch((cleanupError) => {
          console.error(
            "Suggestion terminalization failed; expiry sweeper will recover",
            cleanupError,
          );
        })
      ),
    );
    throw error;
  } finally {
    clearInterval(timer);
    if (heartbeat) await heartbeat;
  }
}

/** Start all reserved version groups together, keeping every group lease alive. */
export async function generateVersionedClaimedSuggestions(
  db: SuggestionDb,
  input: Parameters<typeof generateClaimedSuggestions>[1],
  generateGroup: typeof generateClaimedSuggestions = generateClaimedSuggestions,
): Promise<SuggestionClaim[]> {
  const results = await Promise.all(
    ([2, 3] as const).map(async (compositionVersion) => {
      const claims = input.claims.filter((c) =>
        (c.composition_version ?? input.compositionVersion ?? 2) ===
          compositionVersion
      );
      if (!claims.length) return [];
      try {
        return await generateGroup(db, {
          ...input,
          claims,
          compositionVersion,
        });
      } catch {
        // Another version group may still be generating. Recover only this group's
        // terminal results; never refund or release a sibling group's live claims.
        return await Promise.all(
          claims.map(async (c): Promise<SuggestionClaim> => {
            const { data } = await db.rpc("finish_suggestion_operation", {
              p_operation_id: c.operation_id,
              p_lease_token: c.lease_token,
              p_suggestions: null,
              p_metadata: {},
              p_failure: "generation_failed",
            });
            return {
              ...(data ??
                {
                  status: "pending",
                  operation_id: c.operation_id,
                  credits_spent: c.credits_spent,
                  is_paid: c.is_paid,
                }),
              move_type: c.move_type,
            };
          }),
        );
      }
    }),
  );
  return results.flat();
}

/** Shared server-read fighter context; clients cannot forge owner-only traits. */
export async function readSuggestionFighter(
  db: SuggestionDb,
  characterId: string,
  profileId: string,
): Promise<FighterContext> {
  const { data: c, error } = await db.from("characters").select(
    "id,profile_id,name,archetype,vibe,silhouette,era,expression,palette_key,battle_cry,style_description,signature_item:signature_items(name,prompt_fragment)",
  ).eq("id", characterId).maybeSingle();
  if (error || !c || c.profile_id !== profileId) {
    throw new Error("character context unavailable");
  }
  const item = Array.isArray(c.signature_item)
    ? c.signature_item[0]
    : c.signature_item;
  return {
    name: c.name,
    archetype: c.archetype,
    vibe: c.vibe,
    silhouette: c.silhouette,
    era: c.era,
    expression: c.expression,
    paletteKey: c.palette_key,
    battleCry: c.battle_cry,
    styleDescription: c.style_description,
    signatureItemName: item?.name ?? null,
    signatureItemFragment: item?.prompt_fragment ?? null,
  };
}

export async function kickSuggestionPrefetch(
  battleId: string,
  roundNumber: number,
): Promise<void> {
  const task = (async () => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKey = getSupabaseSecretKey();
    if (!supabaseUrl || !secretKey) return;
    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/prefetch-move-suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: secretKey,
          },
          body: JSON.stringify({
            battle_id: battleId,
            round_number: roundNumber,
          }),
        },
      );
      if (!res.ok) {
        console.error(
          "Suggestion prefetch kick failed:",
          res.status,
          await res.text().catch(() => ""),
        );
      }
    } catch (error) {
      console.error("Suggestion prefetch kick threw:", error);
    }
  })();

  // @ts-ignore EdgeRuntime is provided by Supabase in production.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore EdgeRuntime is provided by Supabase in production.
    EdgeRuntime.waitUntil(task);
    return;
  }
  await task;
}
