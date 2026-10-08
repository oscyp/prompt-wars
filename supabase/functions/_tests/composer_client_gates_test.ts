import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

type Handler = (request: Request) => Promise<Response>;
async function capture(path: string): Promise<Handler> {
  let handler: Handler | undefined;
  const serve = Deno.serve;
  try {
    Deno.serve = ((value: Handler) => {
      handler = value;
    }) as unknown as typeof Deno.serve;
    await import(path);
  } finally {
    Deno.serve = serve;
  }
  assert(handler);
  return handler;
}

const player = "00000000-0000-4000-8000-000000000001";
const character = "00000000-0000-4000-8000-000000000002";
const battleId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const originalFetch = globalThis.fetch;
function environment() {
  const values = {
    SUPABASE_URL: "https://composer.test",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_PUBLISHABLE_KEYS: "",
    SUPABASE_SECRET_KEYS: "",
    COMBAT_V2_ENABLED: "false",

    JUDGE_PROVIDER: "mock",
    JUDGE_MODEL_ID: "",
    JUDGE_API_KEY: "",
    XAI_API_KEY: "",
    SUGGESTION_PREFETCH_ENABLED: "false",
  };
  const saved = Object.fromEntries(
    Object.keys(values).map((k) => [k, Deno.env.get(k)]),
  );
  for (const [k, v] of Object.entries(values)) Deno.env.set(k, v);
  return () => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(saved)) {
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  };
}
function request(body: Record<string, unknown>) {
  return new Request("https://composer.test/function", {
    method: "POST",
    headers: { Authorization: "Bearer session" },
    body: JSON.stringify(body),
  });
}
function common(url: string): Response | undefined {
  if (url.endsWith("/auth/v1/user")) {
    return Response.json({
      id: player,
      is_anonymous: true,
      aud: "authenticated",
      role: "authenticated",
    });
  }
  if (url.endsWith("/rpc/get_account_eligibility")) {
    return Response.json({ can_play: true });
  }
}

Deno.test("submission gates the actual experience before moderation and preserves legacy submissions", async (t) => {
  const invoke = await capture("../submit-prompt/index.ts");
  const restore = environment();
  let experience: number | null = 2;
  let format = "bo3";
  let participant = true;
  const writes: string[] = [];
  const accepted: Record<string, unknown>[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const auth = common(url);
    if (auth) return Promise.resolve(auth);
    if (url.includes("/rest/v1/battles?")) {
      return Promise.resolve(Response.json({
        id: battleId,
        status: "resolving",
        format,
        current_round: 1,
        prompt_experience_version: experience,
        player_one_id: participant ? player : "other",
        player_two_id: null,
        is_player_two_bot: true,
      }));
    }
    if (url.includes("/rest/v1/battle_rounds?")) {
      return Promise.resolve(
        Response.json({ id: "round", status: "waiting_for_prompts" }),
      );
    }
    writes.push(url);
    if (url.endsWith("/rpc/check_rate_limit")) {
      return Promise.resolve(Response.json({ allowed: true }));
    }
    if (url.endsWith("/rpc/lock_prompt_with_origin")) {
      accepted.push(JSON.parse(String(init?.body)));
      return Promise.resolve(Response.json("prompt-id"));
    }
    if (url.endsWith("/rpc/lock_round_side")) {
      return Promise.resolve(
        Response.json({ both_locked: true, should_resolve: false }),
      );
    }
    if (url.endsWith("/functions/v1/resolve-battle")) {
      return Promise.resolve(Response.json({ success: true }));
    }
    throw new Error("Unexpected submission request: " + url);
  }) as typeof fetch;
  const base = {
    battle_id: battleId,
    move_type: "attack",
    prompt_template_id: "template",
  };
  try {
    for (const version of [undefined, 2, "3", 2.9, null]) {
      await t.step(
        "v2 rejects unsupported contract " + String(version) +
          " before any write or moderation",
        async () => {
          const before = writes.length;
          const response = await invoke(
            request({
              ...base,
              prompt_template_id: undefined,
              custom_prompt_text: "I sidestep and strike to change the angle.",
              client_contract_version: version,
            }),
          );
          assertEquals(response.status, 426);
          const body = await response.json();
          assertEquals(body.code, "client_update_required");
          assertEquals(body.minimum_client_contract_version, 3);
          assertEquals(writes.length, before);
        },
      );
    }
    await t.step("compatible eligible guest locks a v2 prompt", async () => {
      const response = await invoke(
        request({ ...base, client_contract_version: 3 }),
      );
      assertEquals(response.status, 200);
      assertEquals((await response.json()).prompt_id, "prompt-id");
      assertEquals(accepted.at(-1)?.p_authoring_origin, "unknown");
    });
    await t.step(
      "declared origin reaches only the atomic prompt write; invalid origin makes no write",
      async () => {
        const response = await invoke(
          request({
            ...base,
            client_contract_version: 3,
            authoring_origin: "mixed",
          }),
        );
        assertEquals(response.status, 200);
        assertEquals(accepted.at(-1)?.p_authoring_origin, "mixed");
        const before = writes.length;
        assertEquals(
          (await invoke(
            request({
              ...base,
              client_contract_version: 3,
              authoring_origin: "paid",
            }),
          )).status,
          400,
        );
        assertEquals(writes.length, before);
      },
    );
    for (const legacyFormat of ["single", "bo3"]) {
      await t.step(
        "legacy " + legacyFormat + " accepts missing contract",
        async () => {
          experience = null;
          format = legacyFormat;
          const response = await invoke(request(base));
          assertEquals(response.status, 200);
          assertEquals((await response.json()).prompt_id, "prompt-id");
        },
      );
    }
    await t.step("outsider cannot trigger submission work", async () => {
      participant = false;
      experience = 2;
      const before = writes.length;
      assertEquals(
        (await invoke(request({ ...base, client_contract_version: 3 }))).status,
        403,
      );
      assertEquals(writes.length, before);
    });
  } finally {
    restore();
  }
});

Deno.test("matchmaking protects stored replays and propagates SQL upgrade races", async (t) => {
  const invoke = await capture("../matchmaking/index.ts");
  const restore = environment();
  let storedExperience = 2;
  let path:
    | "resume"
    | "request"
    | "invite"
    | "bot-race"
    | "invite-race"
    | "new"
    | "queue" = "resume";
  let storedMode = "unranked";
  let calibrations = 0;
  let rateChecks = 0;
  const queueMappings: Record<string, unknown>[] = [];
  let faceOffReads = 0;
  let faceOffWrites = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const auth = common(url);
    if (auth) return Promise.resolve(auth);
    if (url.includes("/rest/v1/characters?")) {
      const query = new URL(url).searchParams;
      return Promise.resolve(
        Response.json(
          query.get("id")?.startsWith("in.")
            ? [{
              id: character,
              stat_strength: 5,
              stat_stamina: 5,
              stat_agility: 5,
              stat_focus: 5,
            }]
            : { id: character, profile_id: player },
        ),
      );
    }
    if (url.includes("/rest/v1/character_portraits?")) {
      return Promise.resolve(Response.json([]));
    }
    if (url.endsWith("/rpc/start_battle_face_off")) {
      faceOffWrites++;
      return Promise.resolve(Response.json(true));
    }
    if (url.includes("/rest/v1/matchmaking_requests?")) {
      return Promise.resolve(
        Response.json(path === "request" ? { battle_id: battleId } : null),
      );
    }
    if (url.includes("/rest/v1/battles?")) {
      const query = new URL(url).searchParams;
      if (path === "new" && query.has("status")) {
        return Promise.resolve(
          Response.json(
            query.get("player_one_id") === "neq." + player ? [] : null,
          ),
        );
      }
      if (query.get("select") === "id") {
        return Promise.resolve(
          new Response(null, { headers: { "content-range": "0-0/0" } }),
        );
      }
      if (path === "queue") {
        if (query.get("player_one_id") === "neq." + player) {
          return Promise.resolve(Response.json([]));
        }
        assertEquals(query.get("player_one_id"), "eq." + player);
        assertEquals(query.get("player_one_character_id"), "eq." + character);
        assertEquals(query.get("mode"), "eq." + storedMode);
        assertEquals(query.get("status"), "eq.created");
      }
      if (query.get("select")?.includes("face_off_revealed_at")) faceOffReads++;
      return Promise.resolve(Response.json({
        id: battleId,
        status: path === "invite-race" || path === "queue"
          ? "created"
          : "matched",
        created_at: new Date().toISOString(),
        format: path === "invite" ? "bo3" : "single",
        face_off_revealed_at: null,
        mode: path.startsWith("invite") ? "friend_challenge" : storedMode,
        theme: "Precision over power",
        player_one_id: path.startsWith("invite") ? "other" : player,
        player_two_id: path === "invite" ? player : null,
        player_one_character_id: character,
        player_two_character_id: path === "invite" ? character : null,
        prompt_experience_version: storedExperience,
        rules_version: 1,
      }));
    }
    if (url.includes("/rest/v1/judge_calibration_runs?")) {
      calibrations++;
      return Promise.resolve(Response.json(null));
    }
    if (url.includes("/rest/v1/profiles?")) {
      return Promise.resolve(
        Response.json({
          id: player,
          rating: 1000,
          rating_deviation: 100,
          total_battles: 0,
        }),
      );
    }
    if (url.includes("/rest/v1/bot_personas?")) {
      return Promise.resolve(Response.json([{ id: "bot" }]));
    }
    if (url.endsWith("/rpc/check_rate_limit")) {
      rateChecks++;
      return Promise.resolve(Response.json({ allowed: true }));
    }
    if (url.endsWith("/functions/v1/prefetch-move-suggestions")) {
      return Promise.resolve(Response.json({ success: true }));
    }
    if (url.endsWith("/rpc/is_blocked")) {
      return Promise.resolve(Response.json(false));
    }
    if (
      (path === "queue" || path === "new") &&
      url.endsWith("/rpc/create_matchmaking_battle_composer")
    ) {
      queueMappings.push(JSON.parse(String(init?.body)));
      return Promise.resolve(
        Response.json([{
          battle_id: battleId,
          matched: false,
          replayed_request: true,
          theme: null,
        }]),
      );
    }
    if (
      url.endsWith("/rpc/create_matchmaking_battle_composer") ||
      url.endsWith("/rpc/match_battle_request_composer")
    ) {
      return Promise.resolve(
        Response.json({ code: "P0001", message: "client_update_required" }, {
          status: 400,
        }),
      );
    }
    throw new Error("Unexpected matchmaking request: " + url);
  }) as typeof fetch;
  const base = {
    character_id: character,
    mode: "unranked",
    client_contract_version: 2,
  };
  try {
    for (const replay of ["resume", "request", "invite"] as const) {
      await t.step(
        replay + " checks stored v2",
        async () => {
          path = replay;
          const before = faceOffReads;
          const extra = replay === "resume"
            ? { resume_battle_id: battleId }
            : replay === "request"
            ? { request_id: requestId }
            : { mode: "friend_challenge", accept_battle_id: battleId };
          const response = await invoke(request({ ...base, ...extra }));
          assertEquals(response.status, 426);
          assertEquals((await response.json()).code, "client_update_required");
          assertEquals(faceOffReads, before);
        },
      );
    }
    await t.step(
      "compatible accepted invite repairs interrupted face-off",
      async () => {
        path = "invite";
        const before = faceOffReads;
        const writesBefore = faceOffWrites;
        assertEquals(
          (await invoke(
            request({
              ...base,
              mode: "friend_challenge",
              accept_battle_id: battleId,
              client_contract_version: 3,
            }),
          )).status,
          200,
        );
        assertEquals(faceOffReads, before + 1);
        assertEquals(faceOffWrites, writesBefore + 1);
      },
    );
    await t.step("old client can replay legacy match", async () => {
      path = "resume";
      storedExperience = 1;
      assertEquals(
        (await invoke(
          request({
            ...base,
            resume_battle_id: battleId,
            client_contract_version: undefined,
          }),
        )).status,
        200,
      );
    });
    for (const race of ["bot-race", "invite-race"] as const) {
      await t.step(race + " SQL update requirement stays HTTP426", async () => {
        path = race;
        storedExperience = 1;
        const response = await invoke(
          request({
            ...base,
            mode: race === "bot-race" ? "bot" : "friend_challenge",
            client_contract_version: 3,
            ...(race === "invite-race" ? { accept_battle_id: battleId } : {}),
          }),
        );
        assertEquals(response.status, 426);
        assertEquals((await response.json()).code, "client_update_required");
      });
    }
    for (const mode of ["bot", "unranked", "ranked", "friend_challenge"]) {
      await t.step(
        "new " + mode +
          " series defaults to composer v2 without calibration rejection",
        async () => {
          path = "new";
          storedMode = mode;
          const calibrationBefore = calibrations;
          const mappingsBefore = queueMappings.length;
          const response = await invoke(
            request({
              ...base,
              mode,
              request_id: requestId,
              client_contract_version: 3,
            }),
          );
          assertEquals(response.status, 200);
          assertEquals((await response.json()).battle_id, battleId);
          assertEquals(queueMappings.length, mappingsBefore + 1);
          assertEquals(queueMappings.at(-1)!.p_prompt_experience, 2);
          assertEquals(calibrations, calibrationBefore);
        },
      );
    }
    for (const mode of ["bot", "unranked", "ranked", "friend_challenge"]) {
      await t.step(
        "new " + mode + " series requires contract3 before creating a row",
        async () => {
          path = "new";
          storedMode = mode;
          const mappingsBefore = queueMappings.length;
          const response = await invoke(
            request({
              ...base,
              mode,
              request_id: requestId,
              client_contract_version: 2,
            }),
          );
          assertEquals(response.status, 426);
          assertEquals(
            (await response.json()).minimum_client_contract_version,
            3,
          );
          assertEquals(queueMappings.length, mappingsBefore);
        },
      );
    }
    await t.step(
      "ranked replay preserves its frozen v2 policy when calibration becomes unavailable",
      async () => {
        path = "resume";
        storedExperience = 2;
        storedMode = "ranked";
        const before = calibrations;
        assertEquals(
          (await invoke(
            request({
              ...base,
              mode: "ranked",
              resume_battle_id: battleId,
              client_contract_version: 3,
            }),
          )).status,
          200,
        );
        assertEquals(calibrations, before);
      },
    );
    for (const mode of ["unranked", "ranked"]) {
      await t.step(
        "fresh request without resume recovers legacy " + mode +
          " queue before new-series gates",
        async () => {
          path = "queue";
          storedExperience = 1;
          storedMode = mode;
          Deno.env.set("COMBAT_V2_ENABLED", "true");

          const calibrationBefore = calibrations;
          const rateBefore = rateChecks;
          const mappedBefore = queueMappings.length;
          const response = await invoke(
            request({ character_id: character, mode, request_id: requestId }),
          );
          assertEquals(response.status, 200);
          assertEquals((await response.json()).battle_id, battleId);
          assertEquals(calibrations, calibrationBefore);
          assertEquals(rateChecks, rateBefore);
          assertEquals(queueMappings.length, mappedBefore + 1);
          const mapping = queueMappings.at(-1)!;
          assertEquals(mapping.p_request_id, requestId);
          assertEquals(mapping.p_character_id, character);
          assertEquals(mapping.p_mode, mode);
          assertEquals(mapping.p_rules_version, 1);
          assertEquals(mapping.p_prompt_experience, 1);
          assertEquals(mapping.p_client_contract, null);
        },
      );
    }
    await t.step(
      "stored v2 queue still rejects old clients",
      async () => {
        path = "queue";
        storedExperience = 2;
        storedMode = "ranked";
        Deno.env.set("COMBAT_V2_ENABLED", "false");

        const mappedBefore = queueMappings.length;
        const response = await invoke(
          request({ ...base, mode: "ranked", request_id: requestId }),
        );
        assertEquals(response.status, 426);
        assertEquals(
          (await response.json()).minimum_client_contract_version,
          3,
        );
        assertEquals(queueMappings.length, mappedBefore);
      },
    );
    await t.step(
      "compatible fresh request keeps stored v2 queue",
      async () => {
        const calibrationBefore = calibrations;
        const rateBefore = rateChecks;
        const mappedBefore = queueMappings.length;
        const response = await invoke(
          request({
            ...base,
            mode: "ranked",
            request_id: requestId,
            client_contract_version: 3,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await response.json()).battle_id, battleId);
        assertEquals(calibrations, calibrationBefore);
        assertEquals(rateChecks, rateBefore);
        assertEquals(queueMappings.length, mappedBefore + 1);
        assertEquals(queueMappings.at(-1)!.p_prompt_experience, 2);
        assertEquals(queueMappings.at(-1)!.p_request_id, requestId);
      },
    );
  } finally {
    restore();
  }
});
