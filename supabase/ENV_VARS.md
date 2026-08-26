# Prompt Wars Environment Variables

Every variable below is read by code in this repository. If you add one here,
add the `Deno.env.get(...)` / `process.env.*` read too — this file was previously
full of aspirational keys that nothing consumed, which is worse than no docs.

To re-check that claim:

```bash
grep -rhoE "Deno\.env\.get\([\"'][A-Z0-9_]+[\"']" supabase/functions \
  | sed -E "s/.*[\"']([A-Z0-9_]+)[\"']/\1/" | sort -u
```

⚠️ **NEVER commit real secrets to version control.** This file documents key
names and shapes only.

## Supabase Configuration

### Client-Side (Mobile App)

Only `EXPO_PUBLIC_*` variables reach the app bundle. Anything else placed in the
root `.env` is invisible to the client.

```bash
# Supabase project URL (public, safe to bundle in app)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

# Supabase publishable key (public, safe to bundle in app)
# Used for client-side auth and RLS-protected queries
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Legacy fallback, read only if the publishable key above is unset
# (utils/supabase.ts). New setups should not set this.
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# EAS project ID -- required for push notifications (`eas project:info`).
# Read in app.config.js -> extra.eas.projectId.
EXPO_PUBLIC_EAS_PROJECT_ID=...

# RevenueCat public SDK keys (see RevenueCat section below)
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```

### Injected by the Edge Function runtime

Supabase provides these to every deployed function. **Do not set them by hand**
and do not add them to `supabase secrets`.

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### Edge Function secrets (set explicitly)

```bash
# Supabase publishable keys dictionary for Edge Functions
SUPABASE_PUBLISHABLE_KEYS={"default":"sb_publishable_..."}

# Supabase secret keys dictionary (NEVER expose to client)
# Used by Edge Functions for server-owned writes (battle resolution, credit grants)
SUPABASE_SECRET_KEYS={"default":"sb_secret_..."}
```

Read them via `createServiceClient()` / `createUserClient()` in
`_shared/utils.ts`, which understand both the JSON-dictionary form and the
legacy single-key fallback.

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
JUDGE_API_BASE_URL=https://api.x.ai/v1   # optional; falls back to XAI_API_BASE_URL, then api.x.ai/v1
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
# Implemented values: "mock" (default) | "xai". Unset means Tier 1 reveals are
# produced by MockVideoProvider.
VIDEO_PROVIDER=xai

# xAI / X AI / Grok credentials, shared with the judge and image providers
XAI_API_KEY=xai-...
XAI_API_BASE_URL=https://api.x.ai/v1   # optional override
XAI_VIDEO_MODEL=grok-imagine-video     # default when references are off
XAI_VIDEO_RESOLUTION=720p              # optional, default 720p

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
```

The legacy `XAI_VIDEO_BASE_URL` is deliberately **ignored** by
`_shared/providers.ts` (it pointed at a non-existent `/v1/video` path) and was
removed from the project on 2026-08-25. Do not reintroduce it.

### Character Portrait / Item Image Generation

The `image-provider.ts` adapter generates character portraits and item icons. It
routes to xAI as primary and OpenAI Images as fallback, both hard-coded — there
is no provider-selection variable. On safety refusals it short-circuits without
retrying the other provider. In `fallback` mode it returns a deterministic 1x1
PNG so tests and offline runs do not need API keys.

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

Note that the Tier 0 reveal's `createImageProvider()` in `_shared/providers.ts`
is still hard-wired to `MockImageProvider` and reads no env at all.

## Safety and Moderation Providers (Edge Functions Only)

### Text Moderation

There is no `TEXT_MODERATION_PROVIDER` switch — `_shared/moderation.ts` selects
a provider purely by which key is present, preferring OpenAI.

```bash
# OpenAI Moderation API (recommended for pre-gen prompt moderation)
OPENAI_API_KEY=sk-...

# Google Perspective API (alternative or supplementary)
PERSPECTIVE_API_KEY=AIza...
```

`assertTextModerationConfigured()` **throws** when neither key is set, so a
production deploy cannot silently degrade to the built-in blocklist. That check
is skipped only in development and test:

```bash
# Any of these relaxes the fail-closed moderation check. Leave ALL unset in
# production, or user-generated prompts ship with blocklist-only moderation.
ENVIRONMENT=development   # or "test"
DENO_ENV=development      # fallback when ENVIRONMENT is unset
DENO_TESTING=1            # set by the Deno test suite
```

### Video Moderation

```bash
# Implemented values: "manual" (default, human review queue) | "hive".
# "google" is documented in comments but not implemented.
VIDEO_MODERATION_PROVIDER=manual

# Hive AI Video Moderation, required only when VIDEO_MODERATION_PROVIDER=hive
HIVE_API_KEY=...
```

### Account Abuse Prevention

All optional; `account-farm-guard` degrades gracefully when they are unset.

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

## RevenueCat (Monetization)

```bash
# Client-side public SDK keys (providers/RevenueCatProvider)
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...

# Server-side: webhook signature validation (revenuecat-webhook/index.ts)
REVENUECAT_WEBHOOK_SECRET=sk_...
```

There is no server-side RevenueCat REST call in this codebase — entitlements are
derived in Postgres from webhook events — so no RevenueCat **API** key is needed.

## Push Notifications

`_shared/push.ts` POSTs to `https://exp.host/--/api/v2/push/send` **unauthenticated**,
which is what Expo's push service expects for unauthenticated projects. No push
credentials belong in Edge Function secrets. The only push-related variable is
`EXPO_PUBLIC_EAS_PROJECT_ID` on the client (see above); APNs/FCM credentials are
held by EAS, not by this repo.

## Development / QA Flags (Edge Functions)

```bash
# Kill switch for dev/QA-only Edge Functions (currently: dev-generate-video).
# These bypass entitlement gates and charge 0 credits, so they FAIL CLOSED:
# the function returns 404 unless this is set to exactly "1". Leave UNSET in
# production so the function is unreachable even by authenticated users.
DEV_FUNCTIONS_ENABLED=  # unset in prod | "1" in dev/QA only
```

## Testing

```bash
# Remote integration tests hit a real linked Supabase project and self-skip
# unless this is exactly "1" (see _tests/remote-character-helpers.ts).
PROMPT_WARS_REMOTE_FUNCTION_TESTS=1
```

When enabled, those tests resolve their connection from the first variable set
in each group:

- URL: `SUPABASE_URL` → `EXPO_PUBLIC_SUPABASE_URL`
- Publishable key: `SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_ANON_KEY` →
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Service key: `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEYS`

## Asset Generation Scripts (local dev only)

```bash
# Used by scripts/generate-assets.mjs and scripts/generate-signature-icons.mjs
# (`yarn assets:generate`). Not needed to run the app or the backend.
GEMINI_API_KEY=AIza...
```

## Not environment variables

Recorded here because they are commonly mistaken for env vars:

- **Bundle identifiers** — hard-coded in `app.config.js`
  (`gg.promptwars.app` for both platforms).
- **Deep link scheme** — hard-coded in `app.config.js` (`scheme: 'promptwars'`).
  Auth is email + password with no OAuth redirect, so there is no redirect-URI
  variable.
- **App Store Connect / Google Play signing credentials** — held by EAS
  (`eas credentials`), never in this repo.
- **`JUDGE_PROMPT_VERSION`** — frozen in `_shared/judge.ts`.
- **Analytics / error-monitoring keys** — no Sentry, PostHog, or Datadog
  integration exists yet. Add the SDK first, then document the key.

## Security Notes

1. **Client vs Server**: Only `EXPO_PUBLIC_*` prefixed vars are bundled in the
   mobile app. Non-prefixed vars in the root `.env` are silently ignored by the
   client — put backend values in Supabase secrets, not there.
2. **Edge Function Secrets**: Store provider API keys using `supabase secrets set KEY=value`.
3. **RLS Enforcement**: Even with secret keys, RLS protects tables when accessed via publishable keys.
4. **Rotation**: Rotate all provider keys quarterly and on any suspected compromise.
5. **.env files**: `.env`, `.env.integration`, `.eas.production.env` and
   `supabase/.env` are gitignored. Use `.env.example` as the template.

## Setup Checklist

- [ ] Create Supabase project; copy URL + publishable key into `.env`
- [ ] `supabase secrets set SUPABASE_SECRET_KEYS=... SUPABASE_PUBLISHABLE_KEYS=...`
- [ ] Obtain an xAI key; set `XAI_API_KEY`, `JUDGE_PROVIDER=xai`, `VIDEO_PROVIDER=xai`
- [ ] Set `OPENAI_API_KEY` or `PERSPECTIVE_API_KEY` — moderation fails closed without one
- [ ] Set up RevenueCat, add bundle IDs, set `REVENUECAT_WEBHOOK_SECRET`
- [ ] Set `EXPO_PUBLIC_EAS_PROJECT_ID` from `eas project:info` for push
- [ ] Confirm `DEV_FUNCTIONS_ENABLED` is UNSET in production
- [ ] Store all secrets in 1Password/team vault
