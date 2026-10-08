// Service-only free prewarm. No request here can enter a reroll path.
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  hasSupabaseSecretAuthorization,
  successResponse,
} from "../_shared/utils.ts";
import { canGenerateBattle } from "../_shared/eligibility.ts";
import {
  ALL_MOVE_TYPES,
  generateClaimedSuggestions,
  readSuggestionFighter,
  reserveSuggestion,
  type SuggestionClaim,
  suggestionFlags,
} from "../_shared/suggestion-service.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get("Authorization"),
      req.headers.get("apikey"),
    )
  ) return errorResponse("Service role required", 403);
  if ((Deno.env.get("SUGGESTIONS_PREFETCH_ENABLED") ?? "1") === "0") {
    return successResponse({ skipped: "disabled" });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }
  if (!body.battle_id) return errorResponse("battle_id is required", 400);
  const db = createServiceClient();
  const { data: battle, error } = await db.from("battles").select("*").eq(
    "id",
    body.battle_id,
  ).maybeSingle();
  if (error || !battle) return errorResponse("Battle unavailable", 404);
  if (Number(battle.prompt_experience_version ?? 1) === 2) {
    return successResponse({ skipped: "build_entry_required" });
  }
  if (!(await canGenerateBattle(db, battle))) {
    return successResponse({ skipped: "account_eligibility_required" });
  }
  const roundNumber = Number(body.round_number ?? battle.current_round ?? 1);
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 3) {
    return errorResponse("round_number must be 1-3", 400);
  }
  const experienceVersion = Number(battle.prompt_experience_version ?? 1);
  const flags = suggestionFlags();
  if (!flags.allowGenerate) {
    return successResponse({ skipped: "generation_disabled" });
  }
  const { data: round, error: roundError } = await db.from("battle_rounds")
    .select("*").eq("battle_id", battle.id).eq("round_number", roundNumber)
    .maybeSingle();
  if (
    roundError ||
    (experienceVersion === 2 &&
      typeof round?.situation_snapshot?.text !== "string")
  ) return successResponse({ skipped: "situation_unavailable" });
  const targets = [{
    profileId: battle.player_one_id,
    characterId: battle.player_one_character_id,
  }];
  if (
    !battle.is_player_two_bot && battle.player_two_id &&
    battle.player_two_character_id
  ) {
    targets.push({
      profileId: battle.player_two_id,
      characterId: battle.player_two_character_id,
    });
  }
  const players = await Promise.all(targets.map(async (target) => {
    const claims: SuggestionClaim[] = [];
    try {
      const fighter = await readSuggestionFighter(
        db,
        target.characterId,
        target.profileId,
      );
      for (const moveType of ALL_MOVE_TYPES) {
        const result = await reserveSuggestion(db, {
          profileId: target.profileId,
          battleId: battle.id,
          roundNumber,
          moveType,
          operation: "ensure_free",
          source: "prefetch",
          allowGenerate: flags.allowGenerate,
          allowReroll: false,
        });
        if (result.status === "claimed") claims.push(result);
      }
      if (!claims.length) {
        return {
          profile_id: target.profileId,
          status: "already_claimed_or_unavailable",
        };
      }
      const results = await generateClaimedSuggestions(db, {
        claims,
        fighter,
        theme: battle.theme ?? "an open arena",
        roundNumber,
        structureVersion: experienceVersion === 2 ? 2 : 1,
        situation: round?.situation_snapshot?.text ?? null,
      });
      return {
        profile_id: target.profileId,
        status: "generated",
        move_types: results.filter((r) => r.status === "ready").map((r) =>
          r.move_type
        ),
      };
    } catch (e) {
      // Includes partial reservation failure before the generator starts.
      await Promise.all(
        claims.map((c) =>
          db.rpc("finish_suggestion_operation", {
            p_operation_id: c.operation_id,
            p_lease_token: c.lease_token,
            p_suggestions: null,
            p_metadata: {},
            p_failure: "generation_failed",
          })
        ),
      );
      console.error("Suggestion prefetch failed", e);
      return { profile_id: target.profileId, status: "failed" };
    }
  }));
  return successResponse({
    battle_id: battle.id,
    round_number: roundNumber,
    players,
  });
});
