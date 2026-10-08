# Cinematic Duration and Fighter Fidelity Implementation Plan

> Release amendment (2026-10-08): the user subsequently requested **20 seconds for Plus**, a version bump and rollout. Policy v3 supersedes this plan's 15-second assumption for new jobs: a 15-second reference scene plus a real 5-second extension, with private intermediate storage, durable stage markers, per-stage moderation, one funding unit and failure refunds. Existing v2 jobs stay 15 seconds. Version 1.3.4 is the release. See `docs/audits/2026-10-08-cinematic-release/` for verification and actual deployment status. The remainder records the original implementation plan.


> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task by task. Steps use checkboxes for tracking.

**Goal:** Give Prompt Wars+ members longer generated cinematics, and make every generated cinematic depict the battle's actual fighters, signature items, and submitted moves.

**Architecture:** Freeze the cinematic's duration at job creation, then prepare one immutable, versioned generation input from recorded battle identity, moves, and outcome. The worker signs stored asset paths immediately before submission and passes explicitly associated fighter references and action beats through the existing video provider adapter.

**Tech stack:** Existing Supabase PostgreSQL/RLS, Deno Edge Functions, xAI video adapter, Expo SDK 55 / React Native, Jest and Deno tests. No SDK upgrade or new video provider is required.

**Spec:** Product baseline: `docs/prompt-wars-implementation-concept.md` §§7.7, 8, 10. Proposed changes and assumptions are defined below. This is a planning artifact, not an implementation or rollout approval.

## Proposed product behavior

The user requested longer Plus cinematics and faithful characters/items, ideally with the submitted moves animated. Exact duration was unspecified; **15 seconds is the recommended planning assumption**, pending the user's preference.

| Generated Tier 1 clip | Standard | Prompt Wars+ |
| --- | --- | --- |
| One Bo3 round | 8 seconds | 15 seconds |
| Legacy single battle | 12 seconds | 15 seconds |
| Character, item and move fidelity | Included | Included |

- A shared clip qualifies for Plus duration if **either human participant** has an active derived subscription when the job is created. Both watch the same clip. The paying/requesting player and automatic sponsor do not determine cinematic length.
- Qualification applies to automatic, allowance, welcome-grant and credit-funded clips, including subscribers who have exhausted their allowance. It changes duration, not permission to generate.
- Preserve one credit/allowance round-unit per round, existing generation caps and refunds. An automatic job still covers only the final round of a completed Bo3 series; Plus does not make every round automatic.
- Same-job retries retain their original duration. A genuinely new replacement request rechecks eligibility. Subscription changes do not regenerate existing clips or alter an in-flight job.
- Fighters use the identity and equipment frozen for that battle, rather than the player's current edited character. “Items” means the equipped signature item; portrait frames, badges and other UI cosmetics are not invented as physical equipment.
- Both players' actions should be recognizable, with the longer clip giving each more time. The recorded round outcome remains authoritative. A final-round clip does not pretend to reenact an entire series.
- Tier 0 stays instant and unchanged. These requirements concern generated Tier 1 video.

## Global constraints

- Server-owned jobs, generation decisions, billing and battle state; client calls use `invokeAuthenticatedFunction`.
- Subscription status comes from derived `entitlements` / `entitlements_v2` views, never raw purchase rows or client claims.
- No paid scoring advantage, judge changes, or provider-determined winner.
- Support `single`, `bo3`, human opponents, bots and nullable legacy data.
- Preserve pre-generation moderation, post-generation quarantine/publication gates, silent output, private storage and signed delivery URLs.
- Missing visual assets may fail a video and refund its funding; they must never prevent battle completion.
- No database reset, paid provider call, deployment, or production data change is part of preparing this plan.

## What the current code establishes

Paths beginning `_shared/`, `_tests/`, or an Edge Function name below are relative to `supabase/functions/`; other paths are repository-relative. Findings describe the current working tree, including existing uncommitted work.

| Finding | Relevant implementation |
| --- | --- |
| Duration depends only on round vs. single format: 8/12 seconds. | `_shared/video-constants.ts`, `process-video-job/index.ts:174` |
| Bo3 face-off freezes names, colors, artwork and cosmetics, but omits item details, appearance version and starter key. | `_shared/start-face-off.ts:168` |
| Video submission reads current characters and current fighter portraits instead of the frozen identity. Reference failures silently become text-only video. | `process-video-job/index.ts:520` |
| Existing full-body fighter generation already incorporates the signature item's prompt fragment. | `generate-portrait/index.ts:216` |
| Composer v2 already supplies recorded move text, move type, situation and outcome; the provider truncates each move to 400 characters. | `_shared/composer-video.ts`, `_shared/providers.ts:602` |
| The request carries an unlabelled image array and no explicit item/appearance descriptors. | `_shared/providers.ts:103` |
| A per-round payload is composed for a hash but is not persisted or used as the worker's submission input. Its hash serializer drops nested properties. | `_shared/compose-tier1-payload.ts:274`, `request-video-upgrade/index.ts:348` |
| Reference generation is disabled by default; local configuration does not prove its deployed setting. | `_shared/providers.ts:419`, `supabase/ENV_VARS.md:147` |

Provider documentation checked on 2026-10-08: xAI's REST request uses `reference_images: [{url}]`; the existing adapter sends the Python SDK-style `reference_image_urls`. References use positional `<IMAGE_0>`, `<IMAGE_1>` tags. The documented `grok-imagine-video-1.5` reference mode supports up to 15 seconds, seven references, and 720p. Correct the wire contract and prove it with a bounded real-provider check during implementation. No real generation was performed for this plan. [Official reference-to-video documentation](https://docs.x.ai/developers/model-capabilities/video/reference-to-video)

## Approach and tradeoffs

**Recommended: one reference-guided clip with frozen inputs and explicit action beats.** It uses the current pipeline, supports the proposed 15-second benefit, and addresses identity and item ownership directly.

Text-only prompt improvements are cheaper to implement but cannot adequately establish visual identity. Multi-clip generation and stitching could provide 20–30 seconds, but introduce continuity, partial-failure, moderation and billing complexity. Defer stitching. Also defer an additional LLM storyboard stage until direct use of the recorded moves has been evaluated; another rewriting model could distort player intent.

## Data and interface decisions

### Duration and job inputs

Add nullable, additive `video_jobs` fields:

- `cinematic_profile`: `standard | plus`.
- `target_duration_seconds`: 8, 12 or 15 under policy `cinematics-v2`.
- `duration_policy_version`: `cinematics-v2` for new-policy jobs.
- `submitted_duration_seconds`: the duration actually requested by the adapter.
- `actual_duration_seconds`: provider-reported or media-probed duration, nullable when unavailable.

Use one database resolver for preview and insertion: `resolve_cinematic_policy(p_battle_id uuid)` returns `{ cinematic_profile, target_duration_seconds, duration_policy_version }`. An insert trigger freezes the authoritative result on every production creation path, including the automatic RPC. The resolver uses authoritative battle format and either human's derived `is_subscriber`; it performs no entitlement debit. Restrict execution/writes to the existing trusted service path. An entitlement query error fails job creation for retry, rather than silently mislabelling a paid benefit.

After rollout, policy fields are immutable. Existing jobs with null policy retain their original 8/12 behavior; never reinterpret them using today's subscription status. Rollout enablement should be a server-owned setting read by this resolver, so preview and insertion use the same policy.

Store full generation inputs in a **service-only** `video_job_inputs` table, keyed by `video_job_id`, with `input_version`, `payload`, `payload_hash` and `created_at`. Enable RLS and deny client reads/writes. This avoids adding full prompts, storage paths or internal moderation evidence to participant-readable job rows. Insert once under the existing worker lease before the first provider call; retries reuse the stored payload. Set the existing job `input_payload_hash` to the same canonical hash in that transaction. Preserve old hashes for already-submitted legacy jobs. Reference retention must cover battle/job retention; later takedowns override reuse and cause a safe video failure.

Define in `_shared/cinematic-inputs.ts`:

- `CinematicSide = 'p1' | 'p2'`.
- `StorageAssetRef = { bucket: string; path: string; version: string; moderationRecordId: string | null }`, always produced from trusted server records or a vetted bundled-asset manifest.
- `CinematicFighter`: side, character/bot identity, name, archetype, signature color, art style, appearance version, visual traits, approved signature-item descriptor, and versioned asset references.
- `CinematicMove`: side, complete recorded moderated text, move type, optional recorded composition fields, and moderation provenance.
- `CinematicInputV2`: battle/round IDs, frozen duration policy, two named fighters, two moves or an explicit forfeit, shared situation, `{ winner: CinematicSide | null, isDraw, isKo }`, source provenance, and template version.
- `RecordedCinematicSource`: trusted loaded battle, optional round, locked/frozen moves, the Task 1 job policy, and the Task 2 fighter snapshots. The loader validates that all IDs belong to the same battle before calling the pure builder.
- `buildCinematicInput(source: RecordedCinematicSource): CinematicInputV2`: pure validation and composition.
- `hashCinematicInput(input: CinematicInputV2): Promise<string>`: recursively canonicalize all nested objects; preserve array order. Hash stable paths/content versions, never signed URLs or timestamps generated during signing.

Do not resolve bot winners from a null profile ID alone: `is_draw=false` plus recorded bot victory must produce `winner='p2'`.

### Character and item capture

Extend face-off identity with `appearance_version`, `starter_asset_key`, the existing `vibe/silhouette/era/expression/palette_key` traits, and a snapshot of the equipped signature item's ID, name, description, class, prompt fragment, moderation state and asset reference. Keep the fighter portrait ID/path/version. Resolve these as one consistent appearance version; retry a concurrent edit rather than mixing old artwork with new gear.

Use the same snapshot capture for newly created single battles at their finalized match transition. Historical battles lacking these fields remain supported: prefer existing frozen identity and artwork; use explicitly marked missing metadata rather than silently attaching today's changed item. Where no identity exists, make a one-time legacy snapshot and record that provenance. Do not backfill historical identity as if it were original.

For bots and starter fighters, publish vetted, versioned, provider-accessible equivalents of the artwork the app displays and freeze the chosen asset key/path. Bots lack ordinary character rows. Bundled app `require(...)` assets are not provider URLs.

### References and moves

Define `CinematicReference = { side: CinematicSide; kind: 'fighter' | 'item'; storageRef: StorageAssetRef }` and `ResolvedCinematicReference = CinematicReference & { url: string; referenceIndex: number }`. `resolveCinematicReferences(input: CinematicInputV2, storage: CinematicAssetStore): Promise<ResolvedCinematicReference[]>` consumes a narrow store interface with `isApproved(ref): Promise<boolean>` and `sign(ref, ttlSeconds): Promise<string>`. Recheck approval/takedown status immediately before signing; today's UI helper, which only excludes rejected portraits, is insufficient for provider inputs. Derive image tags from the **final transmitted array**, preserving each reference's owner if another asset is absent.

Use both full-body fighter images as the primary references. Add approved item close-ups where an asset matching the equipped item is available; two fighters plus two items stay within the provider limit. Catalog items and custom items use different storage buckets, and the app sometimes shows bundled item art: publish matching assets before claiming exact item-art parity. Never send unmoderated custom item art.

For new-policy jobs, missing required fighter references produce a retryable preparation failure, then the existing bounded terminal failure/refund path. Do not silently sell a generic text-only clip as a faithful result. A missing optional item close-up is acceptable only when the approved frozen fighter artwork already depicts that item; record the fallback. Legacy jobs keep a clearly recorded compatibility path. This makes video failure independent of battle completion.

Extract `composeCinematicPrompt(input: CinematicInputV2, references: ResolvedCinematicReference[]): string` into `_shared/cinematic-prompt.ts`. Include explicit reference ownership, stable appearance/item instructions, the recorded situation, both complete legal move texts, and fixed outcome instructions. Treat user text as quoted action data, never as instructions that can override identity, safety or the winner. Escape provider reference tokens inside UGC. Do not invent structure for manually authored moves or randomly substitute a bot move.

Use four action beats with duration-proportional pacing:

| Beat | Standard 8 s | Plus 15 s |
| --- | --- | --- |
| Establish both fighters, equipment and scene | 0–1 | 0–2 |
| Player one's submitted action | 1–3 | 2–6 |
| Player two's submitted action/response | 3–5 | 6–10 |
| Interaction and recorded outcome | 5–8 | 10–15 |

Scale the same proportions to a standard 12-second single clip. These are storytelling requests, not frame-accurate guarantees. Express the loser's intended action without depicting its claimed victory as fact. Use a stalemate for draws; a forfeit gets an honest walkover scene or retains Tier 0 when recorded inputs are insufficient. Preserve complete supported move text, including composer v3 and cross-locale text; remove the arbitrary 400-character cut.

## Review focus

1. A player edits appearance/items while a job is queued: video retains the battle's frozen identity (Task 2/3 tests).
2. Player one lacks a reference, or player two is a bot: the remaining reference is never assigned to the wrong fighter (Task 4 tests).
3. Plus expires, the sponsor is standard, or two participants request simultaneously: one shared job retains the correct frozen duration and funding (Task 1/5 tests).
4. A final-round job has only a round UUID, or the round winner differs from the series winner: correct round prompts, outcome and billing are selected (Task 3/5 tests).
5. A provider ignores an item or move despite a valid request: unit tests are insufficient; measured visual acceptance determines release readiness (Task 7).

## Implementation tasks

### Task 1: Persist and enforce the duration policy

**Files:** Create migrations using `rtk yarn supabase:new-migration cinematic_generation_policy`; modify `_shared/video-constants.ts`; create `supabase/tests/cinematic_policy.sql` and `_tests/cinematic_policy_test.ts`.

**Consumes:** Existing `battles`, `video_jobs`, `entitlements`/`entitlements_v2` and shared-job uniqueness rules. **Produces:** resolver, frozen job fields, server rollout setting and service-only `video_job_inputs` schema described above.

- [ ] Add table-driven SQL assertions for standard Bo3=8, standard single=12, either/both Plus=15, bots, canceled-but-unexpired Plus, expired Plus, exhausted allowance, rollout disabled and entitlement lookup failure. Assert no credit/allowance writes from the resolver.
- [ ] Run the tests on an isolated local test database and confirm the new contract is absent before implementing. No reset of a user database.
- [ ] Add additive schema, constrained policy resolution, insert/update enforcement and least-privilege grants. Preserve automatic sponsor/caps and the `registration_generation_guard` added by `20260922163026_social_registration_eligibility.sql`.
- [ ] Verify concurrent duplicate requests yield one shared job; clients cannot forge policy or read/write `video_job_inputs`; legacy null-policy jobs keep 8/12. Run SQL tests and Deno policy tests, then review this task's diff.

### Task 2: Freeze complete fighter identity and equipment

**Files:** Modify `_shared/start-face-off.ts`, `_shared/compose-reveal-payload.ts`, `types/battle.ts`, and `matchmaking/index.ts`; create `_shared/cinematic-identity.ts`, `_shared/cinematic-bundled-assets.ts`, `scripts/publish-cinematic-reference-assets.mjs`, and `_tests/cinematic_identity_test.ts`.

**Consumes:** Authoritative character/item rows and current approved artwork. **Produces:** enriched immutable battle identity for both formats, plus `snapshotCinematicFighter(source): CinematicFighter`.

- [ ] Add failing tests for item/color/name changes after matching, mismatched appearance versions, pending/rejected/taken-down artwork, unapproved custom items, bots, starters and missing legacy snapshot fields. Cover retained references to older artwork when a new portrait is generated.
- [ ] Implement snapshot capture and version consistency checks; include approved item data and stable asset paths, not expiring URLs. Wire the single-format transition without changing Bo3 stats or match rules.
- [ ] Publish and verify server-accessible bot/starter references matching the app artwork. Add approved item references only where catalog/custom asset parity is established.
- [ ] Run `rtk deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/cinematic_identity_test.ts`; verify captured identity remains stable after live character edits in a local fixture, then review the diff.

### Task 3: Build and persist one canonical generation input

**Files:** Create `_shared/cinematic-inputs.ts`, `_tests/cinematic_inputs_test.ts`; modify `_shared/composer-video.ts`, `_shared/compose-tier1-payload.ts`, `_shared/per-round-payload.ts`, `process-video-job/index.ts` and the matching existing composer tests.

**Consumes:** Task 1 job policy and Task 2 identity; recorded round moves/situation/outcome. **Produces:** `CinematicInputV2` and deterministic hash, persisted once in `video_job_inputs`.

- [ ] Add failing tests for complete long/cross-locale moves, manual vs. structured composer moves, draws, bot wins, forfeit, round/series outcome disagreement, and unsupported/missing recorded composer inputs.
- [ ] Add hash assertions: nested item/move/outcome/duration changes alter the hash; object key order and renewed signed URLs do not. This replaces the current shallow JSON replacer behavior.
- [ ] Implement the pure builder and legacy adapter. Store once using the lease and insert-on-conflict semantics; the stored version wins on duplicate preparation. After preparation, stop loading mutable character/prompt data for polling or retries.
- [ ] Run the new Deno tests plus `composer_video_test.ts`. Verify old in-flight jobs stay compatible and no judge input or battle result changes, then review the diff.

### Task 4: Correct reference submission and direct the action

**Files:** Create `_shared/cinematic-prompt.ts`, `_shared/cinematic-references.ts`, `_tests/cinematic_prompt_test.ts`; modify `_shared/providers.ts`, `_tests/providers_test.ts`, and `supabase/ENV_VARS.md`.

**Consumes:** Task 3 frozen inputs. **Produces:** labelled resolved references, deterministic video prompt, correctly serialized provider request and submission metadata.

- [ ] Replace the existing incorrect request-body assertions with failing tests for REST `reference_images`, image tags, both fighters/items, missing-reference ownership, 8/12/15-second requests, 720p reference mode, and explicit rejection of unsupported duration rather than silent clamping.
- [ ] Test quoted prompt injection, embedded image tags, a move's crucial final clause after character 400, both move sequences, draw/forfeit/bot outcomes, and silent/safety instructions.
- [ ] Implement reference resolution, four-beat composition, fresh signing per submission and strict required-reference handling. Keep actual model and submitted duration in the provider response; expose actual duration when available during polling.
- [ ] Run focused Deno tests with Mock/fetch stubs. Update reference configuration documentation and review the diff; do not enable production references at this stage.

### Task 5: Integrate creation, billing, retries and publication

**Files:** Modify `_shared/auto-video.ts`, `request-video-upgrade/index.ts`, `process-video-job/index.ts`, `_shared/video-constants.ts`, `_shared/entitlement-gate.ts` where required; extend `_tests/video_cost_test.ts`, `_tests/video_lease_test.ts`, `_tests/subscription_allowance_test.ts` and replace placeholder-only request tests with behavioral endpoint tests.

**Consumes:** Tasks 1–4. **Produces:** identical policy and inputs across automatic/manual routes, honest preview metadata, stable cost accounting and idempotent refunds.

- [ ] Add integration regressions for every funding source in both formats, duplicate/concurrent requests, lease recovery, signing/storage/provider/moderation failure and timeout. Assert automatic jobs spend neither credits nor allowance, and each failed paid job releases/refunds exactly once.
- [ ] Validate `battle_round_id` belongs to the battle and derive `round_number` server-side. Remove `round_number ?? 1` as a billing/prompt selector for requests that already identify a round.
- [ ] Make legacy single-job refunds follow recorded funding, including `series_end_legacy`; preserve the latest September allowance/restore RPC behavior. Fix only these touched generation paths, not the wider economy.
- [ ] Persist submitted model/duration when accepted and use those for cost estimates, with unknown rates remaining null. Record failed attempts' known costs as well; do not label per-second estimates as provider invoices. Keep actual output duration separate.
- [ ] Retain bounded retry/timeout and lease behavior. Benchmark 15-second latency before changing the five-minute hard timeout. Ensure preparation failures never modify completed battle status; moderation still gates publication.
- [ ] Run relevant Deno/SQL integration tests and confirm same-job retries preserve profile/input hash, refund totals and generation count, then review the diff.

### Task 6: Explain the benefit and duration in the app

**Files:** Modify `utils/monetization.ts`, `utils/resultView.ts`, `utils/walletView.ts`, `app/(battle)/result.tsx`, `app/(profile)/wallet.tsx`, `hooks/useRealtimeBattle.ts`; update `__tests__/videoUpgradeRound.test.ts`, `resultView.test.ts`, `walletSubscriptions.test.tsx`, `walletView.test.ts`.

**Consumes:** Preview/job `cinematic_profile` and `target_duration_seconds`. **Produces:** accurate confirmation, pending/replay labels and Plus benefit copy.

- [ ] Add failing tests for 8/12/15-second labels and all real entitlement method names, including `subscriber_full`, `subscriber_round`, `credit`, and `new_user_grant`.
- [ ] Show expected length plus actual cost before confirmation, e.g. “15-second cinematic · 1 credit” or “15-second cinematic · Included with your allowance.” Keep cost and duration eligibility distinct.
- [ ] Add “Longer, 15-second cinematics” to Plus purchase/active-benefit surfaces only when rollout is enabled. Handle preview-to-confirm eligibility changes by returning an updated quote before charging if duration or cost differs.
- [ ] Read playback labels from the created job, not a current subscription check. Both players see the same result; preserve Tier 0, Reduce Motion and existing mute behavior.
- [ ] Run the focused Jest files and inspect the confirmation/pending/replay views at large text size, then review the diff.

### Task 7: Evaluate visual fidelity and roll out

**Files:** Update `docs/prompt-wars-implementation-concept.md` §§8.1/8.4/8.5/10.2/10.6 and `supabase/ENV_VARS.md`; create `docs/audits/2026-10-08-cinematic-fidelity/README.md` during implementation for evidence.

- [ ] Verify current provider docs and deployed capability/configuration. Run a bounded provider smoke proving accepted reference inputs and a 15-second reference clip before broader sampling.
- [ ] Evaluate 12 recorded battle fixtures in both standard and Plus duration (24 clips): varied archetypes/items, lookalike fighters, both winner sides, bot/starter, manual and structured moves, cross-locale text and a draw. Include asset-missing/forfeit cases in automated failure tests rather than paying to generate unsupported inputs.
- [ ] Have a reviewer compare each clip to the frozen fighter/item art and exact move text. Proposed release gate: 24/24 correct winner/draw, no fighter/item swaps or unsafe publication, at least 22/24 recognizable identities and equipped items, and at least 20/24 with both move ideas recognizable. Record failures, model/version, requested/submitted/actual length, latency and estimated cost. These are proposed gates, not claims of achieved quality.
- [ ] Require actual duration within 0.5 seconds of target for the evaluated clips. If item/move fidelity misses the gate, keep the feature disabled and improve references/prompting; investigate keyframe conditioning as a separate follow-up only if necessary. Do not advertise guaranteed exact motion from an unvalidated generator.
- [ ] Deploy additive schema first, compatible backend next, then client copy. Enable for a small cohort only after visual/safety gates pass; monitor failures, refunds, missing references, duration accuracy and per-model costs before expanding.
- [ ] Roll back by disabling new-policy creation and benefit copy while allowing snapshotted in-flight jobs to finish. Do not remove new columns or rewrite existing inputs during rollback.

## Verification commands and completion criteria

Use Jest for app tests and Deno for Edge Functions. New focused suites must be added before changes; run them red, then green. SQL tests run against an isolated local fixture database using the repository's existing SQL harness, without a destructive reset. `scripts/test-composer-db.py` accepts a SQL suite name and rolls the migration/test transaction back; first verify that its named Docker target is the intended local fixture. Keep remote suites gated by `PROMPT_WARS_REMOTE_FUNCTION_TESTS=1`.

Representative existing regression commands:

```sh
rtk python3 scripts/test-composer-db.py cinematic_policy.sql
rtk yarn test --runInBand __tests__/videoUpgradeRound.test.ts __tests__/resultView.test.ts __tests__/walletSubscriptions.test.tsx __tests__/walletView.test.ts
rtk deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/providers_test.ts supabase/functions/_tests/composer_video_test.ts supabase/functions/_tests/video_cost_test.ts supabase/functions/_tests/video_lease_test.ts supabase/functions/_tests/subscription_allowance_test.ts supabase/functions/_tests/request_video_upgrade_test.ts
```

Done means both requested capabilities pass behavioral and visual checks, every generation route uses the shared contracts, billing remains in round-units, and failed videos leave a completed Tier 0 battle. Passing request-body tests alone does not establish character or move fidelity.

## Cost and delivery notes

At an unchanged model/per-second rate, 15 seconds uses 1.875× the generation seconds of an 8-second round and 1.25× those of a 12-second single. Reference-model pricing, latency and failure rates also matter; record configured rates and measured acceptance results before enabling the benefit. Preserve existing price/allowance limits initially and evaluate the effect rather than silently charging additional credits.

Implement policy and identity capture independently, then converge on the canonical input contract before provider/worker integration. UI work can proceed against the agreed preview/job types. A fresh review should concentrate on immutable inputs, round selection, RLS and refunds before rollout.

Planning validation: reviewed current working files and official provider documentation. No application code, schema, configuration or production state was changed, and no test or generation success is claimed by this document.
