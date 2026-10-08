import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { moderationResult } from "./fixtures/moderation.ts";
type Handler = (request: Request) => Promise<Response>;
Deno.test("completion endpoint binds identity and context, protects leases and replays ready operations", async () => {
  const serve = Deno.serve;
  let handler: Handler | undefined;
  Deno.serve = ((h: Handler) => {
    handler = h;
  }) as unknown as typeof Deno.serve;
  try {
    await import("../complete-move-suggestion/index.ts");
  } finally {
    Deno.serve = serve;
  }
  assert(handler);
  const environment = {
    SUPABASE_URL: "https://completion.test",
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
  let participant = true, generations = 0, cached = false;
  const result = {
    approachHints: [
      "by staying beside the support",
      "by waiting for the next flash",
      "by keeping my footing steady",
    ].map((text, i) => ({ id: `approach-${i}`, text })),
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
      if (url.endsWith("/rpc/reserve_suggestion_completion")) {
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_profile_id, "player");
        assertEquals(args.p_action_text, "I step beside the support");
        assertEquals(args.p_target, "approach");
        return reply({
          status: cached ? "ready" : "claimed",
          operation_id: "op",
          lease_token: "private",
          context_key: "server-context",
          result: cached ? result : null,
          remaining_adaptations: 5,
        });
      }
      if (url.endsWith("/rpc/renew_suggestion_completion")) return reply(true);
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
        const body = JSON.parse(String(init?.body));
        const context = JSON.parse(body.messages[1].content);
        assertEquals(context.theme, "Server theme");
        assertEquals(
          context.situation,
          "The server's platform has a hanging cable.",
        );
        return reply({
          choices: [{
            message: {
              content: JSON.stringify({
                approachHints: result.approachHints.map((h) => h.text),
              }),
            },
          }],
        });
      }
      if (url.endsWith("/moderations")) {
        return reply({
          results: JSON.parse(String(init?.body)).input.map(() =>
            moderationResult()
          ),
        });
      }
      if (url.endsWith("/rpc/finish_suggestion_completion")) {
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_failure, null);
        return reply({
          status: "ready",
          operation_id: "op",
          context_key: "server-context",
          result: args.p_result,
          remaining_adaptations: 5,
        });
      }
      throw Error(`unexpected ${url}`);
    }) as typeof fetch;
  const request = () =>
    new Request("https://test/complete-move-suggestion", {
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
        theme: "Forged theme",
        profile_id: "opponent",
      }),
    });
  try {
    const response = await handler(request());
    assertEquals(response.status, 200);
    const body = (await response.json()).data;
    assertEquals(body.status, "ready");
    assertEquals(body.result.approachHints.length, 3);
    assertEquals(body.lease_token, undefined);
    cached = true;
    const replay = (await (await handler(request())).json()).data;
    assertEquals(replay.result, result);
    assertEquals(replay.lease_token, undefined);
    assertEquals(generations, 1);
    participant = false;
    assertEquals((await handler(request())).status, 403);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(saved)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
