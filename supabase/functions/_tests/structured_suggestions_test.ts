import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  SuggestionError,
  validateSuggestions,
} from "../_shared/move-suggestions.ts";

function structuredSet() {
  return {
    suggestions: ["Step sideways", "Lower my stance", "Draw a wide arc"].map((
      action,
      i,
    ) => ({
      title: `Move ${i}`,
      body: `${action} to create room for my next move.`,
      action,
      intentHints: [
        "to create room for my next move.",
        "to draw attention away from my feet.",
        "to slow the exchange and regain balance.",
      ],
    })),
  };
}

Deno.test("structured options survive validation with stable server-owned IDs", () => {
  const input = structuredSet();
  const result = validateSuggestions(input, 2, "set-a");
  assertEquals(result[0].action, "Step sideways");
  assertEquals(result[0].structureVersion, 2);
  assertEquals(result[0].id, "set-a:action:0");
  assertEquals(result[0].intentHints?.[0], {
    id: "set-a:action:0:intent:0",
    text: "to create room for my next move.",
  });
  assertEquals(validateSuggestions(input, 2, "set-a"), result);
  assertEquals(
    result[0].body,
    "Step sideways to create room for my next move.",
  );
});

Deno.test("structured options reject missing, duplicate and oversized intent choices", () => {
  for (
    const intents of [[], ["one", "two"], ["same", "same", "different"], [
      "x".repeat(181),
      "second",
      "third",
    ]]
  ) {
    const input = structuredSet();
    input.suggestions[0].intentHints = intents;
    assertThrows(() => validateSuggestions(input, 2, "set-a"), SuggestionError);
  }
});

Deno.test("structured options reject duplicate or oversized actions", () => {
  const same = structuredSet();
  same.suggestions[1].action = same.suggestions[0].action;
  assertThrows(() => validateSuggestions(same, 2, "set-a"), SuggestionError);
  const long = structuredSet();
  long.suggestions[0].action = "a".repeat(241);
  assertThrows(() => validateSuggestions(long, 2, "set-a"), SuggestionError);
});

Deno.test("legacy sets need no structure and retain the existing title/body contract", () => {
  const input = {
    suggestions: structuredSet().suggestions.map(({ title, body }) => ({
      title,
      body,
    })),
  };
  assertEquals(validateSuggestions(input), input.suggestions);
});

Deno.test("optional affordance tags are validated against the published scene allowlist", () => {
  const input = {
    suggestions: structuredSet().suggestions.map((s) => ({
      ...s,
      affordanceIds: ["cable", "forged", "cable", 17],
    })),
  };
  assertEquals(
    validateSuggestions(input, 2, "tags", ["cable", "water"])[0].affordanceIds,
    ["cable"],
  );
  assertEquals(
    validateSuggestions(input, 2, "tags")[0].affordanceIds,
    undefined,
  );
  assertEquals(
    validateSuggestions(structuredSet(), 2, "tags", ["cable"])[0].affordanceIds,
    undefined,
  );
});
