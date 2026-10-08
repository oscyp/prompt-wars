import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { moderationResult } from "./fixtures/moderation.ts";
type Handler = (request: Request) => Promise<Response>;

Deno.test("paid step endpoint authenticates owners, moderates real context and safely replays purchases", async () => {
  const serve = Deno.serve;
  let handler: Handler | undefined;
  Deno.serve = ((h: Handler) => {
    handler = h;
  }) as unknown as typeof Deno.serve;
  try {
    await import("../reroll-move-step-suggestions/index.ts");
  } finally {
    Deno.serve = serve;
  }
  assert(handler);
  const environment = {
    SUPABASE_URL: "https://step.test",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_SECRET_KEYS: "",
    SUPABASE_PUBLISHABLE_KEYS: "",
    SUGGESTIONS_API_KEY: "provider-test",
    OPENAI_API_KEY: "moderation-test",
    PERSPECTIVE_API_KEY: "",
    SUGGESTIONS_AI_DISABLED: "false",
  };
  const saved = Object.fromEntries(
    Object.keys(environment).map((key) => [key, Deno.env.get(key)]),
  );
  Object.entries(environment).forEach(([key, value]) =>
    Deno.env.set(key, value)
  );
  const oldFetch = globalThis.fetch;
  let participant = true, generations = 0, reservations = 0;
  let reservationStatus = "claimed";
  let failureCode: string | undefined;
  let refused = false;
  const result = {
    approachHints: [
      "by staying beside the support",
      "by waiting for the next flash",
      "by keeping my footing steady",
    ].map((text, i) => ({ id: `a-${i}`, text })),
  };
  globalThis.fetch =
    ((urlValue: string | URL | Request, init?: RequestInit) => {
      const url = urlValue instanceof Request ? urlValue.url : String(urlValue);
      const reply = (data: unknown) => Promise.resolve(Response.json(data));
      if (url.endsWith("/auth/v1/user")) {
        return reply({
          id: "player",
          role: "authenticated",
          is_anonymous: true,
        });
      }
      if (url.endsWith("/rpc/get_account_eligibility")) {
        return reply({ can_generate: true, can_play: true });
      }
      if (url.includes("/rest/v1/battles?")) {
        return reply({
          id: "battle",
          player_one_id: participant ? "player" : "other",
          player_two_id: "opponent",
          player_one_character_id: "fighter",
          prompt_experience_version: 2,
          current_round: 1,
          theme: "Server theme",
        });
      }
      if (url.endsWith("/rpc/reserve_suggestion_step_operation")) {
        reservations++;
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_profile_id, "player");
        assertEquals(args.p_action_text, "I step beside the support");
        assertEquals(args.p_target, "approach");
        assertEquals(args.p_expected_credits, 1);
        assertEquals(args.p_idempotency_key, "purchase-key");
        return reply(
          failureCode ? { error: failureCode, current_credits: 2 } : {
            status: reservationStatus,
            operation_id: "op",
            lease_token: "private",
            context_key: "server-context",
            result: reservationStatus === "ready" ? result : null,
            credits_spent: 1,
            is_paid: true,
            refunded: false,
          },
        );
      }
      if (url.endsWith("/rpc/renew_suggestion_step_operation")) {
        return reply(true);
      }
      if (url.includes("/rest/v1/characters?")) {
        return reply({
          id: "fighter",
          profile_id: "player",
          name: "Ash",
          archetype: "mystic",
        });
      }
      if (url.includes("/rest/v1/battle_rounds?")) {
        return reply({
          situation_snapshot: {
            text: "The server's platform has a hanging cable.",
          },
        });
      }
      if (url.endsWith("/chat/completions")) {
        generations++;
        const context = JSON.parse(
          JSON.parse(String(init?.body)).messages[1].content,
        );
        assertEquals(context.theme, "Server theme");
        assertEquals(
          context.situation,
          "The server's platform has a hanging cable.",
        );
        assertEquals(context.action, "I step beside the support");
        assertEquals(context.intention, "to open a clear route");
        assertEquals(context.variationSeed, "op");
        return reply({
          choices: [{
            message: {
              content: JSON.stringify({
                approachHints: result.approachHints.map((hint) => hint.text),
              }),
            },
          }],
        });
      }
      if (url.endsWith("/moderations")) {
        return reply({
          results: JSON.parse(String(init?.body)).input.map(() =>
            moderationResult(refused ? { violence: 0.99 } : undefined)
          ),
        });
      }
      if (url.endsWith("/rpc/finish_suggestion_step_operation")) {
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_lease_token, "private");
        assertEquals(args.p_failure, refused ? "moderation_rejected" : null);
        return reply({
          status: refused ? "failed" : "ready",
          operation_id: "op",
          context_key: "server-context",
          result: args.p_result,
          credits_spent: 1,
          is_paid: true,
          refunded: refused,
          error: args.p_failure,
          lease_token: "private",
          context_snapshot: { secret: true },
        });
      }
      throw Error(`Unexpected ${url}`);
    }) as typeof fetch;
  const request = (changes: Record<string, unknown> = {}) =>
    new Request("https://test/reroll-move-step-suggestions", {
      method: "POST",
      headers: { Authorization: "Bearer session" },
      body: JSON.stringify({
        battle_id: "battle",
        move_type: "attack",
        target: "approach",
        action_text: "I step beside the support",
        intent_text: "to open a clear route",
        composition_version: 3,
        client_contract_version: 3,
        idempotency_key: "purchase-key",
        expected_credits: 1,
        profile_id: "opponent",
        theme: "forged",
        ...changes,
      }),
    });
  try {
    const response = await handler(request());
    assertEquals(response.status, 200);
    const body = (await response.json()).data;
    assertEquals(body.status, "ready");
    assertEquals(body.result.approachHints.length, 3);
    assertEquals(body.lease_token, undefined);
    assertEquals(body.context_snapshot, undefined);
    assertEquals(body.credits_spent, 1);
    reservationStatus = "ready";
    assertEquals((await (await handler(request())).json()).data.result, result);
    assertEquals(generations, 1);
    reservationStatus = "pending";
    assertEquals((await handler(request())).status, 202);
    assertEquals(generations, 1);
    failureCode = "price_changed";
    assertEquals((await handler(request())).status, 409);
    failureCode = undefined;
    const beforeInvalid = reservations;
    assertEquals(
      (await handler(request({ expected_credits: undefined }))).status,
      400,
    );
    assertEquals(reservations, beforeInvalid);
    participant = false;
    assertEquals((await handler(request())).status, 403);
    assertEquals(reservations, beforeInvalid);
    participant = true;
    reservationStatus = "claimed";
    refused = true;
    const failed = (await (await handler(request())).json()).data;
    assertEquals(failed.status, "failed");
    assertEquals(failed.refunded, true);
    assertEquals(failed.result, null);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(saved)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
