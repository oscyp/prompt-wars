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
# Leaving this unset uses MockJudgeProvider. Mock-assisted ranked series
# complete as unrated exhibitions; no competitive rating/win/streak rewards.
JUDGE_PROVIDER=xai
JUDGE_API_KEY=xai-...          # optional; falls back to XAI_API_KEY
JUDGE_MODEL_ID=grok-4.3        # configured example; promote only after calibration
JUDGE_API_BASE_URL=https://api.x.ai/v1   # optional; falls back to XAI_API_BASE_URL, then api.x.ai/v1
```

Notes:

- `JUDGE_PROVIDER=xai` is always wrapped in `FallbackJudgeProvider`. If the
  provider times out or errors, the run falls back to the mock rather than
  throwing, so the free result can still complete. Independently, the recovery
  worker reclaims stale resolving rounds under parent/round locks; exhausted
  attempts terminalize the series as no contest without competitive rewards.
- Each call records its actual response model ID, prompt version, seed, scores, and fallback status. Aggregation is recorded. A mock-assisted ranked series completes its free result as an unrated exhibition; mock output cannot silently update competitive records or pass calibration.
- Judge policy versions are **not** env vars. `_shared/judge-policy.ts` defines
  legacy `v1.0.0-mvp` and composer `v2.0.0-ideas` (`judge.ts` reexports them).
  The battle's immutable `judge_policy_version` selects the actual provider
  template for both primary calls, tiebreak and appeals. Missing legacy values
  select v1; unknown versions fail. Add a new policy when instructions change;
  never rewrite a template already assigned to historical battles.
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
SUGGESTIONS_MODEL_ID=grok-4.20-0309-non-reasoning # independent of the judge model
```

There is deliberately no mock purchased-success fallback. Generation failure
preserves free authoring; composer v2 has bundled authored actions/intentions,
and legacy authoring retains its existing free path. Failed or moderated paid
operations are refunded once. Automatic `ensure_free` (also the default for an
omitted operation) never charges. Paid `reroll` requires an explicit idempotency
key and expected live price. See the independent generation/purchase switches
under Versioned prompt composer below.

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

# Legacy reference-to-video flag only. New cinematic-v2/v3 jobs always require
# reference mode; disabling this flag does not change snapshotted jobs.
XAI_VIDEO_REFERENCE_ENABLED=false
XAI_VIDEO_REFERENCE_MODEL=grok-imagine-video-1.5
# Set a verified rate before rollout; unknown costs stay NULL, never zero.
VIDEO_COST_USD_PER_SECOND__GROK_IMAGINE_VIDEO_1_5=0.14 # 720p output-only fallback
VIDEO_COST_USD_PER_SECOND__GROK_IMAGINE_VIDEO=0.07     # 720p output-only fallback
```

Cinematic-v3 is controlled by the service-only singleton
`public.cinematic_generation_config.enabled` (default `false`), not a client
variable. Its resolver uses derived entitlements and freezes 8s round / 12s
single / 20s Plus policy on every new job, including automatic jobs. While
false, jobs follow legacy generation and Plus duration copy remains hidden.
The flag applies only to new jobs; in-flight v2 and v3 jobs retain their policy
and required references after rollback.

Plus v3 uses `grok-imagine-video-1.5` for a 15-second reference scene, then
`grok-imagine-video` to extend its approved private base by 5 seconds. The
service-only `cinematic-work` bucket holds intermediate media. No intermediate
video row is exposed to clients. Each stage has 300 seconds; total execution
has 600 seconds. Durable submission markers prevent duplicate paid calls
when a response is lost. Either-stage failure refunds the original funding.

Cinematic requests explicitly enable generated audio and ask for synchronized
ambient/action sounds without dialogue or narration. The worker retains the
original provider bytes for both base and final media; moderation still gates
publication. The app keeps previews muted and enables sound only after Play.
Existing clips saved without audio are not regenerated by this change.

Cost tracking prefers the provider's actual `usage.cost_in_usd_ticks` converted
with 10^10 ticks per USD and sums both stages. Configured model rates are
output-only estimates when usage is missing, excluding input fees. Rates above
were checked against https://docs.x.ai/developers/pricing on 2026-10-08.
Unknown costs stay NULL, never zero.

Before enabling: apply the four cinematic migrations, deploy the compatible
Edge Function closure (including `moderate-video`), publish the vetted bundled
references with `node scripts/publish-cinematic-reference-assets.mjs --execute`,
and validate a signed-reference 20-second generation and extension. The
publisher defaults to a local checksum-only dry run. The wider 24-clip visual
matrix remains follow-up verification; do not describe a bounded smoke as that
matrix. See `docs/audits/2026-10-08-cinematic-release/` for current release
status and `docs/audits/2026-10-08-cinematic-fidelity/README.md` for the earlier
15-second implementation evidence.

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
# Primary image provider: xAI (model: grok-imagine-image)
# POST https://api.x.ai/v1/images/generations
XAI_API_KEY=xai-...

# Fallback image provider: OpenAI Images (model: gpt-image-1)
# POST https://api.openai.com/v1/images/generations
OPENAI_API_KEY=sk-...

# Optional. Set to "fallback" to force the deterministic stub provider.
# Useful for unit tests and offline development. When set, no network calls
# are made and the adapter returns a 1x1 PNG with provider='fallback'.
IMAGE_PROVIDER_MODE=  # unset in prod | "fallback" in tests/offline

# Optional exact per-successful-image charges from the deployed provider
# contract. Leave unset when unknown; telemetry stores NULL rather than a
# misleading zero. Update these when the contract or model changes.
XAI_IMAGE_COST_USD_SQUARE=
XAI_IMAGE_COST_USD_PORTRAIT=
OPENAI_IMAGE_COST_USD_SQUARE=
OPENAI_IMAGE_COST_USD_PORTRAIT=
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
- **Judge policy versions** — defined in `_shared/judge-policy.ts`, frozen per
  battle and dispatched by the provider adapter; not runtime secrets.
- **Cosmetics client contract** — `utils/cosmetics.ts` sends version 2. New artwork rows use `cosmetics_catalog.min_client_contract_version = 2`; missing versions default to 1. No secret or runtime image-generation key is needed for these bundled frames. Deploy the additive migration before the cosmetics function, then ship the compatible client. To withdraw a new item, deactivate its catalog row; never delete ownership or wallet history.
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

## UX and game-integrity rollout

```bash
# Default off. Deploy additive migrations and compatible client first.
COMBAT_V2_ENABLED=false
```

When enabled, new matchmaking requires `client_contract_version >= 2` and stores `rules_version = 2`; incompatible clients receive update-required while existing battles remain accessible. Pair human queues within the same rules version. Do not toggle the rules of an active battle. Rollback turns off creation of new version-2 matches.

Independent appeal review remains separately gated until the configured model/prompt has passed calibration and database correction fixtures have passed. Its model must differ from the original recorded calls; mock fallback is not an independent review. See the appeal configuration section added with that implementation and `docs/UX_GAME_INTEGRITY_ACCEPTANCE.md`.

### Independent appeal reviewer

```bash
APPEALS_ENABLED=false
APPEAL_JUDGE_MODEL=your-calibrated-model-id
APPEAL_JUDGE_LOCALE=en
APPEAL_CALIBRATION_MAX_AGE_HOURS=168
```

The reviewer uses the existing server-only judge API credentials, but an explicit independent model ID. Leave submissions off until `run-judge-calibration` with target `appeal` has persisted a passing run for the exact actual model, prompt version and locale. Configure a model different from every original call. The age limit bounds how old that evidence may be; failures, missing evidence, fallback or a mismatched model cannot qualify. Review workers do not use mock fallback.

Appeal work uses a 15-minute worker lease and per-item retries after 10, 20, 40, 80, 160, then 320 minutes. A failed item does not imply that the provider is down. Actual provider failures create a separate, model-scoped 10-minute cooldown; missing original data must not block unrelated submissions.

The availability/status endpoint must report disabled or temporarily unavailable before an allowance-consuming submit. Rollback sets `APPEALS_ENABLED=false`; durable submitted records and original battle evidence remain auditable. Database correction fixtures and concurrent-worker testing are separate requirements from model calibration.

### Versioned prompt composer

The 1 October 2026 user decision makes composer experience 2 the default for
all new practice/tutorial, casual/friend and ranked series. AI suggestions and
explicit paid rerolls are available by default. Existing legacy battles,
queues, invitations and request replays retain their stored experience. Client
contract 3 is required for new v2 authoring and explicit purchases.

The six composer rollout variables were removed from runtime. Any old hosted
values are obsolete and have no effect: `PROMPT_COMPOSER_PRACTICE_ENABLED`,
`PROMPT_COMPOSER_CASUAL_ENABLED`, `PROMPT_COMPOSER_RANKED_ENABLED`,
`PROMPT_COMPOSER_RANKED_APPROVED`, `PROMPT_COMPOSER_AI_ENABLED`, and
`PROMPT_SUGGESTIONS_PAID_ENABLED`. `PROMPT_COMPOSER_CALIBRATION_MAX_AGE_HOURS`
is also obsolete because primary calibration no longer gates new ranked
assignment. Do not set these variables as an activation or reversal procedure.

The existing operational switches remain server-only:

```bash
# Exact true blocks NEW suggestion generation and new paid reservations,
# including legacy. Default false/unset. Existing operation recovery survives.
SUGGESTIONS_AI_DISABLED=false
# Prefetch is on by default; exact 0 disables prefetch only.
SUGGESTIONS_PREFETCH_ENABLED=1
```

`_shared/suggestion-service.ts` still requires configured provider/moderation
credentials. Default availability does not bypass moderation, free allowance,
current price/balance, rate limits, purchase confirmation or idempotency. Paid
rerolls remain explicit; automatic `ensure_free` never charges. Existing
operation recovery runs before new-generation and price checks. Drain old
unfenced workers when deploying the reservation/lease migration and handlers.

Judge evaluation remains offline by default. A separately authorized live run
can add `--run-paid --max-calls=N --persist` to save recomputed evidence through
`createServiceClient`; existing Supabase URL/service-secret settings are used,
with no new credential variable. `--persist` without `--run-paid` fails before
work. Partial, unreviewed or failed runs stay failed; enabling the composer does
not create passing evidence. See the [runbook](../docs/plans/2026-10-01-composer-release.md).

Independent appeals retain their existing enable/configuration and calibration
requirements. V2 reviews require `multilingual` evidence for the frozen policy,
regardless of `APPEAL_JUDGE_LOCALE`; legacy reviews retain their configured
locale. The reviewer must differ from all original models, and
`APPEAL_CALIBRATION_MAX_AGE_HOURS` still governs appeal evidence. Existing judge
fallback, exhibition/rating protections, combat and social-auth flags are
unchanged. Only policy, not the primary model, is frozen on the battle.

## Staged Apple/Google and eligibility release

Keep `private.auth_release.enabled=false` and the client feature flag unset until
`docs/SOCIAL_AUTH_RELEASE.md` prerequisites and signed-device acceptance pass.
No countries are approved by default. These values are configured as **Edge
Function secrets**, never `EXPO_PUBLIC_*`:

| Secret                          | Purpose                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GOOGLE_SIGN_IN_CLIENT_IDS`     | Comma-separated allowlist of actual Google ID-token audience client IDs used by the native builds        |
| `APPLE_SIGN_IN_CLIENT_ID`       | Native Apple bundle ID, `gg.promptwars.app`, matching verified Apple token audience                      |
| `APPLE_SIGN_IN_TEAM_ID`         | Apple Developer team ID                                                                                  |
| `APPLE_SIGN_IN_KEY_ID`          | Sign in with Apple key ID                                                                                |
| `APPLE_SIGN_IN_PRIVATE_KEY`     | PKCS8 `.p8` private key, server-only                                                                     |
| `APPLE_SIGN_IN_ENCRYPTION_KEY`  | Base64-encoded 32 cryptographically random bytes; stable key for encrypted revocation credentials        |
| `REGISTRATION_NETWORK_HMAC_KEY` | At least 32 random characters used to hash ingress-verified network addresses for signup velocity limits |

The revocation cron uses existing Vault entries `supabase_url` and
`service_role_key`; no Apple token belongs in a cron command. Provision the Auth
Before User Created hook and manual linking separately in the hosted project.

KWS Consent Management is deliberately unavailable until onboarding supplies its
confirmed protocol. Parent Verification credentials alone do not enable consent.
Do not invent KWS URLs or mark a PV adult-verification event as approval. See
`docs/KWS_SETUP.md` for the implementation boundary and required next inputs.


### Three-decision composition (composition version 3)

No new provider credential or rollout flag is required. The client requests
`composition_version: 3` while retaining client contract 3 and suggestion
`structureVersion: 2`. The new fields are additive; old clients still read the
same action, intention, title and body. The xAI model remains the explicitly
configured `SUGGESTIONS_MODEL_ID`, with `grok-4.20-0309-non-reasoning` as the
independent default (never inherited from `JUDGE_MODEL_ID`).

New bank requests have a 45-second generation deadline and 4096 output tokens
per reserved type. Typed moderation has its existing shared 60-second budget;
60-second worker leases renew every 10 seconds throughout both stages.
`complete-move-suggestion` uses the same provider/moderator configuration and
user JWT plus shared `generate` eligibility check. It never touches a wallet.

Six delivered custom adaptations are allowed per owner and round; pending
operations reserve quota, failures release it, and replay does not consume it.
The 30/hour and 90/day attempt limits are shared with bank generation. Each
exact custom/upgrade context allows at most three provider attempts. Exact-set
cache enrichment uses `ensure_free` plus `suggestion_set_id`, preserves every
purchased field, and has a distinct composition status from purchase delivery.

Deploy the additive SQL migration and both `generate-move-suggestions` and
`complete-move-suggestion` before releasing the v3 composer client. The existing
`SUGGESTIONS_AI_DISABLED=true` switch stops new custom adaptations and upgrades
as well as new bank generation/purchases. Ready/pending operation recovery,
refunds, authored starters and manual writing remain available. Do not restore
removed composer/ranked rollout flags. Provider quality and live latency must
be measured separately; passing mock-transport tests is not live evidence.
