import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
type Handler = (request: Request) => Promise<Response>;
Deno.test("enriching an exact cached purchase does not replay or reserve its free bank", async () => {
  let handler: Handler | undefined;
  const serve = Deno.serve;
  Deno.serve = ((h: Handler) => {
    handler = h;
  }) as unknown as typeof Deno.serve;
  try {
    await import("../generate-move-suggestions/index.ts");
  } finally {
    Deno.serve = serve;
  }
  assert(handler);
  const environment = {
    SUPABASE_URL: "https://enrichment.test",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_SECRET_KEYS: "",
    SUPABASE_PUBLISHABLE_KEYS: "",
  };
  const saved = Object.fromEntries(
    Object.keys(environment).map((key) => [key, Deno.env.get(key)]),
  );
  Object.entries(environment).forEach(([key, value]) =>
    Deno.env.set(key, value)
  );
  const oldFetch = globalThis.fetch;
  const suggestions = [0, 1, 2].map((i) => ({
    title: `Purchased ${i}`,
    body: `My purchased description ${i} remains unchanged.`,
    id: `a${i}`,
    structureVersion: 2,
    action: `I move toward support ${i}`,
    intentHints: [0, 1, 2].map((j) => ({
      id: `i${i}${j}`,
      text: `to clear route number ${j}`,
    })),
  }));
  let forbiddenReserve = 0;
  globalThis.fetch =
    ((urlValue: string | URL | Request, init?: RequestInit) => {
      const url = urlValue instanceof Request ? urlValue.url : String(urlValue);
      const reply = (data: unknown) => Promise.resolve(Response.json(data));
      if (url.endsWith("/auth/v1/user")) {
        return reply({ id: "player", role: "authenticated" });
      }
      if (url.endsWith("/rpc/get_account_eligibility")) {
        return reply({ can_generate: true, can_play: true });
      }
      if (url.includes("/rest/v1/battles?")) {
        return reply({
          id: "battle",
          player_one_id: "player",
          player_two_id: "opponent",
          prompt_experience_version: 2,
          current_round: 1,
        });
      }
      if (url.includes("/rest/v1/move_prompt_suggestions?")) {
        const query = new URL(url).searchParams;
        assertEquals(query.get("id"), "eq.purchased-set");
        assertEquals(query.get("profile_id"), "eq.player");
        assertEquals(query.get("battle_id"), "eq.battle");
        assertEquals(query.get("round_number"), "eq.1");
        assertEquals(query.get("move_type"), "eq.attack");
        return reply({
          id: "purchased-set",
          operation_id: "purchase",
          suggestions,
          moderation_status: "approved",
          is_paid: true,
          credits_spent: 2,
        });
      }
      if (url.endsWith("/rpc/reserve_suggestion_operation")) {
        forbiddenReserve++;
        return reply({ status: "ready", id: "wrong-free-bank", suggestions });
      }
      if (url.endsWith("/rpc/reserve_suggestion_completion")) {
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_suggestion_id, "purchased-set");
        assertEquals(args.p_target, "upgrade_v3");
        return reply({
          status: "pending",
          lease_token: "private",
          operation_id: "upgrade",
        });
      }
      throw Error(`unexpected ${url}`);
    }) as typeof fetch;
  try {
    const response = await handler(
      new Request("https://test/generate-move-suggestions", {
        method: "POST",
        headers: { Authorization: "Bearer session" },
        body: JSON.stringify({
          battle_id: "battle",
          move_type: "attack",
          operation: "ensure_free",
          composition_version: 3,
          suggestion_set_id: "purchased-set",
        }),
      }),
    );
    assertEquals(response.status, 200);
    const result = (await response.json()).data;
    assertEquals(result.status, "ready");
    assertEquals(result.id, "purchased-set");
    assertEquals(result.credits_spent, 2);
    assertEquals(result.is_paid, true);
    assertEquals(result.suggestions, suggestions);
    assertEquals(result.composition_status, "pending");
    assertEquals(result.lease_token, undefined);
    assertEquals(forbiddenReserve, 0);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(saved)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
