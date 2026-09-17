# UX and game-integrity deployment — 14 September 2026

Latest mobile release preparation: [version 1.2.0 attempt](2026-09-14-release-1.2.0.md), including the restored center Battle action. Its build/upload status supersedes the earlier mobile preparation below.

Deployment authorized by the user's “deploy everything” instruction. Source is the reviewed working tree on `codex/ux-game-integrity`, based on `5e0e6ce`; changes are not committed. EAS therefore reports the base commit, while its uploaded archive contains the working-tree implementation. Existing audio-provider edits are included without modification.

## Backend deployed

Target: Supabase project `uoyjhudegdpanrgllfoj` (`prompt-wars`, EU West), API `https://uoyjhudegdpanrgllfoj.supabase.co`.

The reviewed linked-database push applied these eight pending additive migrations successfully:

- `20260904165156_tester_feedback_reliability`
- `20260913181726_combat_v2_integrity`
- `20260913183224_durable_independent_appeals`
- `20260913183306_starter_tutorial_respec`
- `20260913184033_combat_recovery_rollout_races`
- `20260913190056_fair_independent_appeal_recovery`
- `20260913190358_initial_portrait_recovery_fencing`
- `20260913192055_independent_appeal_provider_health`

All 42 Edge Functions deployed and report `ACTIVE`: 38 existing versions advanced and four new functions were added (`starter-fighter`, `tutorial`, `respec-character`, `record-funnel-event`). [Function version evidence](../audits/2026-09-14-deployment/functions.json). Existing provider and billing credentials were preserved. The local Supabase Go CLI 2.98.2 performed the deployment; the connected MCP project access was unavailable.

Post-deployment checks confirmed the new character/battle/appeal fields through the API, the migration history, and no public/anon/authenticated grants on the sampled new internal mutation RPCs. New endpoints reach their authentication handlers. Existing expire/video/appeal/calibration cron jobs remain active. Some older unauthenticated handlers return HTTP 500 with an unauthorized message; they still reject access. These are smoke checks, not a complete authenticated service or payment integration test.

No shared database reset, historical rejudging, old exit-fee refunds or historical rating replay was performed.

## Feature activation and reviewer

`COMBAT_V2_ENABLED=false` and `APPEALS_ENABLED=false` are explicitly configured. Backend support is live; activation follows the approved client compatibility and release acceptance gates.

The independent reviewer is configured as `grok-4.20-0309-reasoning`, English, with a 168-hour calibration freshness limit. Its actual model differs from the observed primary judge `grok-4.3`.

| Calibration | Result | Recorded UTC |
|---|---|---|
| Primary `grok-4.3` | 3/3, passed | 2026-09-14 03:00:59 |
| Candidate `grok-4.20-0309-non-reasoning` | 2/3, failed | 2026-09-14 14:51:46 |
| Configured reviewer `grok-4.20-0309-reasoning` | 3/3, passed | 2026-09-14 14:54:10 |

The unchanged threshold is 90%; the endpoint checks actual per-call model provenance and rejects fallback-assisted calibration. Passed reviewer run: `82094e81-797e-4173-80d9-940c63759b3c`. Both candidate results remain recorded. Three fixtures provide smoke calibration only; broader quality and reviewed-series checks remain necessary before activation. The current nightly cron calibrates the primary model; independent-reviewer recalibration must be scheduled before enabling appeals.

Calibration invoked the existing service-only endpoint through the database's existing Vault credential and `pg_net`. The CLI's legacy service JWT can read the REST API but does not match the Edge runtime's service credential. No credential was printed, replaced or committed, and service authentication was not weakened.

## Mobile release

Mobile deployment is paused following the user's request to restore Battle to the middle of the navigation bar first. That local adjustment is now implemented and verified; see the [implementation follow-up](../UX_GAME_INTEGRITY_IMPLEMENTATION.md). The archive hash and mobile build IDs below predate this navigation adjustment and must not be treated as its release artifacts. Regenerate the archive and complete the required checks before any later authorized upload.

Target: Expo `@prompt-wars/prompt-wars`, project `d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`, bundle/package `gg.promptwars.app`, native version 1.1.0. Production EAS environment supplies the configured production RevenueCat public keys and correct backend URL.

`eas.json` now records the existing App Store Connect application `6788787677` and the Google Play internal track. `.easignore` retains credential/environment exclusions and excludes backend code, documentation, tests, landing pages, agent records and Git history from mobile archives. EAS local archive inspection confirmed 318 mobile files (18,455,300 bytes), no excluded-file leakage and no matches for the checked private-key/service-account/provider-key patterns. [Archive verification](../audits/2026-09-14-deployment/release-archive-check.json). This is a bounded pattern check, not a general guarantee that source code is nonsensitive.

Initial iOS build 8 (`5924998f-2f69-4390-b351-d0809bca05ae`) finished. Its queued submission (`dab5c9d1-a6a7-44a8-bed6-e2d38ff18078`) and the queued Android version-code-4 build (`cf56b87d-891c-4479-8cf1-1931fea3fc11`) were canceled to include the customization accessibility correction discovered during the deployment walkthrough. They are not the final client release.

Corrected client build/submission status: **verified and ready, upload blocked by automatic approval review**. No replacement build was created. Review rejected the first upload because it required explicit authorization naming the source payload and Expo destination. After narrowing the archive and inspecting its contents locally, a second request with the verified archive details and existing project ID was also rejected for the same authorization reason. No workaround or alternate upload was attempted. Explicit user approval is required to upload the verified mobile source to the existing EAS project, build iOS/Android, and submit the resulting iOS build to TestFlight.

Google Play upload is blocked by missing service-account credentials. EAS has a signing keystore but no Google service-account key associated with this project/account. The available signed-in browser account opens developer-account registration rather than an existing Play application, and no alternate Chrome connection is available. No developer account was created. The user has been asked for the local credential-file path; key contents must not be placed in chat or source control.

## Native and automated verification

The [implementation record](../UX_GAME_INTEGRITY_IMPLEMENTATION.md) contains the pre-deployment aggregate, SQL concurrency tests and iOS evidence. The deployed schema now permits the customization walkthrough that was previously blocked by the missing starter column.

On a fresh iPhone 15 Pro launch at accessibility-extra-large, the archetype sheet heading, description and pinned Done action are reachable. Live system font-size changes while the sheet is open produced stale native text measurement; cold-launch evidence distinguished that from reproducible option-card truncation. The cards now become full-width with complete labels and neutral archetype descriptions. [Archetype sheet](../audits/2026-09-14-deployment/archetype-large-text.png).

The large-text expanded editor previously obstructed scrolling to its editing categories. At font scale 1.3 and above, the fighter, category controls and active panel now use the existing scrolling container; draft/category state and the keyboard-inset owner are preserved. Portrait history stacks, paid labels wrap with dark primary ink, and categories remain readable. Native swipes reached the editing fields with the complete 3-credit Draw price visible. [Before](../audits/2026-09-14-deployment/editor-large-text-before.png), [after](../audits/2026-09-14-deployment/editor-large-text-after.png), [default size](../audits/2026-09-14-deployment/editor-default-text.png). Custom-item price rows also stack at large text sizes. No paid render, save, report or store purchase was submitted during this walkthrough.

Final aggregate after these corrections: **130 Jest suites / 1,069 tests passed**; app TypeScript passed; standard lint passed with zero errors and the existing guarded Reanimated require warning. Focused customization checks and independent reviews (Tasks 29/31, reviews 30/32) passed. Native Gear/CustomItem/ItemDetail interaction and the full accessibility matrix are not certified by these screenshots; the runtime's action capture did not expose category tabs as tap targets. Component/screen tests cover category-state preservation and pinned modal commits.

The test simulator was restored to its original default text size and shutdown state, and the local Metro process was stopped. The other already-running simulator was left alone. Both protected audio files still match the starting hash baseline.

## Remaining release gates and rollback

Complete the [acceptance matrix](../UX_GAME_INTEGRITY_ACCEPTANCE.md), including Android/small-phone, screen-reader/reduced-motion/localized-price checks, real delayed StoreKit/Play fulfillment and deployed reviewed-series recovery. Upload to TestFlight/internal testing does not mean public App Store/Play release or completed store review.

Existing Supabase security advisories remain for the public cosmetic projection view, older mutable-search-path/security-definer helpers and disabled leaked-password protection. No new table-without-RLS finding was reported. The existing public identity view must be evaluated with its intended access model before changing its security mode.

Rollback disables new-rule matchmaking or appeal submissions. It does not reverse migrations, rewrite active battle rules or replay historical ratings.
