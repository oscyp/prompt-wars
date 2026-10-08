import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSuggestionSchema,
  generateSuggestions,
  validateSuggestions,
} from "../_shared/move-suggestions.ts";
import {
  parseSuggestionRequest,
  suggestionModerationUnits,
} from "../_shared/suggestion-service.ts";

export function compositionFixture() {
  return {
    suggestions: [
      "I step to the left",
      "I move toward the support",
      "I lower my stance",
    ].map((action, i) => ({
      title: `Move ${i}`,
      action,
      body: `${action} to leave room for a retreat`,
      intentHints: [
        "to leave room for a retreat",
        "to control the narrow passage",
        "to regain my balance",
      ].map((text) => ({
        text,
        approachHints: [
          "by moving before the light changes",
          "by keeping close to the support",
          "by waiting for the floor to settle",
        ],
      })),
    })),
  };
}

Deno.test("composition v3 retains compatible fields and assigns stable IDs to all 27 paths per type", () => {
  const result = validateSuggestions(compositionFixture(), 2, "bank", [], 3);
  assertEquals(result.length, 3);
  const paths = new Set<string>();
  for (const action of result) {
    assertEquals(action.structureVersion, 2);
    assertEquals(action.compositionVersion, 3);
    for (const intent of action.intentHints!) {
      for (const approach of intent.approachHints!) {
        paths.add(approach.id);
        const text = `${action.action} ${intent.text} ${approach.text}`;
        assert(text.length >= 20 && text.length <= 800);
      }
    }
  }
  assertEquals(paths.size, 27);
  assertEquals(
    result,
    validateSuggestions(compositionFixture(), 2, "bank", [], 3),
  );
  assertEquals(result[0].body, compositionFixture().suggestions[0].body);
});

Deno.test("composition rejects a missing, repeated or oversized approach without rejecting legacy input", () => {
  for (
    const hints of [[], ["only one option"], [
      "same approach",
      "same approach",
      "third approach",
    ], ["x".repeat(241), "second approach", "third approach"]]
  ) {
    const raw = compositionFixture();
    raw.suggestions[0].intentHints[0].approachHints = hints;
    assertThrows(() => validateSuggestions(raw, 2, "bank", [], 3));
  }
  const legacy = compositionFixture();
  const raw = {
    suggestions: legacy.suggestions.map((s) => ({
      ...s,
      intentHints: s.intentHints.map((h) => h.text),
    })),
  };
  assertEquals(validateSuggestions(raw, 2)[0].compositionVersion, undefined);
});

Deno.test("composition schema requires every approach and moderation includes every triple plus legacy pairs", () => {
  const schema = buildSuggestionSchema(["attack"], 2, [], 3);
  assert(JSON.stringify(schema).includes("approachHints"));
  const result = validateSuggestions(compositionFixture(), 2, "bank", [], 3);
  const units = result.flatMap(suggestionModerationUnits);
  assertEquals(units.filter((u) => u.kind === "approach").length, 27);
  assertEquals(units.filter((u) => u.kind === "triple").length, 27);
  assertEquals(units.filter((u) => u.kind === "pair").length, 9);
});

Deno.test("composition version is explicit and invalid versions cannot reserve an operation", () => {
  assertEquals(
    parseSuggestionRequest({
      battle_id: "b",
      move_type: "attack",
      composition_version: 3,
    }).composition_version,
    3,
  );
  for (const composition_version of [1, 4, "3", null]) {
    assertThrows(() =>
      parseSuggestionRequest({
        battle_id: "b",
        move_type: "attack",
        composition_version,
      })
    );
  }
});

Deno.test("v3 provider isolates a malformed type and increases the output budget", async () => {
  const saved = globalThis.fetch;
  const savedKey = Deno.env.get("SUGGESTIONS_API_KEY");
  Deno.env.set("SUGGESTIONS_API_KEY", "test-key");
  globalThis.fetch = ((_url: unknown, init: RequestInit) => {
    const req = JSON.parse(String(init.body));
    assertEquals(req.max_tokens, 4096 * 3);
    assert(req.messages[0].content.includes("Approach"));
    return Promise.resolve(
      Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              attack: compositionFixture(),
              defense: { suggestions: [] },
              finisher: compositionFixture(),
            }),
          },
        }],
      }),
    );
  }) as typeof fetch;
  try {
    const result = await generateSuggestions({
      fighter: { name: "Ash", archetype: "mystic" },
      moveTypes: ["attack", "defense", "finisher"],
      theme: "Neon arena",
      roundNumber: 1,
      seed: 1,
      structureVersion: 2,
      compositionVersion: 3,
    });
    assertEquals(result.suggestions.attack.length, 3);
    assertEquals(result.suggestions.finisher.length, 3);
    assertEquals(result.errors?.defense, "malformed_response");
  } finally {
    globalThis.fetch = saved;
    if (savedKey === undefined) Deno.env.delete("SUGGESTIONS_API_KEY");
    else Deno.env.set("SUGGESTIONS_API_KEY", savedKey);
  }
});
