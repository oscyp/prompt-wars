import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test(
  'composer calibration rejects a weakened threshold before any provider or database request',
  async () => {
    const settings = {
      SUPABASE_URL: 'https://calibration.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
      SUPABASE_SECRET_KEYS: '',
      JUDGE_MODEL_ID: 'configured-fixture-model',
      JUDGE_API_KEY: 'fixture-only',
    };
    const saved = Object.fromEntries(
      Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
    );
    const serve = Deno.serve;
    const fetch = globalThis.fetch;
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let networkCalls = 0;
    try {
      for (const [key, value] of Object.entries(settings))
        Deno.env.set(key, value);
      Deno.serve = ((callback: typeof handler) => {
        handler = callback;
      }) as unknown as typeof Deno.serve;
      globalThis.fetch = (() => {
        networkCalls++;
        return Promise.reject(
          new Error('No network permitted in threshold test'),
        );
      }) as typeof globalThis.fetch;
      await import('../run-judge-calibration/index.ts');
      assert(handler);
      const response = await handler(
        new Request('https://calibration.test/function', {
          method: 'POST',
          headers: { Authorization: 'Bearer service-fixture' },
          body: JSON.stringify({
            judge_policy_version: 'v2.0.0-ideas',
            threshold: 0.8,
            max_provider_calls: 1,
          }),
        }),
      );
      assertEquals(response.status, 400);
      assertEquals(
        (await response.json()).error,
        'Composer threshold must be at least 0.9',
      );
      assertEquals(networkCalls, 0);
    } finally {
      Deno.serve = serve;
      globalThis.fetch = fetch;
      for (const [key, value] of Object.entries(saved)) {
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
      }
    }
  },
);
