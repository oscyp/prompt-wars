# Prompt Wars Environment Variables

Phase 0: Documentation for all required environment variables.

⚠️ **NEVER commit real secrets to version control.** This file documents the required keys only.

## Supabase Configuration

### Client-Side (Mobile App)
```bash
# Supabase project URL (public, safe to bundle in app)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

# Supabase publishable key (public, safe to bundle in app)
# Used for client-side auth and RLS-protected queries
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Deep link scheme for auth redirects (e.g., "promptwars://")
EXPO_PUBLIC_AUTH_REDIRECT_SCHEME=promptwars

# App URL for web deep links (production)
EXPO_PUBLIC_APP_URL=https://promptwars.gg
```

### Server-Side (Edge Functions Only)
```bash
# Supabase publishable keys dictionary for Edge Functions
SUPABASE_PUBLISHABLE_KEYS={"default":"sb_publishable_..."}

# Supabase secret keys dictionary (NEVER expose to client)
# Used by Edge Functions for server-owned writes (battle resolution, credit grants)
SUPABASE_SECRET_KEYS={"default":"sb_secret_..."}

# Database direct connection string (for migrations and admin tasks)
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
```

## AI Provider Keys (Edge Functions Only)

### LLM Judge Provider
```bash
# Implemented values: "mock" (default) | "xai".
# Leaving this unset means ranked outcomes are decided by MockJudgeProvider,
# which scores on word count and seed % 100 -- fine for local work, meaningless
# as a competitive ladder.
JUDGE_PROVIDER=xai
JUDGE_API_KEY=xai-...          # optional; falls back to XAI_API_KEY
JUDGE_MODEL_ID=grok-4.3        # grok-4.3 (cheapest w/ structured outputs) or grok-4.6 (best)
JUDGE_API_BASE_URL=https://api.x.ai/v1   # optional override
```

Notes:
- `JUDGE_PROVIDER=xai` is always wrapped in `FallbackJudgeProvider`. If the
  provider times out or errors, the run falls back to the mock rather than
  throwing, because `round-resolve` claims the round into `resolving` before
  calling the judge and nothing sweeps that state -- a throw would strand the
  round permanently.
- Fallback runs are auditable: they record `model_id = "mock-judge-v1.0.0"` in
  `judge_runs`, so they can be excluded from calibration.
- `JUDGE_PROMPT_VERSION` is **not** an env var. It is frozen in code at
  `_shared/judge.ts` (`JUDGE_PROMPT_VERSION`); bump it there whenever the rubric
  wording in `buildJudgeSystemPrompt()` changes, or historical `judge_runs` stop
  being comparable.
- Cost: `runJudgePipeline` calls the provider **2-3 times per round** (a double
  run plus a tiebreaker when the two disagree), and every battle is Bo3 -- so up
  to 9 judge calls per completed battle.
- `anthropic` and `openai` are not implemented. Adding one means a new adapter
  plus a `case` in `createJudgeProvider()`.

### Move Prompt Suggestions

```bash
# Per-fighter prompt suggestions (generate-move-suggestions). Both optional --
# they fall back to the judge's key and model, which is usually what you want:
# same provider, same family, and suggestions are a cheaper call than judging.
SUGGESTIONS_API_KEY=xai-...      # falls back to JUDGE_API_KEY, then XAI_API_KEY
SUGGESTIONS_MODEL_ID=grok-4.3    # falls back to JUDGE_MODEL_ID, then grok-4.3
```

There is deliberately NO mock fallback here. With no key configured the
endpoint returns 503 and the arena falls back to the static `prompt_templates`
rows, because handing a player three lines of mock text they just paid a credit
for is worse than showing them the generic templates.

### Video Generation Provider
```bash
# xAI / X AI / Grok video generation (primary Tier 1 provider)
XAI_API_KEY=xai-...
XAI_VIDEO_MODEL=grok-video-v1  # or current model ID

# Reference-to-video: hand the provider the two fighters' full-body portraits
# so the cinematic shows the players' actual characters. DEFAULT OFF.
#
# Two things are unverified until this is switched on against the real API:
#   1. whether xAI's image fetcher accepts a Supabase signed URL's ?token=
#      query string;
#   2. what grok-imagine-video-1.5 costs -- a model bump changes unit
#      economics silently. Watch `daily_provider_costs` after enabling.
#
# Only set to "true" once both are checked. When off, or when no portrait
# resolves, generation is byte-identical to before the feature existed.
XAI_VIDEO_REFERENCE_ENABLED=false
XAI_VIDEO_REFERENCE_MODEL=grok-imagine-video-1.5  # used ONLY when references are sent

# Optional fallback or alternative video provider
REPLICATE_API_KEY=r8_...
```

## Safety and Moderation Providers (Edge Functions Only)

### Text Moderation
```bash
# OpenAI Moderation API (recommended for pre-gen prompt moderation)
OPENAI_API_KEY=sk-...

# Google Perspective API (alternative or supplementary)
PERSPECTIVE_API_KEY=AIza...
```

### Video Moderation
```bash
# Video moderation provider (manual | hive | google)
VIDEO_MODERATION_PROVIDER=manual  # MVP default, human review queue

# Hive AI Video Moderation (optional, production)
HIVE_API_KEY=...

# Google Video Intelligence API (optional, alternative)
GOOGLE_VIDEO_INTELLIGENCE_API_KEY=AIza...
```

### Account Abuse Prevention
```bash
# IP geolocation service (optional, improves account-farm guard)
IP_GEOLOCATION_API_KEY=...

# Apple DeviceCheck (iOS attestation, optional)
APPLE_TEAM_ID=...
APPLE_KEY_ID=...
APPLE_PRIVATE_KEY=...  # Base64-encoded .p8 file

# Google Play Integrity API (Android attestation, optional)
GOOGLE_PLAY_INTEGRITY_API_KEY=AIza...
```
XAI_VIDEO_TIMEOUT_MS=300000  # 5 min hard timeout
```

### Image Generation Provider (Tier 0 Motion Poster)
```bash
# Fast image model for Tier 0 cinematic reveal
IMAGE_PROVIDER=replicate  # or "stability" | "openai-dalle"
IMAGE_API_KEY=r8_...
IMAGE_MODEL_ID=stability-ai/sdxl  # or equivalent fast model
```

### Moderation Providers
```bash
# Pre-gen prompt text moderation
TEXT_MODERATION_PROVIDER=openai  # or "hivemoderation" | "perspective"
TEXT_MODERATION_API_KEY=sk-...

# Post-gen video moderation
VIDEO_MODERATION_PROVIDER=hivemoderation
VIDEO_MODERATION_API_KEY=your-hive-api-key
```

## RevenueCat (Monetization)

### Client-Side
```bash
# RevenueCat public SDK key (iOS)
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...

# RevenueCat public SDK key (Android)
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```

### Server-Side (Webhook Validation)
```bash
# RevenueCat webhook secret for signature validation
REVENUECAT_WEBHOOK_SECRET=sk_...

# RevenueCat REST API key (for server-side entitlement checks)
REVENUECAT_API_KEY=sk_...
```

## Push Notifications

```bash
# Expo push notification access token
EXPO_PUSH_TOKEN=your-expo-push-token

# Optional: FCM server key for direct Android push (if not using Expo)
FCM_SERVER_KEY=your-fcm-key

# Optional: APNs auth key for direct iOS push (if not using Expo)
APNS_KEY_ID=your-apns-key-id
APNS_TEAM_ID=your-team-id
APNS_AUTH_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

## App Store Configuration

```bash
# iOS bundle identifier
IOS_BUNDLE_ID=com.promptwars.app

# Android package name
ANDROID_PACKAGE_NAME=com.promptwars.app

# App Store Connect API key (for EAS builds)
APPLE_APP_STORE_CONNECT_KEY_ID=your-key-id
APPLE_APP_STORE_CONNECT_ISSUER_ID=your-issuer-id
APPLE_APP_STORE_CONNECT_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# Google Play service account JSON (for EAS builds)
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Optional: Analytics & Monitoring

```bash
# Sentry DSN for error tracking
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# PostHog project key for analytics (if used)
EXPO_PUBLIC_POSTHOG_API_KEY=phc_...
EXPO_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Datadog API key for backend monitoring (Edge Functions)
DATADOG_API_KEY=...
```

## Development & Testing

```bash
# Node environment
NODE_ENV=development  # or "production"

# Enable debug logging in Edge Functions
DEBUG_MODE=true

# Local development Supabase (from `supabase start`)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Test mode flags (skip real provider calls in tests)
SKIP_VIDEO_GENERATION=true
SKIP_MODERATION=false  # keep moderation active even in test
USE_MOCK_JUDGE=false  # set true for deterministic test battles
```

## Character Portrait Image Generation (Edge Functions)

The `image-provider.ts` adapter generates character portraits and item icons. It
routes to xAI as primary and OpenAI Images as fallback. On safety refusals it
short-circuits without retrying the other provider. In `fallback` mode it
returns a deterministic 1x1 PNG so tests and offline runs do not need API keys.

```bash
# Primary image provider: xAI (model: grok-2-image)
# POST https://api.x.ai/v1/images/generations
XAI_API_KEY=xai-...

# Fallback image provider: OpenAI Images (model: gpt-image-1)
# POST https://api.openai.com/v1/images/generations
OPENAI_API_KEY=sk-...

# Optional. Set to "fallback" to force the deterministic stub provider.
# Useful for unit tests and offline development. When set, no network calls
# are made and the adapter returns a 1x1 PNG with provider='fallback'.
IMAGE_PROVIDER_MODE=  # unset in prod | "fallback" in tests/offline
```

## Development / QA Flags (Edge Functions)

```bash
# Kill switch for dev/QA-only Edge Functions (currently: dev-generate-video).
# These bypass entitlement gates and charge 0 credits, so they FAIL CLOSED:
# the function returns 404 unless this is set to exactly "1". Leave UNSET in
# production so the function is unreachable even by authenticated users.
DEV_FUNCTIONS_ENABLED=  # unset in prod | "1" in dev/QA only
```

## Security Notes

1. **Client vs Server**: Only `EXPO_PUBLIC_*` prefixed vars are safe to bundle in the mobile app.
2. **Edge Function Secrets**: Store provider API keys using `supabase secrets set KEY=value`.
3. **RLS Enforcement**: Even with secret keys, RLS protects tables when accessed via publishable keys.
4. **Rotation**: Rotate all provider keys quarterly and on any suspected compromise.
5. **.env.local**: Never commit `.env.local` or `.env.production`. Use `.env.example` as template.

## Setup Checklist

- [ ] Create Supabase project and note URL + keys
- [ ] Set up RevenueCat project and add app bundle IDs
- [ ] Obtain xAI API key for video generation
- [ ] Obtain OpenAI/Anthropic key for judge LLM
- [ ] Configure moderation provider accounts
- [ ] Set up Expo push notification credentials
- [ ] Configure Apple/Google signing certificates for EAS
- [ ] Store all secrets in 1Password/team vault
- [ ] Add `.env.local` to `.gitignore` (already in Supabase scaffold)
