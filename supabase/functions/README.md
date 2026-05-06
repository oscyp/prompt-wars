# Prompt Wars Edge Functions

Server-owned logic for Prompt Wars gameplay, economy, and AI integrations.

## Phase 1+: Core Functions Implemented ✅

- **`matchmaking`** ✅ - Pair players for ranked/unranked battles, rating bands, newbie bucket, bot fallback
- **`submit-prompt`** ✅ - Lock player prompt (template or custom), basic moderation, transition to resolving
- **`resolve-battle`** ✅ - Run judge pipeline (double-run, tiebreaker, JSON schema validation), compute Glicko-2 deltas, update battle state
- **`appeal-battle`** ✅ - Submit appeal for ranked loss (1/day cap), enqueues independent judge run
- **`grant-credits`** ✅ - Daily login streak, quest completion, server-side credit ledger with idempotency
- **`revenuecat-webhook`** ✅ - Mirror RevenueCat purchases/subscriptions, grant credits, update entitlements
- **`expire-battles`** ✅ - Cron job to mark timed-out battles as expired (2h ranked / 8h friend timeout)
- **`generate-tier0-reveal`** ✅ - Generate free cinematic reveal payload (motion poster, music sting, voice line, score card)
- **`process-video-job`** ✅ - Async Tier 1 video generation pipeline: submit, poll, store, refund on failure

### Shared Modules (`_shared/`)

- **`types.ts`** - TypeScript interfaces for battles, prompts, judge results, characters, video jobs
- **`utils.ts`** - Supabase clients (service/user), CORS, auth helpers, response builders
- **`judge.ts`** - LLM-as-judge pipeline: rubric scoring, JSON schema validation, length normalization, move-type matchup, frozen prompt version
- **`glicko2.ts`** - Glicko-2 rating calculation for async play, rating deviation growth
- **`providers.ts`** ✅ - AI provider interfaces and adapters:
  - `AiJudgeProvider` - Judge with strict JSON validation, frozen prompt version, mock/live provider factory
  - `AiImageProvider` - Tier 0 motion poster metadata (deterministic, never blocks battle)
  - `AiVideoProvider` - Tier 1 video generation (xAI / X AI integration, submit/poll/copy)
  - `TtsProvider` - Battle cry voice line metadata (client-side TTS)

### Provider Implementation Status

- **Mock providers** (default, MVP-ready):
  - `MockJudgeProvider` - Deterministic scoring for testing and fallback
  - `MockImageProvider` - Returns deterministic Tier 0 composition metadata
  - `MockVideoProvider` - Stubs video generation lifecycle
  - `MockTtsProvider` - Returns client-side TTS presets
  
- **Production providers**:
  - `XAIVideoProvider` - xAI / X AI video generation (requires `XAI_API_KEY` env var)
  - Other judge/image providers can be added via factory pattern

### Not Yet Implemented (Stubs / Future Phases)

- `moderate-prompt` - External moderation service (minimal blocklist in submit-prompt for MVP)
- `moderate-video` - Post-gen video safety checks
**Provider API Keys** (set as Edge Function secrets):
- `JUDGE_PROVIDER` - Judge provider type: `mock` (default) | `openai` | `xai`
- `VIDEO_PROVIDER` - Video provider type: `mock` (default) | `xai`
- `XAI_API_KEY` - xAI / X AI API key (required if VIDEO_PROVIDER=xai)
- `XAI_VIDEO_BASE_URL` - xAI video API base URL (optional, defaults to https://api.x.ai/v1/video)

## Testing

Run Deno tests for shared utilities and providers:

```bash
cd supabase/functions
deno test --allow-all _tests/
```

Tests include:
- `judge_test.ts` - Original judge pipeline tests
- `judge_enhanced_test.ts` ✅ - JSON schema validation, length normalization, move matchup
- `providers_test.ts` ✅ - All provider interfaces (judge, image, video, TTS)
- `glicko2_test.ts` - Glicko-2 rating calculations Utilities
- `send-push-notification` - Dispatch push via Expo push tokens (result ready, opponent submitted)
- `generate-share-card` - Render scored result card image for social sharing

## Security Notes

All Edge Functions requiring provider API access (xAI, moderation services, RevenueCat) must:
- Store keys as Supabase Edge Function secrets, never in code or client-exposed config
- Use service-role JWT for writes to protected tables (battles, video_jobs, wallet_transactions)
- Validate user identity before mutating player-owned resources
- Log sanitized request IDs for support and auditing

RLS policies deny client writes to server-owned columns (battle.winner_id, battle.score_payload, etc.).

## Testing

Run Deno tests for shared utilities:

```bash
cd supabase/functions
deno test --allow-all _tests/
```

## Deployment

Deploy all functions:

```bash
supabase functions deploy
```

Deploy a single function:

### User-initiated functions
Require `Authorization: Bearer <jwt>` header, validate user identity via JWT:
- `matchmaking` - POST `{ mode: 'ranked' | 'unranked', character_id: string }`
- `submit-prompt` - POST `{ battle_id, prompt_template_id?, custom_prompt_text?, move_type }`
- `appeal-battle` - POST `{ battle_id }` (capped 1/day on ranked losses)
- `grant-credits` - POST `{ reason, amount }` (service-owned, called by backend logic)

### Service-role functions
Called by internal cron/queue, not exposed to clients:
- `resolve-battle` - POST `{ battle_id }` - Runs judge pipeline, updates scores and ratings
- `generate-tier0-reveal` - POST `{ battle_id }` - Generates free cinematic reveal payload
- `process-video-job` - POST `{ video_job_id?, batch_size? }` - Processes queued/in-flight video jobs
- `expire-battles` - POST `{}` - Cron job to expire timed-out battles

### Webhooks
Validate webhook signature in production, use idempotency keys for all wallet transactions:
- `revenuecat-webhook` - POST (RevenueCat events)

## Tier 0 vs Tier 1 Reveal Pipeline

**Tier 0** (always free, always succeeds, never blocks battle completion):
1. Battle reaches `result_ready` status
2. `generate-tier0-reveal` creates payload with:
   - Motion poster composition metadata (deterministic, no provider call required)
   - Per-move-type animation preset (3s sting)
   - Music sting ID (archetype + outcome)
   - Battle cry voice line metadata (client-side TTS)
   - Scored result card (rubric breakdown, judge explanation, character portraits)
3. Payload stored in `battles.tier0_reveal_payload`
4. Client renders cinematic reveal immediately

**Tier 1** (paid or sub, one shared video per battle, async):
1. Player requests video upgrade (credits or sub allowance)
2. Server creates `video_jobs` row with status `queued`
3. `process-video-job` picks up job:
   - Composes xAI prompt from battle context
   - Submits to video provider, job -> `submitted`
   - Polls until `processing` -> `succeeded` | `failed`
   - On success: copies video to Supabase Storage, creates `videos` row, marks battle `completed`
   - On failure: retries up to 3 attempts, then refunds credits and marks `generation_failed`
4. Client subscribes to `video_jobs` via Realtime, plays video when ready
5. Push notification fires when video completes (if user left screen)

## Provider Architecture

All AI providers follow the adapter pattern:
- Interface defines contract (e.g., `AiJudgeProvider.judge()`)
- Mock provider is default, deterministic, always available
- Production providers (xAI, OpenAI, etc.) swap in via env var
- Provider failures fall back gracefully: mock judge, Tier 0 reveal only, credit refunds

**Adding a new judge provider**:
1. Implement `AiJudgeProvider` interface
2. Add to `createJudgeProvider()` factory in `providers.ts`
3. Set `JUDGE_PROVIDER=<provider-name>` env var
4. Provider response MUST pass JSON schema validation (see `validateJudgeResponse()`)

**Adding a new video provider**:
1. Implement `AiVideoProvider` interface (submit, poll, getVideoUrl)
2. Add to `createVideoProvider()` factory
3. Set `VIDEO_PROVIDER=<provider-name>` env var and API key secrets
4. Compose prompts from `VideoGenerationRequest` fields (character names, prompts, theme, winner framing)nction-name>
```

User-initiated functions (matchmaking, submit-prompt, appeal-battle, grant-credits):
- Require `Authorization: Bearer <jwt>` header
- Validate user identity via JWT

Service-role functions (resolve-battle, expire-battles):
- Called by internal cron/queue, not exposed to clients

Webhooks (revenuecat-webhook):
- Validate webhook signature in production
- Use idempotency keys for all wallet transactions
Only service-role calls from Edge Functions can transition battle state, resolve judges, or grant credits.

## Development

```bash
# Create a new function
supabase functions new function-name

# Serve functions locally
supabase functions serve

# Deploy to remote
supabase functions deploy function-name
```

See official docs: https://supabase.com/docs/guides/functions
