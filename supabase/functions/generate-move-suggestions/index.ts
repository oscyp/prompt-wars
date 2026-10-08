// Explicit free reads and price-confirmed rerolls share a fenced operation ledger.
import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from "../_shared/utils.ts";
import { err, ok } from "../_shared/character-creation.ts";
import { enrichSuggestionBank } from "../_shared/suggestion-completion.ts";
import { SuggestionError } from "../_shared/move-suggestions.ts";
import {
  generateVersionedClaimedSuggestions,
  parseSuggestionRequest,
  publicSuggestionResult,
  readSuggestionFighter,
  reserveSuggestion,
  statusForSuggestionError,
  type SuggestionClaim,
  suggestionFlags,
} from "../_shared/suggestion-service.ts";

import { getSituationAffordances } from "../_shared/prompt-affordances.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return err("method_not_allowed", "POST required", 405);
  }
  let userId: string;
  try {
    userId = await getAuthUserId(req, { capability: "generate" });
  } catch {
    return err("unauthorized", "authentication required", 401);
  }
  let body;
  try {
    body = parseSuggestionRequest(
      await req.json(),
      req.headers.get("Idempotency-Key"),
    );
  } catch (e) {
    if (e instanceof SuggestionError && e.code === "client_update_required") {
      return err(e.code, e.message, 426, {
        minimum_client_contract_version: 3,
      });
    }
    return err(
      "bad_request",
      e instanceof Error ? e.message : "invalid request",
      400,
    );
  }
  const db = createServiceClient();
  try {
    const { data: battle, error } = await db.from("battles").select("*").eq(
      "id",
      body.battle_id,
    ).maybeSingle();
    if (error) return err("server_error", "battle lookup unavailable", 503);
    if (!battle) return err("not_found", "battle not found", 404);
    if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
      return err("forbidden", "not a participant", 403);
    }
    const roundNumber = body.round_number ?? battle.current_round ?? 1;
    const experienceVersion = Number(battle.prompt_experience_version ?? 1);
    const flags = suggestionFlags();
    if (body.composition_version === 3 && experienceVersion !== 2) {
      return err("bad_request", "composition requires a shared situation", 400);
    }
    const loadContext = async () => {
      const characterId = battle.player_one_id === userId
        ? battle.player_one_character_id
        : battle.player_two_character_id;
      const fighter = await readSuggestionFighter(db, characterId, userId);
      const { data: round, error: roundError } = await db.from("battle_rounds")
        .select("*").eq("battle_id", battle.id).eq("round_number", roundNumber)
        .maybeSingle();
      if (roundError) throw new Error("round context unavailable");
      const situation = round?.situation_snapshot;
      if (
        experienceVersion === 2 &&
        (!situation || typeof situation.text !== "string")
      ) throw new Error("published situation unavailable");
      return {
        fighter,
        theme: battle.theme ?? "an open arena",
        roundNumber,
        situation: situation?.text ?? null,
        allowedAffordanceIds: getSituationAffordances(situation).map((a) =>
          a.id
        ),
      };
    };
    const enrichmentContext = {
      profileId: userId,
      battleId: battle.id,
      roundNumber,
      allowGenerate: flags.allowGenerate,
      loadContext,
    };
    if (body.suggestion_set_id) {
      const { data: saved, error: savedError } = await db.from(
        "move_prompt_suggestions",
      ).select(
        "id,operation_id,suggestions,is_paid,credits_spent,moderation_status",
      ).eq("id", body.suggestion_set_id).eq("profile_id", userId).eq(
        "battle_id",
        battle.id,
      ).eq("round_number", roundNumber).eq("move_type", body.move_type!)
        .maybeSingle();
      if (savedError) {
        return err("server_error", "saved ideas unavailable", 503);
      }
      if (!saved || saved.moderation_status !== "approved") {
        return err("not_found", "saved ideas not found", 404);
      }
      const enriched = await enrichSuggestionBank(db, {
        status: "ready",
        id: saved.id,
        operation_id: saved.operation_id,
        suggestions: saved.suggestions,
        is_paid: saved.is_paid,
        credits_spent: saved.credits_spent,
        move_type: body.move_type!,
      }, enrichmentContext);
      return ok(publicSuggestionResult(enriched));
    }
    const results: SuggestionClaim[] = [];
    const moveTypes = body.move_types ?? [body.move_type!];
    for (const moveType of moveTypes) {
      try {
        results.push(
          await reserveSuggestion(db, {
            profileId: userId,
            battleId: battle.id,
            roundNumber,
            moveType,
            operation: body.operation,
            idempotencyKey: body.idempotency_key,
            expectedCredits: body.expected_credits,
            compositionVersion: body.composition_version,
            source: "player",
            ...flags,
          }),
        );
      } catch (error) {
        if (!body.move_types) throw error;
        results.push({
          status: "failed",
          move_type: moveType,
          credits_spent: 0,
          is_paid: false,
          error: "reservation_unavailable",
        });
      }
    }
    const claims = results.filter((result) => result.status === "claimed");
    if (claims.length) {
      try {
        const context = await loadContext();
        // Persisted versions can differ while recovering an older free bank.
        // Start both groups together so every reserved claim gets its heartbeat.
        const generated = await generateVersionedClaimedSuggestions(db, {
          claims,
          ...context,
          structureVersion: experienceVersion === 2 ? 2 : 1,
          compositionVersion: body.composition_version,
        });
        for (const result of generated) {
          results[results.findIndex((r) => r.move_type === result.move_type)] =
            result;
        }
      } catch (error) {
        // Context loading and partial generation failures use the same worker fence.
        // Successful earlier finalization replays safely; stale workers cannot refund it.
        for (const claim of claims) {
          const { data: finished, error: finishError } = await db.rpc(
            "finish_suggestion_operation",
            {
              p_operation_id: claim.operation_id,
              p_lease_token: claim.lease_token,
              p_suggestions: null,
              p_metadata: {},
              p_failure: "generation_failed",
            },
          );
          if (finishError || !finished) {
            console.error(
              "Suggestion cleanup deferred to expiry sweeper",
              finishError,
            );
            if (!body.move_types) throw error;
          }
          results[results.findIndex((r) => r.move_type === claim.move_type)] = {
            ...(finished ??
              {
                status: "pending",
                operation_id: claim.operation_id,
                credits_spent: claim.credits_spent,
                is_paid: claim.is_paid,
              }),
            move_type: claim.move_type,
          };
        }
      }
    }
    if (body.composition_version === 3) {
      const enriched = await Promise.all(
        results.map((result) =>
          enrichSuggestionBank(db, result, enrichmentContext)
        ),
      );
      results.splice(0, results.length, ...enriched);
    }
    if (body.move_types) {
      return ok(
        { results: results.map(publicSuggestionResult) },
        results.some((r) => r.status === "pending" || r.status === "stale")
          ? 202
          : 200,
      );
    }
    const [result] = results;
    if (result.error && !result.status) {
      return err(
        result.error,
        result.error.replaceAll("_", " "),
        statusForSuggestionError(result.error),
        { current_credits: result.current_credits },
      );
    }
    return ok(
      publicSuggestionResult(result),
      result.status === "pending" || result.status === "stale" ? 202 : 200,
    );
  } catch (e) {
    console.error("Suggestion request failed", e);
    return err(
      e instanceof SuggestionError ? e.code : "generation_failed",
      "Suggestions unavailable. Retry the same operation to check its result.",
      statusForSuggestionError(
        e instanceof SuggestionError ? e.code : "server_error",
      ),
    );
  }
});
