import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
type Handler = (request: Request) => Promise<Response>;
Deno.test("v2 service prefetch skips before reservation or provider work", async () => {
  let handler: Handler | undefined;
  const serve = Deno.serve;
  const fetch = globalThis.fetch;
  const values = {
    SUPABASE_URL: "https://prefetch.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SUPABASE_SECRET_KEYS: "",
    SUGGESTIONS_PREFETCH_ENABLED: "1",
  };
  const saved = Object.fromEntries(
    Object.keys(values).map((k) => [k, Deno.env.get(k)]),
  );
  try {
    for (const [k, v] of Object.entries(values)) Deno.env.set(k, v);
    Deno.serve = ((h: Handler) => {
      handler = h;
    }) as typeof Deno.serve;
    await import("../prefetch-move-suggestions/index.ts");
    assert(handler);
    let calls = 0;
    globalThis.fetch = ((input) => {
      calls++;
      assert(String(input).includes("/rest/v1/battles?"));
      return Promise.resolve(
        Response.json({ id: "battle", prompt_experience_version: 2 }),
      );
    }) as typeof fetch;
    const response = await handler(
      new Request("https://prefetch.test", {
        method: "POST",
        headers: { apikey: "test-service-key" },
        body: JSON.stringify({ battle_id: "battle" }),
      }),
    );
    assertEquals(response.status, 200);
    assertEquals((await response.json()).skipped, "build_entry_required");
    assertEquals(calls, 1);
  } finally {
    Deno.serve = serve;
    globalThis.fetch = fetch;
    for (const [k, v] of Object.entries(saved)) {
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  }
});
