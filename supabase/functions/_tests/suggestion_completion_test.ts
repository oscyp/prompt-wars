import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as provider from "../_shared/move-suggestions.ts";
import { parseSuggestionRequest } from "../_shared/suggestion-service.ts";

Deno.test("exact cache enrichment accepts one owned set target only on ensure_free", () => {
  const body = {
    battle_id: "b",
    move_type: "attack",
    composition_version: 3,
    suggestion_set_id: "set-id",
  };
  assertEquals(parseSuggestionRequest(body).suggestion_set_id, "set-id");
  assertThrows(() =>
    parseSuggestionRequest({
      ...body,
      move_type: undefined,
      move_types: ["attack"],
    })
  );
  assertThrows(() =>
    parseSuggestionRequest({
      ...body,
      operation: "reroll",
      client_contract_version: 3,
      idempotency_key: "purchase-1",
      expected_credits: 1,
    })
  );
});

Deno.test("own action completion preserves user prefix and generates three intentions with three approaches", async () => {
  const old = globalThis.fetch;
  const key = Deno.env.get("SUGGESTIONS_API_KEY");
  Deno.env.set("SUGGESTIONS_API_KEY", "test-key");
  const approaches = [
    "by staying close to the support",
    "by moving as the light changes",
    "by keeping my footing steady",
  ];
  globalThis.fetch = ((_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert(body.messages[0].content.includes("untrusted"));
    assert(body.messages[1].content.includes("I lift the cable"));
    return Promise.resolve(Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            intentHints: [
              "to create space for retreat",
              "to change the opponent's route",
              "to clear the narrow passage",
            ].map((text) => ({ text, approachHints: approaches })),
          }),
        },
      }],
    }));
  }) as typeof fetch;
  try {
    const result = await provider.generateCompositionExtension({
      target: "intent",
      actionText: "I lift the cable",
      moveType: "attack",
      fighter: { name: "Ash", archetype: "mystic" },
      theme: "Neon arena",
      situation: "A loose cable hangs between supports.",
      roundNumber: 1,
      idNamespace: "custom-1",
    });
    assert(!Array.isArray(result.result));
    if (Array.isArray(result.result)) throw Error("wrong result");
    assertEquals(result.result.intentHints?.length, 3);
    assertEquals(result.result.intentHints?.[0].approachHints?.length, 3);
    assertEquals(result.result.intentHints?.[0].id, "custom-1:intent:0");
  } finally {
    globalThis.fetch = old;
    key === undefined
      ? Deno.env.delete("SUGGESTIONS_API_KEY")
      : Deno.env.set("SUGGESTIONS_API_KEY", key);
  }
});

Deno.test("cache upgrade preserves original identifiers, body and fragment spelling", async () => {
  const old = globalThis.fetch;
  const key = Deno.env.get("SUGGESTIONS_API_KEY");
  Deno.env.set("SUGGESTIONS_API_KEY", "test-key");
  const saved: provider.Suggestion[] = [0, 1, 2].map((i) => ({
    id: `old-${i}`,
    structureVersion: 2,
    title: `Saved ${i}`,
    body: "My exact purchased body stays unchanged.",
    action: `I walk toward support ${i}`,
    intentHints: [0, 1, 2].map((j) => ({
      id: `intent-${i}-${j}`,
      text: `to prepare an opening near side ${j}`,
    })),
  }));
  const approaches = saved.map((s) =>
    s.intentHints!.map(
      () => [
        "by moving with the light",
        "by staying near the support",
        "by waiting for a clear path",
      ],
    )
  );
  globalThis.fetch = (() =>
    Promise.resolve(
      Response.json({
        choices: [{ message: { content: JSON.stringify({ approaches }) } }],
      }),
    )) as typeof fetch;
  try {
    const result = await provider.generateCompositionExtension({
      target: "upgrade_v3",
      suggestions: saved,
      moveType: "attack",
      fighter: { name: "Ash", archetype: "mystic" },
      theme: "Neon arena",
      roundNumber: 1,
      idNamespace: "upgrade-1",
    });
    assert(Array.isArray(result.result));
    for (const [i, s] of result.result.entries()) {
      assertEquals(s.body, saved[i].body);
      assertEquals(s.id, saved[i].id);
      assertEquals(s.intentHints?.[0].id, saved[i].intentHints?.[0].id);
      assertEquals(s.compositionVersion, 3);
    }
    approaches[0][0] = [];
    await assertRejects(() =>
      provider.generateCompositionExtension({
        target: "upgrade_v3",
        suggestions: saved,
        moveType: "attack",
        fighter: { name: "Ash", archetype: "mystic" },
        theme: "Neon arena",
        roundNumber: 1,
        idNamespace: "upgrade-1",
      })
    );
  } finally {
    globalThis.fetch = old;
    key === undefined
      ? Deno.env.delete("SUGGESTIONS_API_KEY")
      : Deno.env.set("SUGGESTIONS_API_KEY", key);
  }
});
