import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from "../_shared/utils.ts";
import { err, ok } from "../_shared/character-creation.ts";
import { SuggestionError } from "../_shared/move-suggestions.ts";
import {
  readSuggestionFighter,
  statusForSuggestionError,
  suggestionFlags,
} from "../_shared/suggestion-service.ts";
import {
  generateClaimedStep,
  parseStepRerollRequest,
  publicStepResult,
  reserveStepReroll,
} from "../_shared/suggestion-step-reroll.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return err("method_not_allowed", "POST required", 405);
  }
  let profileId: string;
  try {
    profileId = await getAuthUserId(req, { capability: "generate" });
  } catch {
    return err("unauthorized", "authentication required", 401);
  }
  let body;
  try {
    body = parseStepRerollRequest(
      await req.json(),
      req.headers.get("Idempotency-Key"),
    );
  } catch (error) {
    return err(
      error instanceof SuggestionError ? error.code : "bad_request",
      error instanceof Error ? error.message : "invalid request",
      error instanceof SuggestionError
        ? statusForSuggestionError(error.code)
        : 400,
    );
  }
  const db = createServiceClient();
  try {
    const { data: battle, error } = await db.from("battles").select("*").eq(
      "id",
      body.battle_id,
    ).maybeSingle();
    if (error) {
      return err(
        "server_error",
        "Battle lookup unavailable. Retry the same purchase.",
        503,
      );
    }
    if (!battle) return err("not_found", "battle not found", 404);
    if (
      battle.player_one_id !== profileId && battle.player_two_id !== profileId
    ) return err("forbidden", "not a participant", 403);
    if (Number(battle.prompt_experience_version ?? 1) !== 2) {
      return err("bad_request", "composition requires a shared situation", 400);
    }
    const roundNumber = body.round_number ?? battle.current_round ?? 1;
    let claim = await reserveStepReroll(
      db,
      profileId,
      body,
      roundNumber,
      suggestionFlags(),
    );
    if (claim.status === "claimed") {
      const operationId = claim.operation_id!;
      claim = await generateClaimedStep(db, claim, async () => {
        const characterId = battle.player_one_id === profileId
          ? battle.player_one_character_id
          : battle.player_two_character_id;
        const fighter = await readSuggestionFighter(db, characterId, profileId);
        const { data: round, error: roundError } = await db.from(
          "battle_rounds",
        ).select("situation_snapshot")
          .eq("battle_id", body.battle_id).eq("round_number", roundNumber)
          .maybeSingle();
        if (roundError || typeof round?.situation_snapshot?.text !== "string") {
          throw new Error("published situation unavailable");
        }
        return {
          target: body.target,
          actionText: body.action_text,
          intentText: body.intent_text,
          moveType: body.move_type,
          fighter,
          theme: battle.theme ?? "an open arena",
          situation: round.situation_snapshot.text,
          roundNumber,
          idNamespace: operationId,
          variationSeed: operationId,
        };
      });
    }
    if (claim.error && !claim.status) {
      return err(
        claim.error,
        claim.error.replaceAll("_", " "),
        statusForSuggestionError(claim.error),
        { current_credits: claim.current_credits },
      );
    }
    return ok(
      publicStepResult(claim),
      claim.status === "pending" || claim.status === "stale" ? 202 : 200,
    );
  } catch {
    return err(
      "server_error",
      "Purchase status unavailable. Retry the same purchase to recover its result.",
      503,
    );
  }
});
