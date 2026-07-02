# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Prompt Wars is a mobile-first competitive AI prompt-battle game: an **Expo / React Native** app (`app/`, `components/`, `hooks/`, …) driven entirely by a **Supabase** backend (`supabase/`). Two players write prompts for a themed 1v1 battle, an LLM-as-judge scores them, and the result is revealed cinematically (free Tier 0) or as a generated video (paid Tier 1).

## Commands

```bash
yarn start              # Expo dev server
yarn ios / yarn android # run on simulator/device (prebuild-enabled, custom dev client)
yarn test               # Jest (jest-expo) for the RN app
yarn test -- path/to/file.test.ts        # single Jest file
yarn test -- -t "name"                   # single Jest test by name
yarn test:watch
yarn lint                # expo lint (ESLint 9 flat config, extends "expo")
yarn format              # prettier --write .
```

Backend (run from repo root unless noted):

```bash
supabase start                    # local stack (Postgres, Realtime, Storage, Studio, Edge Functions) — needs Docker
supabase db reset                 # drop + re-apply all migrations + seed content
yarn supabase:new-migration name  # new timestamped migration file
yarn supabase:migrate             # supabase db push (to linked remote)
supabase functions serve          # serve Edge Functions locally (auto-reload)
supabase functions deploy <name>  # deploy one function (or omit name for all)

# Edge Function unit tests (Deno, not Jest):
deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/<file>.ts

# Remote integration tests (hit a real linked Supabase project; skipped unless flag set):
yarn test:supabase:remote
```

There are **two independent test systems**: Jest (`jest-expo` preset) for app code, and **Deno** for Edge Functions in `supabase/functions/_tests/`. Don't try to run one with the other's runner. Remote tests are gated on `PROMPT_WARS_REMOTE_FUNCTION_TESTS=1` and self-skip via `skipUnlessRemoteEnabled()` when unset.

## Architecture

### Client / server split (the core invariant)

The mobile app is deliberately "thin". It may only:
- **Read** its own rows (profiles, characters, battles, prompts, wallet) and public data, enforced by RLS.
- **Subscribe** to Realtime for live updates.
- **Invoke Edge Functions** for every state change.

The client **cannot** write server-owned state — battle results, judge scores, wallet balance, video-job status, entitlements. All of that flows through Edge Functions running as service-role. When adding a feature that changes game/economy state, the write belongs in an Edge Function + a Postgres function, never a direct client `update`.

### Edge Functions (`supabase/functions/`, Deno)

Each function is a folder with `index.ts` calling `Deno.serve`. Shared code lives in `_shared/`:
- `utils.ts` — `createServiceClient()` (service role, full power), `createUserClient(authHeader)` (runs under the caller's JWT + RLS), `getAuthUserId(req)` (validates the bearer token and returns the user id), plus `corsHeaders`, `errorResponse`, `successResponse`. Supabase keys are read from **JSON dictionaries** in env (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`) with legacy single-key fallbacks — use these helpers, don't read the env vars directly.
- `judge.ts` / `providers.ts` — the AI provider layer (see below).
- `moderation.ts`, `push.ts`, `entitlement-gate.ts`, `compose-reveal-payload.ts`, `glicko2.ts`, etc.

Three call patterns (see `supabase/functions/README.md` for the full list):
- **User-initiated** (`matchmaking`, `submit-prompt`, `appeal-battle`, …): require `Authorization: Bearer <jwt>`, validate via `getAuthUserId`.
- **Service-role** (`resolve-battle`, `round-resolve`, `process-video-job`, `expire-battles`, …): invoked internally, not by clients.
- **Webhooks** (`revenuecat-webhook`): JWT verification is disabled in `config.toml` (`[functions.revenuecat-webhook] verify_jwt = false`) because RevenueCat sends its own auth header, validated in-function.

**Function chaining:** functions trigger the next stage by `fetch`-ing another function's URL with the service key, wrapped in `EdgeRuntime.waitUntil()` when available and `await`ed as a fallback for local/test runtimes (see `triggerBattleResolution` / `invokeFn` in `submit-prompt/index.ts`). Follow this pattern rather than inventing a new one.

### Postgres functions = server-owned state transitions

Atomic state changes are Postgres functions (`create_battle`, `lock_prompt`, `resolve_battle`, `grant_credits`, appeals, streaks, …) defined in migrations and called from Edge Functions via `supabase.rpc(...)`. Prefer extending/adding a DB function for anything that must be atomic or is security-sensitive, then call it from the Edge Function.

### AI provider layer (adapter + factory)

All external AI is behind interfaces in `_shared/providers.ts`: `AiJudgeProvider`, `AiVideoProvider`, `AiImageProvider`, `TtsProvider`. A **Mock implementation is the default** (deterministic, always available); production providers (e.g. `XAIVideoProvider`) swap in via env (`JUDGE_PROVIDER`, `VIDEO_PROVIDER`, `XAI_API_KEY`, …). Judge responses **must pass JSON-schema validation** and use a frozen prompt version. Provider failures degrade gracefully (mock judge, Tier 0 only, credit refunds) — never block battle completion on an external call.

### Reveal tiers

- **Tier 0** — free, deterministic, always succeeds, never blocks. Composed server-side into `battles.tier0_reveal_payload` and rendered by the client.
- **Tier 1** — paid/subscriber, async video via `video_jobs` queue processed by `process-video-job`; client watches job status over Realtime.

### Battle formats

Two formats coexist: `single` and `bo3` (best-of-3 rounds with HP, `battle_rounds` rows). Newer Bo3 columns are nullable on legacy rows; `hooks/useRealtimeBattle.ts` and functions default them to safe values for backward compatibility. When touching battle logic, handle **both** formats.

### Client app (`app/`, Expo Router)

- File-based routing with route groups: `(auth)`, `(onboarding)`, `(tabs)`, `(battle)`, `(profile)`. `app/_layout.tsx` wraps everything in `AuthProvider` → `RevenueCatProvider` and does the auth/onboarding gate (no session → sign-in; session but no active character → onboarding).
- **Realtime:** `useRealtimeBattle(battleId)` subscribes to `battles`, `battle_prompts`, `battle_rounds`, and `video_jobs` filtered by battle id, and does an initial fetch + refetch on (re)subscribe. This is the model for live battle screens.
- **Invoking functions:** use `invokeAuthenticatedFunction(name, body)` from `utils/supabase.ts` (handles token refresh + a 401 retry), not `supabase.functions.invoke` directly.
- Ratings use **Glicko-2**. Entitlements/gating on the client come through `RevenueCatProvider`.

## Conventions & gotchas

- **Path alias:** `@/*` → repo root (e.g. `@/utils/supabase`, `@/providers/AuthProvider`).
- **Env vars:** only `EXPO_PUBLIC_*` are bundled into the app; everything else (provider keys, service key, webhook secret) lives in Supabase Edge Function secrets. See `.env.example` and `supabase/ENV_VARS.md`. Never add secrets to the mobile `.env`.
- **`entitlements` is a derived VIEW, never a table** — it's the source of truth for feature gates; don't try to write to it.
- **Seeding:** starter content is seeded by an *idempotent migration* (`20260512195500_seed_starter_content.sql`), not `seed.sql`. `db.seed` is disabled in `config.toml` on purpose (re-running `seed.sql` caused duplicate-key errors). Add seed data as an idempotent migration.
- **Migrations** are timestamped `YYYYMMDDHHMMSS_name.sql`, ordered by prefix, `timestamptz` everywhere, JSONB for flexible payloads. Write them idempotent where possible.
- **Reanimated:** `react-native-worklets/plugin` must be **last** in `babel.config.js` or animations silently no-op. SVGs are imported as components via `react-native-svg-transformer` (configured in `metro.config.js`).
- **Docs:** `docs/prompt-wars-implementation-concept.md` is the authoritative design doc (data models, state machines, RLS). The many `*_REPORT.md` files at the repo root and in `docs/` are historical implementation logs — informative, but the concept doc and the actual schema/code win on conflicts.
