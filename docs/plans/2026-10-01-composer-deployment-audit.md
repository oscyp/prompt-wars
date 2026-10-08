# Composer deployment dependency audit

Read-only audit of the shared checkout on 1 October 2026, after the user authorized default composer availability and deployment. This document does not claim that any hosted migration, function or secret has been applied. The deployment owner must compare the linked project's migration history and current functions with this manifest.

## Function bundles

Following relative TypeScript imports transitively from all function `index.ts` files to the changed judge, policy, suggestions, situation, calibration, event and video modules identifies these 18 bundles:

```text
appeal-battle
battle-advance
dev-generate-video
expire-battles
generate-move-suggestions
generate-tier0-reveal
leave-battle
matchmaking
prefetch-move-suggestions
process-video-job
record-funnel-event
request-video-upgrade
resolve-appeal
resolve-battle
round-resolve
run-judge-calibration
sign-battle-portraits
submit-prompt
```

Add **`tutorial`**, whose changed HTTP request forwards client contract 3 to matchmaking rather than importing the composer module. This gives 19 affected entry points. `dev-generate-video` is a development endpoint: update its existing bundle only if it is deployed; do not enable `DEV_FUNCTIONS_ENABLED` or newly expose it in production. `evaluation/evaluate-composer-judge.ts` is a local CLI, not an Edge Function deployment.

The graph is intentionally conservative and includes type imports alongside executable imports. `providers.ts` also serves video/Tier 0 code; `compose-reveal-payload.ts` pulls it into portrait signing, expiry and forfeits. Those functions are easy to miss when deploying only the visibly changed judge handlers. `resolve-appeal` consumes the changed appeal service even though its entry point did not change. New `prefetch-move-suggestions` must be deployed together with foreground suggestions and their callers.

Most manifest functions explicitly use `verify_jwt=false` in `supabase/config.toml` because handlers perform their own user or service authorization. Preserve the intended per-function configuration; do not globally disable authentication. `expire-battles` and `generate-tier0-reveal` have no explicit entry in the current config and need comparison with the hosted invocation/JWT setting before replacing an existing deployment. Service chaining uses the repository's secret-authorization helper.

## Composer migrations and prerequisites

Apply missing migrations in repository timestamp order after comparing remote history, not by blindly replaying all files. The four composer migrations are:

| Migration | New behavior | Existing prerequisites to verify |
| --- | --- | --- |
| `20261001190848_composer_suggestion_operations.sql` | Private durable purchase operations, atomic reservation/debit, lease fencing, refunds, expiry cron | `move_prompt_suggestions`, its `source` and `generation_id` columns, wallet ledger and `spend_credits`/`grant_credits`, `character_edit_prices.prompt_suggestions_reroll`, profiles/characters/battles/rounds and `pg_cron` |
| `20261001191303_composer_judge_calibration.sql` | Expected draws, policy/split/provenance/situation on cases, run evidence metadata | `judge_calibration_sets`, `judge_calibration_runs` and their existing RLS/service grants |
| `20261001191306_prompt_composer_context.sql` | Frozen versions/situations, seeded 15-scene catalogue, transactional round opening and compatible matchmaking | Bo3 schema, `rules_version`, `matchmaking_requests`, `match_battle_request`, current status types and character/bot references |
| `20261001191732_composer_telemetry.sql` | Private-by-owner composer milestones, monotonic active duration | `profiles`, `battles`, `auth.uid()` and normal authenticated/service roles |

Concrete prerequisite origins in this tree:

- Core gameplay and calibration cases: `20260506100000_core_gameplay_schema.sql`; wallet functions: `20260506120000_database_functions.sql`; calibration runs: `20260506150000_appeals_and_calibration_extensions.sql`.
- Character pricing: `20260513120000_character_creation_expansion.sql`; tester profile flag: `20260514150545_add_profile_is_test_user.sql`; Bo3/round/HP schema: `20260525120000_bo3_rounds_mode.sql` plus its subsequent fixes; scheduler extensions: `20260526120000_schedule_background_workers.sql`.
- Suggestion table and reroll price seed: `20260826130000_move_prompt_suggestions.sql`; rate-limit branch: `20260826131000_rate_limit_prompt_suggestions.sql`.
- Idempotent matchmaking and request bindings: `20260904165156_tester_feedback_reliability.sql`; current combat snapshot/face-off and recovery semantics: `20260913181726_combat_v2_integrity.sql` and `20260913184033_combat_recovery_rollout_races.sql`.
- Newer suggestion columns required by the October SQL: `20260917121000_suggestion_slot_claim.sql`; generation-aware limits: `20260917122000_suggestion_rate_limit_by_generation.sql`; safe legacy placeholder: `20260918090000_harmless_suggestion_placeholder.sql`.
- Shared video consumers already use leases and provider-model metadata: `20260917120000_video_job_leases.sql`, `20260917123000_video_provider_model.sql`. Verify these before replacing `process-video-job` and its callers.
- Current `_shared/utils.ts` makes authenticated gameplay call `get_account_eligibility`. That RPC comes from `20260922163026_social_registration_eligibility.sql`; deploying this checkout's handlers without it can block gameplay. The current guest-compatible schema additionally includes `20260930164433_guest_registration_authorization.sql`. These are existing checkout prerequisites, not permission to enable their separate auth release.

Other untracked September migrations include RevenueCat transactional fulfillment and Apple authorization/revocation work. A migration push from this checkout can include them if the hosted history is behind. Inventory every pending file and its dependency order explicitly; do not infer that untracked means unapplied or that a local test log describes the hosted database. Preserve independent auth/eligibility, entitlement and payment release settings.

The new suggestion sweeper is a direct `pg_cron` SQL job named `expire-suggestion-operations`; it runs every minute and does **not** itself require Vault HTTP credentials. Existing HTTP background jobs still require their configured Vault URL/key. Verify no duplicate/conflicting scheduler job after applying the migration. Drain old unfenced suggestion workers before new operations are accepted.

## Verification required for this deployment

- Check all four new-mode defaults (practice, casual, friend and ranked), legacy queue/invite/request replay, client-contract update responses and no obsolete composer flag reads. New ranked creation must not query the removed primary calibration gate.
- Run affected Deno suites/checks and SQL context/finance/calibration/RLS tests. The default-on agent reported 39 tests and 35 HTTP steps, five endpoint typechecks and nine-file lint passing; the earlier full suite and app results remain recorded in the [runbook](2026-10-01-composer-release.md).
- Verify omitted/automatic suggestion requests remain free, paid requests require contract 3 plus explicit operation/key/price, and duplicate/recovery/refund behavior survives provider errors and the emergency generation stop. Do not use a paid live call as a smoke check without its explicit budget.
- Verify hosted migration versions, RPC existence and service-only grants, seeded catalogue count 15, immutable versions/snapshots, cron job, matching function deployment IDs and authorization failures for unauthenticated callers. Use read-only hosted checks or authorized bounded fixtures without resetting the database.
- Preserve existing independent appeal calibration, no-fallback reviewer provenance, mock-assisted ranked exhibition/rating protections, moderation and video/refund behavior. The primary-calibration request gate removal does not supply missing evidence or authorize fabricated review labels.
- Native keyboard/accessibility and the human judge/pilot work remain NOT RUN unless new evidence is actually collected. Deployment authorization supersedes the old staged rollout prerequisite, not the evidence record.
