# Prompt composer — default-on deployment

Deployed to **prompt-wars**, project `uoyjhudegdpanrgllfoj` (EU West), on 1 October 2026. The user explicitly superseded the staged rollout: remove the composer flags, enable the experience by default, apply migrations and deploy the affected functions.

## Delivered behavior

New practice, casual, friend and ranked series use experience 2 and the ideas-first judge policy. Existing battles, queues, invitations and replayed requests keep their recorded version. Client contract 3 is required for new composer interactions. The six mode/approval/AI/purchase flags and the primary ranked calibration availability gate are removed. AI suggestions and explicit paid rerolls are available by default; purchase confirmation, current-price checks, idempotency, refunds, moderation and independent appeal checks remain.

None of the six obsolete secrets was present on the hosted project, so no secret deletion was needed. The primary provider is configured as xAI with its key present; prefetch is enabled. No provider credentials, independent auth rollout settings or existing emergency controls were changed. This deployment does not constitute real-model calibration evidence.

## Database

The preflight dry run found exactly four pending migrations; all older auth, guest, wallet, combat and suggestion prerequisites were already applied. Applied in timestamp order:

- `20261001190848_composer_suggestion_operations.sql`
- `20261001191303_composer_judge_calibration.sql`
- `20261001191306_prompt_composer_context.sql`
- `20261001191732_composer_telemetry.sql`

A subsequent dry run reported the remote database up to date. Hosted checks confirmed 15 situations across five themes, immutable experience/situation triggers, all eight new service RPCs unavailable to anonymous/authenticated clients and executable by service role, and private suggestion-operation state. The once-per-minute recovery cron is active; its first two inspected runs succeeded. Existing 58 battles retained legacy experience 1.

The security-advisor comparison added only the expected authenticated-guest access advisory for `composer_events`. Its SELECT policy is restricted to `profile_id = auth.uid()`; anonymous API roles have no access, and clients have no INSERT grant. This preserves the product requirement that eligible guests have account-equivalent capabilities. Existing unrelated findings were preserved.

## Functions

All 19 affected functions were deployed successfully, with matchmaking/tutorial last. Each hosted version increased, all report `ACTIVE`, and every JWT setting matches its pre-deployment value. This includes the already-deployed, still-gated development video handler; its feature was not enabled.

See [verified function versions](../audits/2026-10-01-composer-deployment/functions.json), [deployment results](../audits/2026-10-01-composer-deployment/deployment-results.json), [schema checks](../audits/2026-10-01-composer-deployment/schema.json), [policy checks](../audits/2026-10-01-composer-deployment/policies.json) and [source checksums](../audits/2026-10-01-composer-deployment/source-sha256.json). The shared working tree includes unrelated existing work and is not represented by a new commit; the source manifest records the deployed entry points and their relative-import dependencies.

## Verification

- App: 216 Jest suites, 1,750 tests passed; TypeScript passed.
- Backend: 454 Deno tests and 56 steps passed, seven remote tests intentionally skipped.
- SQL: context, finance/lease/refund, calibration and RLS assertions passed locally in a rolled-back transaction. No database was reset.
- Archive: fixed `.easignore` to include only the two pure shared modules imported by mobile code. Import-closure regression and the installed EAS ignore-rule checks passed; server code, migrations and secrets remain excluded.
- Whitespace checks passed.
- Hosted negative-auth smoke: 38 bounded requests across 19 endpoints matched inspected rejection behavior. Of these, 24 returned explicit application auth denials, four were rejected by the gateway, two confirmed the dev endpoint disabled, and eight exercised four existing handlers whose auth catches return HTTP 500 with their known error bodies. Those eight are rejection checks, not clean 401/403 semantics; gateway-only checks do not prove handler startup. No unexpected response or boot error was observed. [Exact results](../audits/2026-10-01-composer-deployment/auth-smoke.json).

Native keyboard/reader acceptance, human label review, paid actual-model calibration and the 12-person pilot remain unperformed. The deployment neither claims those outcomes nor changes their historical reports. No paid generation or player-wallet smoke purchase was performed.

## Client delivery

The user requested Expo. The local Expo development server is running at `http://localhost:8081` (LAN `http://172.20.10.2:8081`). Both platform bundles compiled: iOS HTTP 200, 16,996,861 bytes / 2,417 modules; Android HTTP 200, 17,113,264 bytes. The application needs an Expo development client because of its native dependencies. No simulator was booted, so this is bundle verification rather than native UI acceptance.

EAS archive-only inspection succeeded with 497 files. The two admitted shared modules match current source hashes; environment files, backend implementation, migrations, documentation and fixtures are excluded. [Expo evidence](../audits/2026-10-01-composer-deployment/expo-verification.json).

No EAS cloud build or store submission was started. The optional clarification between local Expo and an EAS TestFlight/internal delivery had no answer at completion, so no new distribution destination was inferred. This project has no configured Expo OTA updates; a backend deployment does not update an installed native app.
