import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type ModerationUnit,
  TextModerationProvider,
} from "../_shared/moderation.ts";
import { moderationResult } from "./fixtures/moderation.ts";
const clean = moderationResult();
async function isolated(
  run: () => Promise<void>,
  openai = "test",
  perspective = "",
) {
  const fetch = globalThis.fetch;
  const saved = ["OPENAI_API_KEY", "PERSPECTIVE_API_KEY"].map((k) =>
    [k, Deno.env.get(k)] as const
  );
  Deno.env.set("OPENAI_API_KEY", openai);
  Deno.env.set("PERSPECTIVE_API_KEY", perspective);
  try {
    await run();
  } finally {
    globalThis.fetch = fetch;
    for (const [k, v] of saved) {
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  }
}
Deno.test("typed short fragments pass while prompt minimum remains twenty and roles validate before deduplication", async () => {
  await isolated(async () => {
    const p = new TextModerationProvider();
    const units: ModerationUnit[] = [
      { kind: "title", text: "Step" },
      { kind: "action", text: "I step" },
      { kind: "intent", text: "to feint" },
      { kind: "body", text: "I step" },
    ];
    const result = await p.moderateUnits(units);
    assertEquals(result.map((r) => r.status), [
      "approved",
      "approved",
      "approved",
      "rejected",
    ]);
    assertEquals((await p.moderate("I step")).status, "rejected");
  }, "");
});
Deno.test("OpenAI batches unique inputs; joined harmful meaning is independently refused", async () => {
  await isolated(async () => {
    const seen: string[][] = [];
    globalThis.fetch = ((_url, init) => {
      const input = JSON.parse(String(init?.body)).input as string[];
      seen.push(input);
      return Promise.resolve(
        Response.json({
          id: "mod-1",
          results: input.map((t) =>
            t.includes("paired dangerous meaning")
              ? moderationResult({ hate: 0.98 })
              : clean
          ),
        }),
      );
    }) as typeof fetch;
    const result = await new TextModerationProvider().moderateUnits([
      { kind: "title", text: "Safe step" },
      { kind: "action", text: "Safe step" },
      { kind: "pair", text: "A paired dangerous meaning in this sentence." },
    ]);
    assertEquals(seen.length, 1);
    assertEquals(seen[0].length, 2);
    assertEquals(result.map((r) => r.status), [
      "approved",
      "approved",
      "rejected",
    ]);
  });
});
Deno.test("missing or malformed batch results fail closed", async () => {
  await isolated(async () => {
    for (const results of [[clean], [{}, clean], [clean, null]]) {
      globalThis.fetch = (() =>
        Promise.resolve(Response.json({ results }))) as typeof fetch;
      const r = await new TextModerationProvider().moderateUnits([{
        kind: "title",
        text: "First",
      }, { kind: "title", text: "Second" }]);
      assertEquals(r.every((v) => v.status !== "approved"), true);
    }
  });
});
Deno.test("fallback uses at most four requests and a single overall deadline", async () => {
  await isolated(
    async () => {
      let active = 0, max = 0, calls = 0;
      globalThis.fetch = ((_url, init) =>
        new Promise((_resolve, reject) => {
          calls++;
          active++;
          max = Math.max(active, max);
          init?.signal?.addEventListener("abort", () => {
            active--;
            reject(new DOMException("expired", "AbortError"));
          }, { once: true });
        })) as typeof fetch;
      const started = Date.now();
      const result = await new TextModerationProvider().moderateUnits(
        Array.from(
          { length: 10 },
          (_, i) => ({ kind: "title", text: "Step " + i }),
        ),
        { deadlineMs: 25 },
      );
      assertEquals(result.every((r) => r.status !== "approved"), true);
      assertEquals(max <= 4, true);
      assertEquals(calls, 4);
      assertEquals(Date.now() - started < 500, true);
    },
    "",
    "test",
  );
});

Deno.test("partial category maps and contradictory flags fail closed before policy evaluation", async () => {
  await isolated(async () => {
    for (
      const result of [
        {
          flagged: true,
          categories: { violence: false },
          category_scores: { violence: 0 },
        },
        {
          flagged: false,
          categories: { violence: false },
          category_scores: { violence: 0 },
        },
        { ...clean, flagged: true },
        {
          ...clean,
          category_scores: { ...clean.category_scores, violence: -1 },
        },
      ]
    ) {
      globalThis.fetch = (() =>
        Promise.resolve(Response.json({ results: [result] }))) as typeof fetch;
      const [verdict] = await new TextModerationProvider().moderateUnits([{
        kind: "title",
        text: "Steady footing",
      }]);
      assertEquals(verdict.status, "flagged_human_review");
      assertEquals(verdict.provider, "unavailable");
    }
  });
});

Deno.test("Perspective requires every requested attribute and valid score bounds", async () => {
  await isolated(
    async () => {
      const scores = Object.fromEntries(
        [
          "TOXICITY",
          "SEVERE_TOXICITY",
          "IDENTITY_ATTACK",
          "INSULT",
          "PROFANITY",
          "THREAT",
        ].map((key) => [key, { summaryScore: { value: 0 } }]),
      );
      for (const omitted of ["INSULT", "PROFANITY"]) {
        const partial = { ...scores };
        delete partial[omitted];
        globalThis.fetch = (() =>
          Promise.resolve(
            Response.json({ attributeScores: partial }),
          )) as typeof fetch;
        const [verdict] = await new TextModerationProvider().moderateUnits([{
          kind: "title",
          text: "Stable footing",
        }]);
        assertEquals(verdict.status, "flagged_human_review");
      }
      for (const value of [-1, 1.1]) {
        const invalid = { ...scores, THREAT: { summaryScore: { value } } };
        globalThis.fetch = (() =>
          Promise.resolve(
            Response.json({ attributeScores: invalid }),
          )) as typeof fetch;
        const [verdict] = await new TextModerationProvider().moderateUnits([{
          kind: "title",
          text: "Stable footing",
        }]);
        assertEquals(verdict.status, "flagged_human_review");
      }
    },
    "",
    "test",
  );
});
