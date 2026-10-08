import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateClaimedCompletion,
  parseCompletionRequest,
  publicCompletionResult,
} from "../_shared/suggestion-completion.ts";

Deno.test("custom completion only accepts explicit bounded fragments and client v3", () => {
  const base = {
    battle_id: "battle",
    round_number: 1,
    move_type: "attack",
    target: "intent",
    action_text: "I step past the support",
    composition_version: 3,
    client_contract_version: 3,
  };
  assertEquals(parseCompletionRequest(base).action_text, base.action_text);
  for (
    const changes of [
      { target: "upgrade_v3" },
      { target: "approach" },
      { action_text: "tiny" },
      { action_text: "x".repeat(241) },
      { composition_version: 2 },
      { client_contract_version: 2 },
    ]
  ) assertThrows(() => parseCompletionRequest({ ...base, ...changes }));
  assertEquals(
    parseCompletionRequest({
      ...base,
      target: "approach",
      intent_text: "  to regain my footing  ",
    }).intent_text,
    "to regain my footing",
  );
});

Deno.test("a rejected final triple fails free completion and never calls a financial RPC", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({
        error: null,
        data: name === "renew_suggestion_completion" ? true : {
          status: args.p_failure ? "failed" : "ready",
          result: args.p_result,
          lease_token: "private",
        },
      });
    },
  };
  const actionText = "I step past the support";
  const intentText = "to regain my footing";
  const approaches = [
    "by waiting for the light to change",
    "by moving along the dry boards",
    "by keeping my stance wide",
  ].map((text, i) => ({ id: `a${i}`, text }));
  const result = await generateClaimedCompletion(db, {
    status: "claimed",
    operation_id: "op",
    lease_token: "lease",
    context_key: "context",
    target: "approach",
    remaining_adaptations: 5,
  }, {
    target: "approach",
    actionText,
    intentText,
    moveType: "attack",
    fighter: { name: "Ash", archetype: "mystic" },
    theme: "Neon arena",
    roundNumber: 1,
    idNamespace: "op",
  }, {
    generate: () =>
      Promise.resolve({
        result: { approachHints: approaches },
        provider: "test",
        model: "test",
        latencyMs: 1,
      }),
    moderate: (text) =>
      Promise.resolve({
        status: text === `${actionText} ${intentText} ${approaches[1].text}`
          ? "rejected"
          : "approved",
      }),
  });
  assertEquals(result.status, "failed");
  assertEquals(
    calls.every((c) =>
      ["renew_suggestion_completion", "finish_suggestion_completion"].includes(
        c.name,
      )
    ),
    true,
  );
  const finish = calls.find((c) => c.name === "finish_suggestion_completion")!;
  assertEquals(finish.args.p_failure, "moderation_rejected");
  assertEquals(finish.args.p_result, null);
  assertEquals("lease_token" in publicCompletionResult(result), false);
});

Deno.test("short own fragments remain valid when their complete triple meets the prompt bound", async () => {
  const db = {
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve({
        error: null,
        data: name === "renew_suggestion_completion" ? true : {
          status: args.p_failure ? "failed" : "ready",
          result: args.p_result,
        },
      }),
  };
  const result = await generateClaimedCompletion(db, {
    status: "claimed",
    operation_id: "op",
    lease_token: "lease",
  }, {
    target: "approach",
    actionText: "I hop",
    intentText: "to win",
    moveType: "attack",
    fighter: { name: "Ash", archetype: "mystic" },
    theme: "Arena",
    roundNumber: 1,
    idNamespace: "op",
  }, {
    generate: () =>
      Promise.resolve({
        provider: "test",
        model: "test",
        latencyMs: 1,
        result: {
          approachHints: [
            "by keeping my feet close together",
            "by using the raised platform",
            "by waiting for the next opening",
          ].map((text, i) => ({ id: `a${i}`, text })),
        },
      }),
    moderate: () => Promise.resolve({ status: "approved" }),
  });
  assertEquals(result.status, "ready");
});
