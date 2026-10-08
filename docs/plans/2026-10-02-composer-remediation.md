# Prompt Wars — composer remediation implementation

Status: backend deployment complete, iOS 1.3.3 (16) available in internal TestFlight, and Android 1.3.3 (7) available as a verified internal APK with installation/startup evidence. Android7 contains the verified composer keyboard correction and supersedes Android6. Binding specification: the user's approved plan in this task, 2 October 2026. This document records implementation and delivery evidence; remaining native accessibility/device checks and separate human/model quality work are explicitly unverified.

## Decisions

- Ranked remains experience 2 / current ideas-first judge. No restored rollout/calibration gate; calibration and the 12-person pilot are separate later quality work.
- Situation → action (sets move type) → intention → exact preview → confirmation.
- Nine initially visible authored actions, grouped Attack/Defense/Finisher, three each. Selecting one collapses the entire chooser. No extra type-picker step in Build.
- 135 situation-specific actions and 405 intentions, 15 scenes × 3 types × 3 actions × 3 intentions; offline ready.
- Automatic AI only after entering Build: three free per-type banks, grouped generation, explicit application of incoming choices. Write alone and round opening do not generate v2 suggestions.
- Existing per-type free allowance, explicit single-type rerolls, prices, idempotency, limits and refunds remain. No automatic spending.
- Preserve asynchronous deadlines, combat/rating, old pinned series and current obsidian/gold/lavender design.
- Deliver backend fixes first, then new iOS TestFlight build and Android test build. No public store release or paid judge calibration.

## Task 1 — moderation, finance and batch suggestion API

Owner: suggestions implementer. Own moderation.ts, suggestion-service.ts, move-suggestions.ts, generate/prefetch-move-suggestions, suggestion finance migration and relevant Deno/SQL/concurrency tests.

- Real moderation units: title (3–48), action (5–240), intent (5–180), body and each joined pair (20–800). Existing moderate(text) remains prompt-compatible. Deduplicate classifier inputs after per-role validation; never aggregate repeated alternatives into one string. All three v2 cards must pass.
- Batch classifier where supported; otherwise maximum four concurrent requests. Overall moderation deadline 60 seconds including fallback. Missing/partial/timed-out responses fail closed. Lease heartbeat spans generation, moderation, finalization. Audit unit kind/reason without analytics text.
- Delivery success requires the owner's round still open and unlocked at DB publication, using clock_timestamp after locks. Late paid results refund once with prompt_locked_before_delivery or round_closed_before_delivery; late free results fail without money movement. Earlier successful replay remains successful even after closing.
- Consistent lock order: battle → round → suggestion serialization → operation → wallet. Sweeper cannot hold operation locks before battle. Current worker token required for every finalization/refund; expired worker cannot refund successor success.
- Add ensure_free move_types (1–3 unique types), mutually exclusive with move_type. Batch returns results with per-type statuses; existing single shape unchanged. Contract 3 stays. Reroll is single-type only. Source forced to player; claims remain separate, grouped provider call. Keep 30/hour and 90/day attempt units: fresh three-bank batch uses three, cache/pending zero.
- Do not edit start-face-off/battle-advance (bot owner removes automatic v2 prefetch calls there). Update prefetch endpoint to skip v2 as defense in depth.
- Required evidence: RED/GREEN real moderation regression, short fragments, paired harmful meaning, timeout/partial results; endpoint legacy/batch/free-only tests; rollback SQL + multi-connection races for delivery/submit/deadline/sweeper/fencing/wallet.

## Task 2 — private bot policy

Owner: bot implementer. Own private bot migrations/activation, resolver integration, series creation/version propagation, start-face-off/battle-advance prefetch guard, relevant tests.

- Immutable bot_policy_version: existing series/queues/invitations version 1, new experience-2 Bo3 assignments version 2 only after compatible resolver deployment. Legacy-experience and single-format rows retain policy 1. Include series initially waiting for humans.
- Private random series seed/catalog version; append-only 45-tactic catalog (one per type and situation), private immutable per-round choice with copied text/type/context.
- Create choice atomically when opening each round, before accepting human prompt. Human-to-bot fallback reuses prepared choice. No public-data-only selection and no human prompt input. Retries reuse, never reroll. Missing policy-2 choice is recoverable integrity error, not public-generator fallback.
- Client roles cannot read private tables/functions; RLS and service grants. Never ship bot catalog/seed/hidden choice in app or realtime. Existing policy-1 behavior preserved; only resolved text enters existing frozen reveal inputs.
- Deploy additive schema default1 → compatible consumers → activation for newly assigned experience-2 Bo3 series. Preserve existing scene catalog and snapshots.
- Guard existing v2 round-creation prefetch invocation; legacy retained.
- Test first/next rounds, bot fallback, retries/concurrent opening, secrecy, independent human text, immutable catalogs, legacy.

## Task 3 — mobile composition

Owner: mobile implementer. Own prompt-entry, composer panel/editor/situation components, promptComposer state/hook, battleDrafts/useBattleDraft, useMoveSuggestions/new bank coordinator, tutorial, native fixture and relevant Jest tests.

- Root supplies utils/authoredMoveCatalog.ts + utils/promptSituations.ts. APIs: getSituationAffordances(situation): {id,label}[]; getFallbackMoveSuggestions({moveType,situation}): MoveSuggestion[]; getAllFallbackMoveSuggestions(situation): ComposerActionSuggestion[] (all nine).
- Root extends utils/battles.ts: ComposerActionSuggestion = MoveSuggestion & {moveType: MoveType; source: 'authored'|'ai'; affordanceIds?: string[]}; ensureFreeMoveSuggestionBanks(battleId, round, moveTypes): Promise<Partial<Record<MoveType,MoveSuggestionResult>>>. Existing single APIs stay.
- Scene banner/full snapshot plus optional single-select local affordance filter. All ideas + own action always available. Filtering never changes composition or generates/spends. Unknown/untagged old AI remains under All ideas; paid set never hidden by filter.
- Nine rows visible by default; group labels not accordion/picker. Select atomically sets type + action, collapses whole chooser to selected + Change. Three compatible intentions. Change merely expands; new choice starts replacement. Own action/freestyle have explicit compact type control when needed. One mounted exact editor; deterministic action + single space + intent.
- moveType and authoring-origin lineage belong inside composer and undo/replacement snapshots. Draft serialization version 3; migrate stored text/type without fabricated prose parsing. Cancel/Undo include type; incomplete edits block stale preview submission. Keep queued storage/tombstones.
- Build entry automatically ensures all three banks after draft/preference restore; Write alone does not. Cache first, incoming explicitly applied. Each type's journal/recovery survives selecting another type. Single-type paid button only after chosen action/type; show all three purchased results separately.
- Confirmation shows exact prompt/type in bounded scroll with reachable controls. Update v2 tutorial Tap/Finisher and completeness instead of length. Quiet draft status, explicit errors; keep price disclosures.
- Obsidian/gold/lavender existing assets, Barlow headings/system16 body, 16pt gutters,20pt sections,48pt targets, scalable text. One keyboard/safe-area owner; no input remount. Native accessible roles/selection, screen-reader focus, Reduced Motion.
- Root owns BattleAppealPanel/useBattleAppeal and telemetry API/backend event additions; coordinate needed event/origin names rather than editing root files.

## Task 4 — integration, catalogue, analytics and release

Owner: root. Own authored catalog, utils/promptSituations.ts, utils/battles.ts public additions, origin SQL/submit endpoint, composer-events/telemetry allowlist, appeal UI, docs, review and deployment.

- Catalog pure and bundled, keyed by scene id/catalog version. Stable ids, three type-specific actions and three distinct intentions each; 2–3 real affordances. No hidden prose transformation. AI tags optional and validated server-side; not part of judge input.
- authoring_origin = builder/manual/mixed/unknown, optional declared analytics at accepted submit; old clients unknown. Never feed it to judge. Add filter/action/new-set events without prompt text.
- Appeal loading/ready/unavailable/error are distinct, read error disables submit;409 refreshes status. Independent reviewer requirements untouched.
- Update concept/design/release evidence. Keep unrelated dirty files, no resets.
- Tests: targeted Jest/Deno/SQL, full appropriate regressions, independent code review, app archive import closure, native widths/keyboard/readers and live full round where safe/available. Record unavailable checks honestly.
- Backend before new app; preserve auth gates. Read-only before/after suggestion-operation aggregates, provider cost/failure/refund evidence. Use existing emergency switch for an actual financial incident.
- EAS next production iOS build → TestFlight internal Apple processing/availability; Android preview APK for QA only. Human calibration/pilot later, no paid run here.

## Execution ledger

- The checkout already contained extensive uncommitted work. The source baseline is `/tmp/prompt-wars-remediation-20261002-baseline` (1,075 files). Unrelated work was preserved; no reset, stash or commit was performed.
- The bundled Supabase CLI 2.98.2 works. The installed Homebrew version exits with SIGKILL. Local SQL tests use the existing Docker stack, rolled-back transactions and temporary concurrency clusters; no database reset was performed.
- The catalogue contains 135 unique actions and 405 valid pairs. The three deliberately shared pure modules are included in the app archive; private bot and other backend code are excluded.
- Root tests covered optional origin recording, retry preservation, legacy unknown values, service-only grants, batch client responses and appeal read errors/409 recovery. Independent review found no unresolved issue in these changes.
- Backend review found and resolved legacy single prefetch compatibility, lease renewal overlapping finalization, incomplete classifier output, and rate-limit accounting for retries from earlier windows. Mobile review found and resolved late free results competing with paid results, separate paid-bank presentation, lost partial-failure feedback, panel ownership and native selection scrolling.
- Final full backend suite: 473 Deno tests and 59 steps passed; seven remote tests remained ignored. SQL and ten suggestion concurrency scenarios passed, as did eight-connection bot races. Evidence is in the task reports above.
- Full app regression: 222 suites / 1,778 tests passed. Two subsequent coordinator regressions and the native measurement correction passed the affected 42-test suite; TypeScript and scoped lint passed. Native acceptance is recorded separately and is not inferred from Jest.
- Real native practice uncovered bot-won completed rounds labelled Pending. The shared outcome helper now falls back to the frozen `judge_payload.combat.winner` when the winner profile is absent; it never compares scores. Three regression paths failed first, then 88 tests / four suites, TypeScript and scoped lint passed. The corrected final labels were verified by reopening the same completed series.

### Backend deployment

On 2 October the compatible migrations `20261002130316`, `20261002130317` and `20261002130331` deployed first, followed by 24 affected Edge Functions. Only then did `20261002130332` activate bot policy 2 for new experience-2 Bo3 series. Readback confirmed all functions active, four migration rows, the new default and private-table RLS with no client read grants or Realtime publication. Gateway JWT settings match previous deployment evidence.

All 48 negative-auth requests were rejected. Some existing handlers return HTTP 500 for Unauthorized; the disabled development endpoint returns 404. These responses are not proof of an authenticated game. Production aggregates before deployment contained ten failed suggestion operations, including one paid credit with its refund. The initial post-deployment sample contained no new operations.

Subsequently one real Practice vs Bot Bo3 completed in two rounds. Both accepted moves retained their type and builder origin; private policy2 choices existed for both rounds. The judge used the current ideas policy and real grok-4.3 runs, without mock assistance. Six free operations comprised three successes and three moderation rejections, eight attempts including retries, zero credits/refunds/expired leases. Successful operations averaged 15.31 seconds. This small sample establishes functioning real delivery, not a general success-rate claim. One initial submit failed without a captured transport code, preserved its draft/type and succeeded on one retry after reload; no source fix is claimed for that unclassified/transient event.

### Client delivery

The frozen iOS archive contains 503 files that matched the checkout at upload. Android7 intentionally differs in the later Android-only keyboard correction described below. SHA-256 manifests and exclusion checks are saved under `docs/audits/2026-10-02-composer-remediation`. The Android preview profile now selects the production EAS environment because that environment contains the required public app/backend configuration; distribution remains internal APK.

- Final iOS: build `c60b6c40-b019-46d6-bf93-b88e3200fd33`, version 1.3.3 (16). The IPA passed identity, bundle and strict signature verification. Submission `d50ee6c3-b4c8-4273-b088-007d281c44e6` finished at 15:48:55 UTC; fresh Apple readback at 15:50:28 confirmed `VALID`, `IN_BETA_TESTING`, `expired=false` and matching build/submission IDs. Internal TestFlight only, existing groups requested; no external/public App Review submission.
- Final Android7: build `bc22e58f-7250-4796-94e8-4489e3e80642`, created once at 16:26:14 UTC and finished at 17:40:34 UTC, version 1.3.3 (7), internal preview APK. All 503 archived files match the checkout; only conditional Android keyboard padding differs from iOS16/Android6. Native fingerprint is unchanged; the explicit source manifest/diff and final readback record the JavaScript fix. The 138,992,353-byte APK has SHA-256 `f94aa5520bae299c28ceca16cf1d15a2252ab418c32bbaa36078c228cf81187d`. ZIP, identity, backend/bundle markers, cryptographic signature and direct compiled keyboard-branch checks passed. The exact APK updated version6 and cold-launched successfully to signed-out UI, with native keyboard input and no app-process fatal/React Native JS error.
- Superseded Android6: build `6a6caf8c-1848-43c1-9f9d-11be150105e2`, version 1.3.3 (versionCode 6), preview/internal APK, finished at 15:50:01 UTC. It passed artifact/startup checks before native fixture QA exposed the composer footer/keyboard overlap. Android7 replaces it with the verified correction. No Google Play submission.
- Intermediate iOS15 passed IPA/signature checks, but its queued submission `5d810af7-757c-4a34-8c5c-815a438a154c` was canceled to include the native-discovered result-label fix. Intermediate Android5 remains separately identified. They are not the final remediation artifacts.

Each replacement build was requested once. iOS16 delivery and Android7 artifact/install/startup checks are verified. The original iOS16/Android6 archives have 503 identical files; Android7 has its own zero-drift source manifest and one explicit Android-only difference. Preview increments Android versionCode so test updates are distinguishable. Native iOS evidence covers actual 402/375 layouts, increased text/Reduced Motion, no-typing composition, confirmation/cancel, draft recovery and a complete live series. Remaining keyboard/reader/width limitations are stated in the native audit. EAS Simulator availability returned false for this account; no remote session was started. A disposable local Android runtime supplied the additional checks below. Human calibration and the 12-person pilot remain a separate, unperformed quality phase.

### Android keyboard acceptance follow-up

The disposable API35 emulator exposed the fixed composer footer behind the IME under edge-to-edge. A plain Android height behavior fixed coverage but retained a 268 px gap after hiding. Final code uses conditional Android padding only while the keyboard is visible, retaining the existing iOS padding and web/default behavior. Three actual native show/hide cycles restored identical geometry and retained the 97-character prompt; native Cancel/Undo restored type and text. The unchanged mounted editor is covered by 63 focused tests / 8 suites, TypeScript/scoped lint, independent review and 20 workspace tests (overlapping, not additive counts). Android7 contains the verified one-file runtime correction. Its archive and emitted Hermes branch were compared explicitly to iOS16/Android6; identical cross-platform source is not claimed.

Further native fixture evidence covers 320 dp with 130% text, exact 375/390/402 dp layout checks, 800 dp tablet-sized action selection, an exact 800-character editor/confirmation, and paid-bank filter/view stability. At 320 dp the fixture needed ordinary scrolling to reveal its caret; the production responsive editor was not independently exercised there. No purchase or submission occurred in these fixtures. Signed release startup is a separate check; TalkBack, physical hardware and authenticated Android release-composer coverage remain outstanding.
