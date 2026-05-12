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
EXPO_PUBLIC_APP_URL=https://promptwars.app
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
# Primary judge model (e.g., OpenAI GPT-4, Anthropic Claude, or xAI Grok)
JUDGE_PROVIDER=openai  # or "anthropic" | "xai"
JUDGE_API_KEY=sk-...
JUDGE_MODEL_ID=gpt-4-turbo-preview  # or model version for reproducibility
JUDGE_PROMPT_VERSION=v1  # frozen version for battle audit trail
```

### Video Generation Provider
```bash
# xAI / X AI / Grok video generation (primary Tier 1 provider)
XAI_API_KEY=xai-...
XAI_VIDEO_MODEL=grok-video-v1  # or current model ID

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
