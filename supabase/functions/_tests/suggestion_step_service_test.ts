import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateClaimedStep,
  parseStepRerollRequest,
  publicStepResult,
} from "../_shared/suggestion-step-reroll.ts";

const request = {
  battle_id: "battle",
  round_number: 1,
  move_type: "attack",
  target: "approach",
  action_text: "I step beside the support",
  intent_text: "to keep a clear route",
  composition_version: 3,
  client_contract_version: 3,
  idempotency_key: "purchase-123",
  expected_credits: 1,
};
const approaches = [
  "by waiting for the next flash",
  "by moving along the dry boards",
  "by keeping my footing steady",
]
  .map((text, i) => ({ id: `approach-${i}`, text }));
const context = {
  target: "approach" as const,
  actionText: request.action_text,
  intentText: request.intent_text,
  moveType: "attack" as const,
  fighter: { name: "Ash", archetype: "mystic" },
  theme: "Precision",
  situation: "A cable hangs over a wet platform.",
  roundNumber: 1,
  idNamespace: "op",
};
const claim = {
  status: "claimed" as const,
  operation_id: "op",
  lease_token: "lease",
  credits_spent: 1,
  is_paid: true,
};
const generated = () =>
  Promise.resolve({
    result: { approachHints: approaches },
    provider: "test",
    model: "test",
    latencyMs: 1,
  });

Deno.test("step purchases require explicit confirmation, bounded parents and composition v3", () => {
  assertEquals(parseStepRerollRequest(request).expected_credits, 1);
  assertEquals(
    parseStepRerollRequest({ ...request, expected_credits: 0 })
      .expected_credits,
    0,
  );
  assertEquals(
    parseStepRerollRequest(request, "header-key").idempotency_key,
    "header-key",
  );
  for (
    const update of [
      { idempotency_key: undefined },
      { expected_credits: undefined },
      { expected_credits: -1 },
      { expected_credits: 1.5 },
      { target: "upgrade_v3" },
      { target: "action" },
      { composition_version: 2 },
      { client_contract_version: 2 },
      { round_number: 4 },
      { action_text: "tiny" },
      { action_text: "a".repeat(241) },
      { intent_text: "i".repeat(181) },
      { target: "intent" },
    ]
  ) assertThrows(() => parseStepRerollRequest({ ...request, ...update }));
  assertEquals(
    parseStepRerollRequest({
      ...request,
      target: "intent",
      intent_text: undefined,
    }).target,
    "intent",
  );
});

Deno.test("step result exposes only client fields and never worker context or provider metadata", () => {
  const result = publicStepResult(
    {
      ...claim,
      status: "ready",
      context_snapshot: { hidden: true },
      provider_metadata: { text: "private" },
      action_text: "private",
      result: { approachHints: approaches },
    } as never,
  );
  assertEquals(result.lease_token, undefined);
  assertEquals(result.context_snapshot, undefined);
  assertEquals(result.provider_metadata, undefined);
  assertEquals(result.action_text, undefined);
  assertEquals(result.credits_spent, 1);
  assertEquals(result.result, { approachHints: approaches });
});

function database(renew = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({
        error: null,
        data: name === "renew_suggestion_step_operation" ? renew : {
          status: args.p_failure ? "failed" : "ready",
          result: args.p_result,
          credits_spent: 1,
          refunded: Boolean(args.p_failure),
          error: args.p_failure,
        },
      });
    },
  };
}

Deno.test("paid step checks parent pair and every triple before fenced delivery", async () => {
  const db = database();
  const seen: string[] = [];
  const result = await generateClaimedStep(
    db,
    claim,
    () => Promise.resolve(context),
    {
      generate: generated,
      moderate: (text) => {
        seen.push(text);
        return Promise.resolve({ status: "approved" });
      },
    },
  );
  assertEquals(result.status, "ready");
  assertEquals(
    seen.includes(`${request.action_text} ${request.intent_text}`),
    true,
  );
  for (const approach of approaches) {
    assertEquals(
      seen.includes(
        `${request.action_text} ${request.intent_text} ${approach.text}`,
      ),
      true,
    );
  }
  assertEquals(db.calls[0].name, "renew_suggestion_step_operation");
  assertEquals(db.calls.at(-1)?.name, "finish_suggestion_step_operation");
  assertEquals(db.calls.at(-1)?.args.p_lease_token, "lease");
  assertEquals(db.calls.at(-1)?.args.p_result, { approachHints: approaches });
});

Deno.test("unsafe combined meaning fails a paid step through its refund finalizer", async () => {
  const db = database();
  const result = await generateClaimedStep(
    db,
    claim,
    () => Promise.resolve(context),
    {
      generate: generated,
      moderate: (text) =>
        Promise.resolve({
          status: text ===
              `${request.action_text} ${request.intent_text} ${
                approaches[1].text
              }`
            ? "rejected"
            : "approved",
        }),
    },
  );
  assertEquals(result.status, "failed");
  assertEquals(result.refunded, true);
  assertEquals(db.calls.at(-1)?.args.p_result, null);
  assertEquals(db.calls.at(-1)?.args.p_failure, "moderation_rejected");
});

Deno.test("context loading and moderation timeout failures use the same financial worker fence", async () => {
  for (const failContext of [true, false]) {
    const db = database();
    const result = await generateClaimedStep(
      db,
      claim,
      () =>
        failContext
          ? Promise.reject(new Error("context"))
          : Promise.resolve(context),
      {
        generate: generated,
        moderate: () => new Promise(() => {}),
        moderationDeadlineMs: 5,
      },
    );
    assertEquals(result.status, "failed");
    assertEquals(result.refunded, true);
    assertEquals(db.calls.at(-1)?.args.p_result, null);
  }
});

Deno.test("unowned step cannot generate and lost worker cannot publish a paid result", async () => {
  const db = database(false);
  await assertRejects(() =>
    generateClaimedStep(
      db,
      { ...claim, lease_token: undefined },
      () => Promise.resolve(context),
    )
  );
  let called = false;
  await generateClaimedStep(db, claim, () => Promise.resolve(context), {
    generate: () => {
      called = true;
      return generated();
    },
  });
  assertEquals(called, false);
  assertEquals(db.calls.at(-1)?.args.p_result, null);
});

Deno.test("paid intentions deliver all nine descendant paths without changing the action", async () => {
  const db = database();
  const intents = [
    "to leave a clear route",
    "to protect my footing",
    "to control the open space",
  ]
    .map((text, index) => ({
      id: `intent-${index}`,
      text,
      approachHints: approaches,
    }));
  const seen: string[] = [];
  const result = await generateClaimedStep(
    db,
    claim,
    () =>
      Promise.resolve({ ...context, target: "intent", intentText: undefined }),
    {
      generate: () =>
        Promise.resolve({
          result: { intentHints: intents },
          provider: "test",
          model: "test",
          latencyMs: 1,
        }),
      moderate: (text) => {
        seen.push(text);
        return Promise.resolve({ status: "approved" });
      },
    },
  );
  assertEquals(result.status, "ready");
  assertEquals(result.result, { intentHints: intents });
  for (const intent of intents) {
    for (const approach of approaches) {
      assertEquals(
        seen.includes(`${request.action_text} ${intent.text} ${approach.text}`),
        true,
      );
    }
  }
});

Deno.test("incomplete paid descendants fail delivery instead of charging for a partial set", async () => {
  const db = database();
  const result = await generateClaimedStep(
    db,
    claim,
    () => Promise.resolve(context),
    {
      generate: () =>
        Promise.resolve({
          result: { approachHints: approaches.slice(0, 2) },
          provider: "test",
          model: "test",
          latencyMs: 1,
        }),
      moderate: () => Promise.resolve({ status: "approved" }),
    },
  );
  assertEquals(result.status, "failed");
  assertEquals(result.error, "malformed_response");
  assertEquals(result.refunded, true);
  assertEquals(result.result, null);
});

Deno.test("lost finalization response recovers recorded success through the same operation token", async () => {
  let finalized = false;
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "renew_suggestion_step_operation") {
        return Promise.resolve({
          data: true,
          error: null,
        });
      }
      assertEquals(args.p_operation_id, "op");
      assertEquals(args.p_lease_token, "lease");
      if (!finalized) {
        finalized = true;
        return Promise.reject(new Error("HTTP response lost after commit"));
      }
      return Promise.resolve({
        data: {
          status: "ready",
          credits_spent: 1,
          refunded: false,
          result: { approachHints: approaches },
        },
        error: null,
      });
    },
  };
  const result = await generateClaimedStep(
    db,
    claim,
    () => Promise.resolve(context),
    {
      generate: generated,
      moderate: () => Promise.resolve({ status: "approved" }),
    },
  );
  assertEquals(result.status, "ready");
  assertEquals(result.refunded, false);
});

Deno.test("stale finalizer retains only recovery metadata so clients poll the same paid key", async () => {
  const db = {
    rpc: (name: string) =>
      Promise.resolve({
        error: null,
        data: name === "renew_suggestion_step_operation"
          ? true
          : { status: "stale" },
      }),
  };
  const result = await generateClaimedStep(
    db,
    {
      ...claim,
      context_key: "parent-context",
      target: "approach",
      composition_version: 3,
      refunded: false,
    },
    () => Promise.resolve(context),
    {
      generate: generated,
      moderate: () => Promise.resolve({ status: "approved" }),
    },
  );
  assertEquals(publicStepResult(result), {
    status: "stale",
    operation_id: "op",
    context_key: "parent-context",
    target: "approach",
    composition_version: 3,
    credits_spent: 1,
    is_paid: true,
    refunded: false,
    result: null,
    error: undefined,
  });
});
