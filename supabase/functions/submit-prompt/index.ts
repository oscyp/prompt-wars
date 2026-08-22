// Submit Prompt Edge Function
// Locks player's prompt for a battle (calls lock_prompt DB function)
// Integrates pre-gen moderation for custom prompts

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  getSupabaseSecretKey,
  successResponse,
} from "../_shared/utils.ts";
import { MoveType } from "../_shared/types.ts";
import { TextModerationProvider } from "../_shared/moderation.ts";
import { notifyOpponentSubmitted } from "../_shared/push.ts";

/**
 * Trigger battle resolution server-side (reliable async invocation)
 * Uses EdgeRuntime.waitUntil() when available, with awaited fallback for local/test runtimes
 */
async function triggerBattleResolution(battleId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseSecretKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const resolveFunctionUrl = `${supabaseUrl}/functions/v1/resolve-battle`;

  const resolutionTask = (async () => {
    try {
      const response = await fetch(resolveFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
        },
        body: JSON.stringify({ battle_id: battleId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Resolve-battle invocation failed:", errorText);
        throw new Error(`Resolve-battle failed: ${response.status}`);
      }

      console.log("Battle resolution triggered for:", battleId);
    } catch (error) {
      console.error("Battle resolution error:", error);
      throw error;
    }
  })();

  // Use EdgeRuntime.waitUntil when available (production/deployed)
  // @ts-ignore - EdgeRuntime may not be defined in all contexts
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(resolutionTask);
  } else {
    // Fallback: await for local/test runtimes to ensure completion
    await resolutionTask;
  }
}

/**
 * Generic async edge-function invoker with service-role auth.
 */
async function invokeFn(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing Supabase environment variables");
  }
  const url = `${supabaseUrl}/functions/v1/${fn}`;
  const task = (async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: secretKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Invoke ${fn} failed:`, await res.text());
    }
  })();
  // @ts-ignore EdgeRuntime may not be defined
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  } else {
    await task;
  }
}

interface SubmitPromptRequest {
  battle_id: string;
  prompt_template_id?: string;
  custom_prompt_text?: string;
  move_type: MoveType;
  round_number?: number; // Bo3 only; defaults to battles.current_round
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const {
      battle_id,
      prompt_template_id,
      custom_prompt_text,
      move_type,
      round_number: requestedRound,
    }: SubmitPromptRequest = await req.json();

    if (!battle_id || !move_type) {
      return errorResponse("battle_id and move_type required");
    }

    if (!prompt_template_id && !custom_prompt_text) {
      return errorResponse(
        "Either prompt_template_id or custom_prompt_text required",
      );
    }

    // §7.8 enforced rate limit: cap prompt submissions per hour and day,
    // before any moderation-provider spend.
    {
      const rateLimitClient = createServiceClient();
      const { data: rateCheck, error: rateErr } = await rateLimitClient.rpc(
        "check_rate_limit",
        { p_profile_id: userId, p_action: "prompt_submit" },
      );
      if (rateErr) {
        console.error("check_rate_limit error (fail-open):", rateErr);
      } else if (rateCheck && rateCheck.allowed === false) {
        return errorResponse(
          "Too many prompts submitted. Try again later.",
          429,
        );
      }
    }

    const supabase = createServiceClient();

    // Pre-gen moderation for custom prompts
    let moderationStatus:
      | "approved"
      | "rejected"
      | "flagged_human_review"
      | "pending" = "approved";

    if (custom_prompt_text) {
      const moderator = new TextModerationProvider();
      const moderationResult = await moderator.moderate(custom_prompt_text);

      moderationStatus = moderationResult.status;

      // Log the moderation outcome for EVERY result (approved, rejected,
      // flagged) BEFORE any early return, so blocked prompts leave an audit
      // trail. Best-effort: a logging failure must never block the response.
      try {
        const { error: modLogError } = await supabase
          .from("moderation_events")
          .insert({
            target_type: "battle_prompt",
            target_id: battle_id, // Prompt row may never exist for blocked submissions
            action: moderationResult.status,
            reason: moderationResult.reason,
            moderator_notes: moderationResult.flaggedCategories?.join(", "),
            automated: true,
            provider: moderationResult.provider,
            provider_request_id: moderationResult.providerRequestId,
            confidence_score: moderationResult.confidence,
            flagged_categories: moderationResult.flaggedCategories,
          });
        if (modLogError) {
          console.error("moderation_events insert failed:", modLogError);
        }
      } catch (modLogException) {
        console.error("moderation_events insert threw:", modLogException);
      }

      // MVP: reject unsafe, allow approved, reject flagged_human_review (conservative)
      if (moderationResult.status === "rejected") {
        return errorResponse(
          `Prompt rejected: ${
            moderationResult.reason || "Content policy violation"
          }`,
          403,
        );
      }

      if (moderationResult.status === "flagged_human_review") {
        return errorResponse(
          "Prompt requires review and cannot be submitted at this time",
          403,
        );
      }
    }

    // Fetch battle context BEFORE locking so lock_prompt writes the row for
    // the correct round (Bo3 rounds 2-3 have their own battle_prompts rows).
    const { data: battle, error: battleError } = await supabase
      .from("battles")
      .select(
        "status, player_one_id, player_two_id, is_player_two_bot, format, current_round, mode",
      )
      .eq("id", battle_id)
      .single();
    if (battleError || !battle) {
      return errorResponse("Battle not found", 404);
    }

    const isBo3 = battle.format === "bo3";
    const roundNumber = isBo3
      ? (requestedRound ?? battle.current_round ?? 1)
      : 1;

    // Bo3: validate per-round state BEFORE inserting the prompt row.
    let round: {
      id: string;
      status: string;
      player_one_locked_at: string | null;
      player_two_locked_at: string | null;
    } | null = null;
    if (isBo3) {
      const { data: roundRow, error: roundErr } = await supabase
        .from("battle_rounds")
        .select("id, status, player_one_locked_at, player_two_locked_at")
        .eq("battle_id", battle_id)
        .eq("round_number", roundNumber)
        .single();
      if (roundErr || !roundRow) {
        return errorResponse("Round not found", 404);
      }
      if (roundRow.status !== "waiting_for_prompts") {
        return errorResponse(
          `Round not accepting prompts (status=${roundRow.status})`,
          409,
        );
      }
      round = roundRow;
    }

    // Lock prompt via DB function (idempotent per battle/player/round; the
    // row is created with the correct round_number — no retag needed).
    const { data: promptId, error: lockError } = await supabase.rpc(
      "lock_prompt",
      {
        p_battle_id: battle_id,
        p_profile_id: userId,
        p_prompt_template_id: prompt_template_id ?? null,
        p_custom_prompt_text: custom_prompt_text ?? null,
        p_move_type: move_type,
        p_moderation_status: moderationStatus,
        p_round_number: roundNumber,
      },
    );

    if (lockError) {
      console.error("Lock prompt error:", lockError);
      return errorResponse(lockError.message || "Failed to submit prompt", 400);
    }

    // ---- Bo3 lock-in flow ----
    if (isBo3 && round) {
      // Decided in SQL under a row lock. Doing this in JS meant two players
      // submitting at the same instant both read "opponent not locked", so
      // neither set both_locked_at and neither triggered resolution -- the
      // round then timed out as a double forfeit despite both submitting.
      const { data: lockResult, error: lockRoundErr } = await supabase.rpc(
        "lock_round_side",
        {
          p_battle_id: battle_id,
          p_round_number: roundNumber,
          p_profile_id: userId,
        },
      );

      if (lockRoundErr) {
        console.error("lock_round_side error:", lockRoundErr);
        return errorResponse(
          lockRoundErr.message || "Failed to record lock-in",
          400,
        );
      }

      const lock = (lockResult ?? {}) as {
        both_locked?: boolean;
        should_resolve?: boolean;
        status?: string;
      };
      const bothLocked = lock.both_locked === true;

      if (bothLocked) {
        // Only the caller whose write flipped both_locked_at fires resolution;
        // the other one still reports "resolving" and must NOT nudge an
        // opponent who has already submitted.
        if (lock.should_resolve === true) {
          try {
            await invokeFn("round-resolve", {
              battle_id,
              round_number: roundNumber,
            });
          } catch (e) {
            console.error("round-resolve invoke failed:", e);
          }
        }
        return successResponse({
          success: true,
          prompt_id: promptId,
          battle_status: "resolving",
          round_number: roundNumber,
          message: "Prompt submitted. Round resolving...",
        });
      }

      // Opponent still needs to lock this round: nudge them (skips bots).
      notifyOpponentSubmitted(supabase, battle_id, userId);

      return successResponse({
        success: true,
        prompt_id: promptId,
        battle_status: "waiting_for_prompts",
        round_number: roundNumber,
        message: "Prompt submitted. Waiting for opponent...",
      });
    }

    // ---- Single-format flow (unchanged) ----

    if (battle && battle.status === "resolving") {
      // Both prompts submitted (or bot battle with human prompt), battle ready for resolution
      // Trigger server-owned resolution reliably
      try {
        await triggerBattleResolution(battle_id);
      } catch (error) {
        console.error("Failed to trigger battle resolution:", error);
        // Don't fail the response - resolution can be retried via scheduled job
      }

      return successResponse({
        success: true,
        prompt_id: promptId,
        battle_status: "resolving",
        message: "Prompt submitted. Battle resolving...",
      });
    }

    // This player locked in but the opponent still needs to play: nudge them.
    // Fire-and-forget; the helper skips bots and the submitter.
    notifyOpponentSubmitted(supabase, battle_id, userId);

    return successResponse({
      success: true,
      prompt_id: promptId,
      battle_status: battle?.status || "waiting_for_prompts",
      message: "Prompt submitted. Waiting for opponent...",
    });
  } catch (error) {
    console.error("Submit prompt error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal error",
      500,
    );
  }
});
