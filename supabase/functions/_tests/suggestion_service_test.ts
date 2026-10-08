import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateClaimedSuggestions,
  generateVersionedClaimedSuggestions,
  parseSuggestionRequest,
  reserveSuggestion,
  type SuggestionClaim,
  suggestionFlags,
} from "../_shared/suggestion-service.ts";
import { validateCombinedSuggestions } from "../_shared/move-suggestions.ts";
const claim: SuggestionClaim = {
  status: "claimed",
  operation_id: "operation-a",
  id: "row-a",
  lease_token: "lease-a",
  credits_spent: 1,
  is_paid: true,
  move_type: "attack",
};
const options = validateCombinedSuggestions(
  {
    attack: {
      suggestions: ["I step left", "I lower my guard", "I turn my shoulder"]
        .map((action, i) => ({
          title: "Move " + i,
          body: action + " to draw a response and gain space.",
          action,
          intentHints: [
            "to draw a response and gain space.",
            "to change the rhythm of the exchange.",
            "to leave room for a careful retreat.",
          ],
        })),
    },
  },
  ["attack"],
  2,
  "op",
);
const generated = {
  suggestions: options,
  provider: "test",
  model: "test-model",
  costUsd: 0.002,
  latencyMs: 10,
};
function fakeDb(stale = false) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const data = name === "renew_suggestion_operation"
        ? !stale
        : name === "reserve_suggestion_operation"
        ? { status: "pending", credits_spent: 0, is_paid: false }
        : {
          status: stale ? "stale" : args.p_failure ? "failed" : "ready",
          suggestions: args.p_suggestions,
        };
      return Promise.resolve({ data, error: null });
    },
  };
}
const input = {
  claims: [claim],
  fighter: { name: "Ash", archetype: "mystic" },
  theme: "Open arena",
  roundNumber: 1,
  structureVersion: 2 as const,
  situation: "Water covers part of the floor.",
};

Deno.test("mixed persisted composition versions start together so every reserved lease is renewed", async () => {
  const started: number[] = [];
  let release: () => void = () => {};
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const result = await generateVersionedClaimedSuggestions(fakeDb(), {
    ...input,
    claims: [{ ...claim, composition_version: 2 }, {
      ...claim,
      move_type: "defense",
      operation_id: "operation-d",
      composition_version: 3,
    }],
    compositionVersion: 3,
  }, async (_db, group) => {
    started.push(group.compositionVersion!);
    if (started.length === 2) release();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        bothStarted,
        new Promise<void>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(Error("a reserved group waited without heartbeat")),
            30,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return group.claims.map((c) => ({ ...c, status: "ready" as const }));
  });
  assertEquals(started, [2, 3]);
  assertEquals(result.map((r) => r.status), ["ready", "ready"]);
});
Deno.test("omitted legacy operation is free-only and reroll needs explicit price plus idempotency key", () => {
  assertEquals(
    parseSuggestionRequest({ battle_id: "b", move_type: "attack" }).operation,
    "ensure_free",
  );
  for (
    const body of [
      { operation: "reroll" },
      { operation: "reroll", idempotency_key: "operation-1" },
      { operation: "reroll", expected_credits: 1 },
      {
        operation: "reroll",
        expected_credits: -1,
        idempotency_key: "operation-1",
      },
      { operation: "unknown" },
    ]
  ) {
    assertThrows(() =>
      parseSuggestionRequest({
        battle_id: "b",
        move_type: "attack",
        client_contract_version: 3,
        ...body,
      })
    );
  }
});
Deno.test("paid rerolls require the integer v3 contract, while legacy omitted operations stay free", () => {
  const base = {
    battle_id: "b",
    move_type: "attack",
    operation: "reroll",
    idempotency_key: "purchase-1",
    expected_credits: 1,
  };
  for (const client_contract_version of [undefined, null, 2, "3", 2.9]) {
    assertThrows(() =>
      parseSuggestionRequest({ ...base, client_contract_version })
    );
  }
  assertEquals(
    parseSuggestionRequest({ ...base, client_contract_version: 3 }).operation,
    "reroll",
  );
  assertEquals(
    parseSuggestionRequest({
      ...base,
      operation: undefined,
      client_contract_version: 2,
    }).operation,
    "ensure_free",
  );
});
Deno.test("free requests never reserve a paid operation, including a pending prefetch", async () => {
  const db = fakeDb();
  const result = await reserveSuggestion(db, {
    profileId: "p",
    battleId: "b",
    roundNumber: 1,
    moveType: "attack",
    operation: "ensure_free",
    source: "player",
    allowGenerate: true,
    allowReroll: true,
  });
  assertEquals(result.status, "pending");
  assertEquals(db.calls[0].args.p_operation, "ensure_free");
  assertEquals(db.calls.some((c) => c.name.includes("spend")), false);
});
Deno.test("all fragments and all assembled pairs are moderated before a fenced completion", async () => {
  const db = fakeDb();
  const moderated: string[] = [];
  const result = await generateClaimedSuggestions(db, input, {
    generate: () => Promise.resolve(generated),
    moderate: (text) => {
      moderated.push(text);
      return Promise.resolve({ status: "approved" });
    },
  });
  assertEquals(result[0].status, "ready");
  for (const option of options.attack) {
    assertEquals(moderated.includes(option.title), true);
    assertEquals(moderated.includes(option.body), true);
    assertEquals(moderated.includes(option.action!), true);
    for (const hint of option.intentHints!) {
      assertEquals(moderated.includes(option.action + " " + hint.text), true);
      assertEquals(moderated.includes(hint.text), true);
    }
  }
  const finish = db.calls.find((c) =>
    c.name === "finish_suggestion_operation"
  )!;
  assertEquals(finish.args.p_lease_token, "lease-a");
  assertEquals(finish.args.p_suggestions, options.attack);
});
Deno.test("one unsafe intent fails the purchased structured set through the refund RPC", async () => {
  const db = fakeDb();
  const result = await generateClaimedSuggestions(db, input, {
    generate: () => Promise.resolve(generated),
    moderate: () =>
      Promise.resolve({
        status: "flagged_human_review",
        reason: "unsafe pair",
      }),
  });
  assertEquals(result[0].status, "failed");
  const finish = db.calls.find((c) =>
    c.name === "finish_suggestion_operation"
  )!;
  assertEquals(finish.args.p_failure, "moderation_rejected");
  assertEquals(finish.args.p_suggestions, null);
});
Deno.test("provider failure terminalizes all owned claims instead of touching rows or wallet directly", async () => {
  const db = fakeDb();
  await assertRejects(() =>
    generateClaimedSuggestions(db, input, {
      generate: () => Promise.reject(Error("offline")),
    })
  );
  assertEquals(
    db.calls.filter((c) => c.name === "finish_suggestion_operation").length,
    1,
  );
  assertEquals(
    db.calls.find((c) => c.name === "finish_suggestion_operation")?.args
      .p_failure,
    "generation_failed",
  );
});
Deno.test("expired lease stops generation; stale cleanup cannot change another worker result", async () => {
  const db = fakeDb(true);
  let generatedCalls = 0;
  await assertRejects(() =>
    generateClaimedSuggestions(db, input, {
      generate: () => {
        generatedCalls++;
        return Promise.resolve(generated);
      },
    })
  );
  assertEquals(generatedCalls, 0);
  assertEquals(
    db.calls.every((c) =>
      ["renew_suggestion_operation", "finish_suggestion_operation"].includes(
        c.name,
      )
    ),
    true,
  );
});

Deno.test("suggestions are available by default and retain the independent emergency stop", () => {
  const reads: string[] = [];
  assertEquals(
    suggestionFlags((name) => {
      reads.push(name);
      return undefined;
    }),
    { allowGenerate: true, allowReroll: true },
  );
  assertEquals(reads, ["SUGGESTIONS_AI_DISABLED"]);
  assertEquals(
    suggestionFlags((name) =>
      name === "SUGGESTIONS_AI_DISABLED" ? "true" : undefined
    ),
    { allowGenerate: false, allowReroll: true },
  );
});

Deno.test("real heuristic moderator approves three safe structured cards without concatenation artefacts", async () => {
  const saved = ["OPENAI_API_KEY", "PERSPECTIVE_API_KEY"].map((k) =>
    [k, Deno.env.get(k)] as const
  );
  try {
    for (const [k] of saved) Deno.env.delete(k);
    const db = fakeDb();
    const longOptions = validateCombinedSuggestions(
      {
        attack: {
          suggestions: ["left", "right", "back"].map((direction) => ({
            title: "Change the angle",
            action:
              `I step ${direction} along the edge of the platform, turn my shoulder away from the hanging cable, then brace my heel against a solid support as the water moves beneath us.`,
            body:
              "I change the angle along the platform and make a little room to respond while keeping my footing steady.",
            intentHints: [
              "to keep the narrow path open and make the opponent choose a slower route across the slippery boards.",
              "to draw attention toward the support while preserving a clear exit behind my shoulder for the next exchange.",
              "to steady my footing before the next wave reaches the platform and changes the balance of the encounter.",
            ],
          })),
        },
      },
      ["attack"],
      2,
    );
    const result = await generateClaimedSuggestions(db, input, {
      generate: () =>
        Promise.resolve({ ...generated, suggestions: longOptions }),
    });
    assertEquals(result[0].status, "ready");
  } finally {
    for (const [k, v] of saved) {
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  }
});
Deno.test("free batch accepts one to three unique types and rejects ambiguous or paid batch requests", () => {
  assertEquals(
    parseSuggestionRequest({
      battle_id: "b",
      operation: "ensure_free",
      move_types: ["attack", "defense", "finisher"],
    }).move_types,
    ["attack", "defense", "finisher"],
  );
  for (
    const extras of [
      { move_types: [] },
      { move_types: ["attack", "attack"] },
      { move_types: ["attack", "unknown"] },
      { move_types: ["attack"], move_type: "attack" },
      {
        move_types: ["attack"],
        operation: "reroll",
        client_contract_version: 3,
        idempotency_key: "purchase1",
        expected_credits: 1,
      },
    ]
  ) assertThrows(() => parseSuggestionRequest({ battle_id: "b", ...extras }));
});

Deno.test("unsafe joined pair rejects all three cards and records typed audit without prompt text", async () => {
  const db = fakeDb();
  const pair = options.attack[0].action + " " +
    options.attack[0].intentHints![1].text;
  const results = await generateClaimedSuggestions(db, input, {
    generate: () => Promise.resolve(generated),
    moderate: (text) =>
      Promise.resolve(
        text === pair
          ? { status: "rejected", reason: "unsafe pair" }
          : { status: "approved" },
      ),
  });
  assertEquals(results[0].status, "failed");
  const audit = db.calls.find((c) => c.name === "finish_suggestion_operation")!
    .args.p_metadata as { moderation: { kind: string; status: string }[][] };
  assertEquals(
    audit.moderation.flat().some((v) =>
      v.kind === "pair" && v.status === "rejected"
    ),
    true,
  );
  assertEquals(
    JSON.stringify(audit).includes(options.attack[0].action!),
    false,
  );
});
Deno.test("moderation deadline terminalizes owned purchase without publishing partial approvals", async () => {
  const db = fakeDb();
  const result = await generateClaimedSuggestions(db, input, {
    generate: () => Promise.resolve(generated),
    moderate: () => new Promise(() => {}),
    moderationDeadlineMs: 20,
  });
  assertEquals(result[0].status, "failed");
  const finished = db.calls.find((c) =>
    c.name === "finish_suggestion_operation"
  )!;
  assertEquals(finished.args.p_failure, "moderation_rejected");
  assertEquals(finished.args.p_suggestions, null);
});

Deno.test("a heartbeat during a committed completion does not fail the other banks", async () => {
  const originalInterval = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  let tick: () => void = () => {};
  globalThis.setInterval = ((callback: () => void) => {
    tick = callback;
    return 1;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => {}) as typeof clearInterval;
  const states = new Map([["operation-a", "pending"], [
    "operation-d",
    "pending",
  ]]);
  const terminal: { id: unknown; failure: unknown }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const id = String(args.p_operation_id);
      if (name === "renew_suggestion_operation") {
        return {
          data: states.get(id) === "pending",
          error: null,
        };
      }
      if (name !== "finish_suggestion_operation") throw Error(name);
      const status = args.p_failure ? "failed" : "ready";
      states.set(id, status);
      terminal.push({ id, failure: args.p_failure });
      if (id === "operation-a" && status === "ready") {
        tick();
        // DB committed, but its completion response is still in flight.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { data: { status }, error: null };
    },
  };
  try {
    const result = await generateClaimedSuggestions(db, {
      ...input,
      claims: [claim, {
        ...claim,
        operation_id: "operation-d",
        lease_token: "lease-d",
        move_type: "defense",
      }],
    }, {
      generate: () =>
        Promise.resolve({
          ...generated,
          suggestions: { ...options, defense: options.attack },
        }),
      moderate: () => Promise.resolve({ status: "approved" }),
    });
    assertEquals(result.map((r) => r.status), ["ready", "ready"]);
    assertEquals(terminal, [{ id: "operation-a", failure: null }, {
      id: "operation-d",
      failure: null,
    }]);
  } finally {
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClear;
  }
});
