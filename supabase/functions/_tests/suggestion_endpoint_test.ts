import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { moderationResult } from "./fixtures/moderation.ts";
type Handler = (req: Request) => Promise<Response>;
Deno.test("suggestion HTTP contract preserves price errors, private leases and eligible guest access", async (t) => {
  const originalServe = Deno.serve;
  let handler: Handler | undefined;
  try {
    Deno.serve = ((h: Handler) => {
      handler = h;
    }) as unknown as typeof Deno.serve;
    await import("../generate-move-suggestions/index.ts");
  } finally {
    Deno.serve = originalServe;
  }
  assert(handler);
  const invoke = handler;
  const values = {
    SUPABASE_URL: "https://suggestions.test",
    SUPABASE_ANON_KEY: "anon-test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    SUPABASE_PUBLISHABLE_KEYS: "",
    SUPABASE_SECRET_KEYS: "",
    SUGGESTIONS_AI_DISABLED: "false",
    SUGGESTIONS_API_KEY: "fake-suggestions-key",
    OPENAI_API_KEY: "fake-moderation-key",
    PERSPECTIVE_API_KEY: "",
  };
  const saved = Object.fromEntries(
    Object.keys(values).map((k) => [k, Deno.env.get(k)]),
  );
  for (const [k, v] of Object.entries(values)) Deno.env.set(k, v);
  const savedFetch = globalThis.fetch;
  let participant = true;
  let calls = 0;
  let grouped = false;
  let generationCalls = 0;
  const finalMoves: string[] = [];
  let reserve: Record<string, unknown> = {
    status: "pending",
    id: "row",
    operation_id: "op",
    is_paid: false,
    credits_spent: 0,
    lease_token: "never-public",
  };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/auth/v1/user")) {
      return Promise.resolve(
        Response.json({
          id: "player",
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
        }),
      );
    }
    if (url.endsWith("/rpc/get_account_eligibility")) {
      return Promise.resolve(
        Response.json({ can_generate: true, can_play: true }),
      );
    }
    if (url.includes("/rest/v1/battles?")) {
      return Promise.resolve(
        Response.json({
          id: "battle",
          current_round: 1,
          player_one_id: participant ? "player" : "other",
          player_two_id: null,
          player_one_character_id: "character",
          prompt_experience_version: 2,
        }),
      );
    }
    if (url.endsWith("/rpc/reserve_suggestion_operation")) {
      calls++;
      const args = JSON.parse(String(init?.body));
      assertEquals(args.p_profile_id, "player");
      assertEquals(args.p_source, "player");
      assertEquals(args.p_allow_generate, true);
      assertEquals(args.p_allow_reroll, true);
      if (grouped) {
        return Promise.resolve(Response.json({
          status: args.p_move_type === "attack" ? "pending" : "claimed",
          operation_id: "op-" + args.p_move_type,
          lease_token: "lease-" + args.p_move_type,
          is_paid: false,
          credits_spent: 0,
        }));
      }
      return Promise.resolve(Response.json(reserve));
    }
    if (url.includes("/rest/v1/characters?")) {
      return Promise.resolve(
        Response.json({
          id: "character",
          profile_id: "player",
          name: "Ash",
          archetype: "mystic",
        }),
      );
    }
    if (url.includes("/rest/v1/battle_rounds?")) {
      return Promise.resolve(
        Response.json({
          situation_snapshot: {
            id: "neon-1",
            catalogVersion: 1,
            text: "Water lies beneath a loose cable.",
          },
        }),
      );
    }
    if (url.endsWith("/rpc/renew_suggestion_operation")) {
      return Promise.resolve(Response.json(true));
    }
    if (url.endsWith("/chat/completions")) {
      generationCalls++;
      const args = JSON.parse(String(init?.body));
      assertEquals(args.response_format.json_schema.schema.required, [
        "defense",
        "finisher",
      ]);
      const content = Object.fromEntries(
        ["defense", "finisher"].map(
          (type) => [type, {
            suggestions: ["left", "right", "back"].map((direction) => ({
              title: "Step " + direction,
              action: "I step " + direction,
              body: "I step " + direction +
                " to clear the cable and regain my balance.",
              intentHints: [
                "to clear the cable and regain my balance.",
                "to open space for a careful retreat.",
                "to keep the opponent away from my footing.",
              ],
              affordanceIds: ["cable", "injected", "cable"],
            })),
          }],
        ),
      );
      return Promise.resolve(
        Response.json({
          choices: [{ message: { content: JSON.stringify(content) } }],
        }),
      );
    }
    if (url.endsWith("/moderations")) {
      const texts = JSON.parse(String(init?.body)).input as string[];
      return Promise.resolve(
        Response.json({
          results: texts.map(() => moderationResult()),
        }),
      );
    }
    if (url.endsWith("/rpc/finish_suggestion_operation")) {
      const args = JSON.parse(String(init?.body));
      finalMoves.push(args.p_operation_id);
      assertEquals(args.p_suggestions[0].affordanceIds, ["cable"]);
      return Promise.resolve(
        Response.json({
          status: "ready",
          suggestions: args.p_suggestions,
          is_paid: false,
          credits_spent: 0,
        }),
      );
    }
    throw new Error("Unexpected test request: " + url);
  }) as typeof fetch;
  const request = (extra: Record<string, unknown> = {}) =>
    new Request("https://example.test/generate-move-suggestions", {
      method: "POST",
      headers: { Authorization: "Bearer test-session" },
      body: JSON.stringify({
        battle_id: "battle",
        move_type: "attack",
        ...extra,
      }),
    });
  try {
    await t.step(
      "eligible anonymous account gets pending free operation without leaked lease",
      async () => {
        const response = await invoke(request());
        assertEquals(response.status, 202);
        const body = await response.json();
        assertEquals(body.data.status, "pending");
        assertEquals(body.data.lease_token, undefined);
        assertEquals(body.data.credits_spent, 0);
      },
    );
    await t.step(
      "batch ensure returns separate private results and rejects paid batches before reserve",
      async () => {
        const before = calls;
        const response = await invoke(
          request({
            move_type: undefined,
            move_types: ["attack", "defense", "finisher"],
            source: "prefetch",
          }),
        );
        assertEquals(response.status, 202);
        const data = (await response.json()).data;
        assertEquals(
          data.results.map((r: Record<string, unknown>) => r.move_type),
          ["attack", "defense", "finisher"],
        );
        assertEquals(
          data.results.every((r: Record<string, unknown>) =>
            r.lease_token === undefined && r.credits_spent === 0
          ),
          true,
        );
        assertEquals(calls - before, 3);
        assertEquals(
          (await invoke(
            request({
              move_type: undefined,
              move_types: ["attack"],
              operation: "reroll",
              client_contract_version: 3,
              idempotency_key: "purchase1",
              expected_credits: 1,
            }),
          )).status,
          400,
        );
        assertEquals(calls - before, 3);
      },
    );
    await t.step(
      "batch groups only fresh claims in one provider call and preserves pending type",
      async () => {
        grouped = true;
        const response = await invoke(
          request({
            move_type: undefined,
            move_types: ["attack", "defense", "finisher"],
          }),
        );
        grouped = false;
        assertEquals(response.status, 202);
        const results = (await response.json()).data.results;
        assertEquals(results.map((r: Record<string, unknown>) => r.status), [
          "pending",
          "ready",
          "ready",
        ]);
        assertEquals(generationCalls, 1);
        assertEquals(finalMoves, ["op-defense", "op-finisher"]);
      },
    );
    await t.step(
      "stale displayed price retains precise error and current price",
      async () => {
        reserve = { error: "price_changed", current_credits: 3 };
        const response = await invoke(
          request({
            operation: "reroll",
            idempotency_key: "purchase-1",
            expected_credits: 1,
            client_contract_version: 3,
          }),
        );
        assertEquals(response.status, 409);
        const body = await response.json();
        assertEquals(body.error.code, "price_changed");
        assertEquals(body.error.current_credits, 3);
      },
    );
    await t.step(
      "reroll without confirmation never reaches reservation",
      async () => {
        const before = calls;
        assertEquals(
          (await invoke(
            request({ operation: "reroll", client_contract_version: 3 }),
          )).status,
          400,
        );
        assertEquals(calls, before);
      },
    );
    await t.step("old clients cannot reserve paid rerolls", async () => {
      for (const version of [undefined, 2, "3", 2.9]) {
        const before = calls;
        const response = await invoke(
          request({
            operation: "reroll",
            idempotency_key: "purchase-2",
            expected_credits: 1,
            client_contract_version: version,
          }),
        );
        assertEquals(response.status, 426);
        assertEquals(
          (await response.json()).error.code,
          "client_update_required",
        );
        assertEquals(calls, before);
      }
    });
    await t.step(
      "outsider never reaches service role reservation",
      async () => {
        participant = false;
        const before = calls;
        assertEquals((await invoke(request())).status, 403);
        assertEquals(calls, before);
        participant = true;
      },
    );
    await t.step(
      "terminal refunded operation remains a recoverable failed result",
      async () => {
        reserve = {
          status: "failed",
          operation_id: "op",
          is_paid: true,
          credits_spent: 1,
          error: "moderation_rejected",
          refunded: true,
        };
        const response = await invoke(
          request({
            operation: "reroll",
            idempotency_key: "purchase-1",
            expected_credits: 1,
            client_contract_version: 3,
          }),
        );
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.data.status, "failed");
        assertEquals(body.data.refunded, true);
      },
    );
  } finally {
    globalThis.fetch = savedFetch;
    for (const [k, v] of Object.entries(saved)) {
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  }
});
