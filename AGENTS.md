# AGENTS.md

Instructions for AI coding agents (Codex and compatible tools) working in this repository. Claude Code additionally reads `CLAUDE.md` and the subagents in `.claude/agents/`; VS Code agent workflows use `.github/agents/`. All three encode the same rules.

## What this is

Prompt Wars is a mobile-first competitive AI prompt-battle game: an **Expo / React Native** app (`app/`, `components/`, `hooks/`, …) driven entirely by a **Supabase** backend (`supabase/`). Two players write prompts for a themed 1v1 battle, an LLM-as-judge scores them, and the result is revealed cinematically (free Tier 0) or as a generated video (paid Tier 1).

`docs/prompt-wars-implementation-concept.md` is the single source of truth for product scope, data models, state machines, KPIs, and balance rules. Consult it instead of restating or inventing requirements. The `*_REPORT.md` files are historical logs; the concept doc and the actual schema/code win on conflicts.

## Commands

```bash
yarn start / yarn ios / yarn android     # Expo dev server / simulators
yarn test                                # Jest (jest-expo) for the RN app
yarn test -- path/to/file.test.ts        # single Jest file
yarn lint / yarn format                  # ESLint (expo flat config) / Prettier

supabase start                           # local stack (needs Docker)
supabase db reset                        # re-apply all migrations + seed
yarn supabase:new-migration <name>       # new timestamped migration
supabase functions serve                 # serve Edge Functions locally

# Edge Function tests use Deno, NOT Jest:
deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/<file>.ts
```

Two independent test systems: Jest for app code, Deno for Edge Functions in `supabase/functions/_tests/`. Never mix runners. Remote integration tests are gated on `PROMPT_WARS_REMOTE_FUNCTION_TESTS=1`.

## Hard invariants (all roles)

- **Thin client**: the app only reads its own rows (RLS), subscribes to Realtime, and invokes Edge Functions. Battle results, judge scores, wallet balance, video-job status, and entitlements are written only by service-role Edge Functions, usually via atomic Postgres functions (`supabase.rpc`). Never add a client-side write for server-owned state.
- **Tier 0 reveal always closes the battle.** Video generation (Tier 1) is an async `video_jobs` queue; its success or failure must never block battle completion. Provider failures degrade gracefully (mock judge, Tier 0 only, credit refunds).
- **No pay-to-win.** Archetypes are free; payment buys video reveals, cosmetics, and convenience only. Rating, streaks, and paid items never feed judge scoring.
- **`entitlements` is a derived VIEW** — the single source of truth for feature gates; never write to it or gate on raw purchase rows.
- **No secrets in the app.** Only `EXPO_PUBLIC_*` env vars are bundled; provider keys, service key, and webhook secrets live in Supabase Edge Function secrets (`supabase/ENV_VARS.md`).
- **Moderation before reveal.** UGC-derived video stays blurred until post-gen moderation passes; never skip pre-gen prompt moderation or post-gen video moderation.
- **Both battle formats** (`single` and `bo3`) must keep working; newer Bo3 columns are nullable on legacy rows.
- Client function calls go through `invokeAuthenticatedFunction` in `utils/supabase.ts`; Edge Functions use the helpers in `supabase/functions/_shared/utils.ts` (never read Supabase key env vars directly). AI providers stay behind the adapter interfaces in `_shared/providers.ts` with Mock as the default.
- Migrations are timestamped, idempotent where possible; seed data ships as an idempotent migration, not `seed.sql`. `react-native-worklets/plugin` must stay last in `babel.config.js`.

## Role playbooks

Adopt the role(s) matching the task. For multi-domain tasks, work through the relevant roles in dependency order (design → backend → mobile/video/monetization → safety review → QA) and flag conflicts with the concept doc.

### Game design
Owns the core loop, structured prompt model, judging rubric, ranking (Glicko-2), matchmaking, bots, progression, and player flows. Mechanics must be explainable and auditable; randomness bounded and server-seeded; competitive systems separated from cosmetic/expressive ones. Never design paid ranked advantages or paid archetypes.

### Mobile (Expo / React Native)
Owns screens, Expo Router route groups, navigation, state, accessibility (dynamic type, voice-over, captions, color-blind-safe icons), deep links, and push handling (must-send result-ready, hard daily cap). Model live screens on `hooks/useRealtimeBattle.ts`. Show credit cost before any paid commit; never block the result screen on Tier 1 video.

### Backend (Supabase)
Owns schema, RLS, migrations, Edge Functions, the server-owned battle state machine (timeouts, matchmaking bands, newbie bucket, same-network guard, bot fallback), Realtime channels, and Storage (signed URLs; copy media out of provider URLs). Protect invariants with database constraints; add idempotency keys for retries and webhooks; verify RLS with positive and negative cases. Function chaining follows the `EdgeRuntime.waitUntil` + fetch pattern in `submit-prompt/index.ts`.

### AI video / judge
Owns provider adapters (`AiJudgeProvider`, `AiVideoProvider`, `AiImageProvider`, `TtsProvider`), judge invocation (blind, length-normalized, double-run with tie-break, frozen prompt version, JSON-schema-validated output, calibration-gated promotion), paid-video prompt composition, and the job state machine (`queued → submitted → processing → succeeded | failed`) with retries, hard timeout, and credit refunds. Provider output never overrides server-resolved outcomes.

### Monetization
Owns the credit economy (ledger with grants/spends/refunds/idempotency, not a bare balance), credit packs (gate only the paid video upgrade), the `Prompt Wars+` subscription, F2P credit spine, FTUO (gated by the signup anti-abuse signal), and RevenueCat integration with server-side validation and webhook double-write. Automatic refunds for moderation or provider failures are mandatory.

### Safety
Owns moderation policy (categories, thresholds, hard block / soft warn / quarantine), anti-collusion (rate limits, shadow rating, quality floor, opponent diversity, win-trade signals), account-farm guard at signup, the 18+ age gate, and report/block/takedown/appeal flows. Specifies policy; backend implements the plumbing. Every block, quarantine, and refund must be auditable.

### QA
Owns acceptance criteria, test plans, and release risk. Cover state machines with table-driven cases; include negative RLS tests; never rely on happy paths alone. Risky states to always check: prompt timeouts, judge tie-breaks, post-gen moderation rejection, video timeout with refund, duplicate RevenueCat webhooks, restored purchases, account-farm guard, cross-locale judging. Do not reset databases or run destructive commands without explicit permission.
