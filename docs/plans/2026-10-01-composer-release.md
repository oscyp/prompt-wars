# Prompt composer release and reversal

Date: 2026-10-01. The later user decision supersedes the original staged/default-off rollout: remove the six composer mode/approval/AI/purchase flags, enable composer availability in all modes by default, apply migrations and deploy the compatible implementation. Automatic primary-calibration blocking of new ranked assignments is also removed. Existing legacy version pinning, purchase confirmation, moderation, independent appeal calibration and fallback/rating protections remain.

This runbook states the authorized procedure and existing evidence. It does not by itself certify a hosted deployment. Record actual migration/function verification in the execution ledger. No real judge calibration, independent label review, native acceptance or 12-person pilot is inferred from activation.

## Verification status

| Requirement | Status and evidence |
| --- | --- |
| Versioned composer, immutable shared context and legacy compatibility | Implemented; automated coverage and local transactional SQL checks. See the [execution plan](2026-10-01-prompt-composer-implementation.md). |
| Mobile authoring, draft and explicit purchase recovery | Focused Jest: 16 suites / 120 tests passed; owned-file ESLint and app TypeScript passed. [Mobile report](2026-10-01-composer-mobile-report.md). |
| Full app regression checks | Final root verification after persisted Undo and tap-confirmation fixes: 215 Jest suites / 1,749 tests passed; `yarn tsc --noEmit` passed. Log `/tmp/prompt-wars-composer-jest-final.log`. |
| Browser component geometry | Five widths (320/375/390/402/768) had no document overflow or interactive target below 48×48 in Build; ready/Write fixture states inspected. [Visual checks](2026-10-01-composer-visual-checks.md). Browser click timeouts mean this is not completed interaction QA. |
| Suggestion finance, lease fencing, moderation and recovery | 33 Deno tests / 5 HTTP steps passed; SQL finance/RLS checks passed in a rollback transaction; four real concurrent local database scenarios passed. [Suggestions report](2026-10-01-composer-suggestions-report.md). |
| Versioned judge and evaluation logic | Final full local Deno suite: 457 tests / 49 steps passed, 0 failed, 7 remote tests ignored; log `/tmp/prompt-wars-composer-deno-final.log`. Offline export contains 240 candidates. [Judge report](2026-10-01-composer-judge-report.md). These are code checks, not real-model evidence. |
| Context, suggestion, telemetry and calibration SQL | PASS in a local transaction rolled back after assertions; log `/tmp/prompt-wars-composer-db-test.log`. Includes positive/negative telemetry reads, denied client writes and monotonic active duration. Existing database contents were preserved. |
| Independent human review of evaluation labels | **NOT RUN.** Shipped labels are `authored_candidate`, not human-reviewed gold. |
| Paid actual-model tuning and holdout calibration | **NOT RUN.** No passing primary/appeal calibration is asserted. |
| iOS/Android native geometry, keyboard and accessibility | **NOT RUN** for this composer change. Browser fixtures and Jest cannot substitute. Matrix below. |
| Twelve-person pilot | **NOT RUN.** No completion, ownership or retention result is inferred from tests. |
| Previous ranked activation gate | **SUPERSEDED by user decision.** No composer approval flag or primary-calibration lookup blocks new ranked assignment. Independent appeal checks remain. |
| Hosted migrations and function deployment | **COMPLETE:** four migrations applied, all 19 affected functions deployed and hosted versions/JWT settings verified. Schema, cron, grants and 38 bounded negative-auth checks recorded in the [deployment ledger](../deployments/2026-10-01-composer-default-on.md). |
| Default-on follow-up | Full verification: 216 Jest suites / 1,750 tests, 454 Deno tests / 56 steps (seven remote tests ignored), TypeScript and local rollback SQL suites passed. Historical counts above preceded flag removal and the archive regression test. |

Temporary `/tmp` logs are local execution evidence, not durable release artifacts. Before a release, archive relevant sanitized logs, native captures, build IDs, model run IDs, review artifacts and approval in the release record.

## Default availability and remaining configuration

New practice/tutorial, casual/friend and ranked series default to composer experience 2. AI generation and explicit paid rerolls are available without composer feature secrets; configured providers/moderation, allowances, price/balance, rate limits and client contract 3 still apply. Old series, queues, invitations and request retries keep their stored version. Paid availability never means automatic spending.

The six removed variables have no effect even if old hosted values remain: `PROMPT_COMPOSER_PRACTICE_ENABLED`, `PROMPT_COMPOSER_CASUAL_ENABLED`, `PROMPT_COMPOSER_RANKED_ENABLED`, `PROMPT_COMPOSER_RANKED_APPROVED`, `PROMPT_COMPOSER_AI_ENABLED`, and `PROMPT_SUGGESTIONS_PAID_ENABLED`. The removed primary gate also makes `PROMPT_COMPOSER_CALIBRATION_MAX_AGE_HOURS` obsolete. They are not activation or reversal controls.

The existing operational switches remain: `SUGGESTIONS_AI_DISABLED=true` stops new generation and new paid reservations, including legacy; false/unset permits them. `SUGGESTIONS_PREFETCH_ENABLED=0` disables prefetch only (default 1). Exact-operation recovery and refunds remain available. Existing `COMBAT_V2_ENABLED`, appeal and social-auth/eligibility settings are independent and unchanged. See [ENV_VARS.md](../../supabase/ENV_VARS.md); no provider credential belongs in `EXPO_PUBLIC_*`.

## Authorized deployment order

1. Compare hosted migration history with the shared checkout and inventory all pending prerequisite files. The current checkout contains other September auth/payment/video work, so an unfiltered migration push may include more than the four composer files. The [dependency audit](2026-10-01-composer-deployment-audit.md) identifies function bundles and schema prerequisites; preserve unrelated release settings and database contents.
2. Apply missing prerequisites and the four additive composer migrations in timestamp order: `20261001190848_composer_suggestion_operations.sql`, `20261001191303_composer_judge_calibration.sql`, `20261001191306_prompt_composer_context.sql`, `20261001191732_composer_telemetry.sql`. Verify service-only grants, catalogue, immutable snapshots and the `expire-suggestion-operations` SQL cron without resetting the database.
3. Deploy the complete compatible function set from the audit. Drain previous unfenced suggestion workers before accepting new operations. Deploy shared consumers and resolution/appeal/video handlers before default-on matchmaking/tutorial can publish new v2 battles. Preserve each endpoint's authorization contract.
4. Verify server deployment and schema together. Contract-3 clients can start new v2 series; old clients receive update-required for new composer interactions while compatible legacy resumes remain supported. This server deployment does not itself distribute a new native app binary.
5. Confirm all modes use the new default, AI/free fallback works, paid purchases remain explicit/idempotent, and completed-operation recovery/refunds are reachable. Use bounded, authorized smoke checks; do not turn on unrelated features or run paid calibration as a side effect.
6. Record actual hosted migration versions, function deployment results, checks and any limitation. Continue native, human judge and pilot validation honestly; their previous NOT RUN status is not rewritten by the user-authorized deployment.

## Primary calibration policy and retained protections

The initial implementation added `composerRankedGate` after review found that the original enable/approval flags alone did not prove model evidence. The subsequent user instruction explicitly removes that runtime gate and the flags so all modes are available by default. The helper and its dedicated gate tests are removed; new ranked creation no longer queries calibration records. This section supersedes the original activation instructions preserved in historical task reports.

The corpus, expected draws, actual-model provenance, reviewed-label import, evaluator, explicit paid CLI and durable calibration records remain. A failed or unperformed primary evaluation does not prevent new ranked assignment. It also does not become a passing result. Independent appeals retain their own enabled state, exact-policy/model/locale/freshness requirements and independent no-fallback reviewer. Existing primary provider fallback and mock-assisted ranked exhibition/reward protections remain in effect.

Only judge policy is frozen for a series; the primary model follows server configuration. Human-review artifacts are validated for completeness and case digests, not externally authenticated as human work. These limitations remain visible when interpreting subsequent quality evidence.

## Real judge review and calibration — NOT RUN

Use the [judge report](2026-10-01-composer-judge-report.md) for the safe offline export and review artifact schema. The corpus contains 160 tuning / 80 holdout cases from separate scenario families. A reviewer must assess the actual text and explicit expected winner/draw, return a rationale and bind the decision to the exported digest. Do not relabel the shipped candidates as reviewed without performing that work, and do not tune to holdout failures.

After a separately approved cost budget, configure the exact primary model and credentials, run tuning, then a frozen reviewed holdout. The CLI requires `--run-paid`, `--max-calls=N` and can load `--review-file=...`; default execution is an offline export. Each case uses 6–9 calls across candidate, legacy baseline and swapped positions: the 80-case holdout needs up to 720 calls. A call ceiling is not a dollar ceiling. Preserve actual model IDs, fallback status, cost completeness, dataset version, scores and gate results.

A passing quality evaluation requires these holdout gates: at least 90% accuracy including expected draws; signed verbosity advantage at most 1/60 separately for PL and EN; swapped outcomes and per-player scores within one aggregate point; equivalent locale/identical-text comparisons draw within one point; draw/KO rate changes at most five percentage points; median aggregate-gap change at most 20%; complete independently reviewed coverage and no fallback in candidate/baseline/swapped calls. These rates describe paired offline samples, not real player behavior.

Calibration evidence is stored in `judge_calibration_runs`; independent appeal availability still reads eligible records. For long evaluation, use the explicit CLI `--persist` option with `--run-paid`, a reviewed artifact, a call budget and existing Supabase service credentials. Database configuration is validated before provider spending. Both CLI and endpoint recompute the same evidence record; complete passing holdouts can persist passed, while incomplete/budget-stopped/tuning/unreviewed/failed runs persist failed and exit nonzero. The local report is saved before the database write, and persistence failure fails the command. No database client or write is created for default/offline runs. The synchronous endpoint remains available but can exceed its hosting timeout; CLI persistence removes that dependency.

Example for a future separately authorized run, **not executed in this task**:

```sh
rtk proxy deno run --config supabase/functions/deno.json --allow-read --allow-write=/tmp --allow-env --allow-net supabase/functions/evaluation/evaluate-composer-judge.ts --split=holdout --review-file=/absolute/path/reviewed-holdout.json --run-paid --max-calls=720 --persist --out=/tmp/prompt-wars-reviewed-holdout.json
```

Archive the printed persisted run ID and the local report, and independently confirm exact model/policy/gates before describing the evaluation as passed. A newer failed primary attempt no longer blocks ranked creation. A distinct appeal model still needs its own eligible exact-policy evidence; failed, incomplete or local-only results cannot satisfy that independent-review requirement.

## Native QA matrix — all NOT RUN

Record the native build/commit, OS/device, point dimensions, font scale, reader/motion setting, outcome and capture for each row. The isolated web fixture is component evidence only and has no live purchase/battle calls.

| Platform and viewport | Required checks | Status |
| --- | --- | --- |
| iOS 320-point compact viewport | Default/largest supported text, wrapping selections, reachable lock-in, software keyboard/caret, full context access | NOT RUN |
| iOS 375-point viewport | Same checks plus hardware keyboard, focus restoration and portrait/landscape where supported | NOT RUN |
| iOS 390-point viewport | All composer states, keyboard transitions, VoiceOver order/selected states/confirmation, Reduced Motion | NOT RUN |
| iOS 402-point viewport | Long PL/EN/non-Latin prose, maximum text scaling, detached/replace/cancel/undo and pending/error states | NOT RUN |
| iPad / tablet | Supported orientation/size changes, large text, hardware keyboard, reachable actions and preserved editor/caret | NOT RUN |
| Android 320/375/390/402 logical-point equivalents | Default/largest text and display scaling, IME resize/caret, wrapping, Back behavior and TalkBack confirmation | NOT RUN |
| Android tablet | Supported rotations/resizing, software/hardware keyboard, TalkBack, reduced motion/animation settings | NOT RUN |

Device dimensions may need a simulator/custom configuration; record measured dimensions rather than labelling an approximate device as an exact width. Test every state: Build incomplete/ready, custom fields, Write, detached, replacement/cancel/Undo, generating, new set available, offline/error, unknown/changed price, insufficient funds, uncertain purchase and draft recovery. Verify 48-point targets, focusable labels, no colour-only state and no horizontal text clipping.

## End-to-end acceptance and pilot — NOT RUN on native

- Complete a move without typing, mixed suggested/custom moves and full manual prose. Switch modes/moves and background/restore without lost draft; confirm incomplete edits cannot submit old text. Test legacy draft migration, account switch, round transition and completed/discarded draft tombstones.
- With free allowance used or AI unavailable, keep authored drafting usable. Verify automatic retries spend nothing; late AI requires explicit application. Unknown price blocks purchase only; a changed price rejects before debit and refreshes the displayed offer.
- Interrupt a paid response, restart the app and recover the same operation/key/price. Force provider/moderation failure and verify one refund; expire a lease, allow a successor and confirm stale writes/refunds cannot alter its result. Verify no new paid operation is allowed while the journal outcome is unknown.
- Run the full shared-context path through all three rounds, bot retries, human hidden-prompt privacy, resolved history, judge explanation, appeal and optional video. No result may wait for video. Review moves and video must use recorded prompts/situation/outcome; a current human opponent's hidden text must never appear during authoring.
- Verify new assignments in every mode default to v2 without composer flag or calibration lookup, while pinned legacy series complete unchanged. Exercise the remaining emergency generation/prefetch switches, purchase recovery/refunds, client-contract errors, both legacy formats and participant/outsider RLS. Independent appeal requests still reject missing/failed/wrong-model calibration.

Recruit 12 representative players for the pilot only after the native acceptance pass. Record at least 10/12 completing a round without assistance, at least 9/12 rating authorship at least 4/5, and zero lost drafts or unintended/duplicate spending. Report raw counts and failures, not an invented aggregate. Milestone telemetry records focused foreground duration and allowlisted events only; no prompt text or keystrokes. Verify result-explanation and next-battle events, and interpret deduplicated milestones separately from tap frequency. **Pilot execution and these thresholds remain NOT RUN.**

## Reversal and operations

The removed composer variables cannot withdraw availability. Stopping new v2 assignment requires a compatible code change/deployment. Keep immutable catalogue/snapshots/policies and v2-capable handlers for assigned series and invitations; never roll back to code that cannot resolve them. Do not downgrade live series or remove operation/ledger evidence.

For a suggestion incident, `SUGGESTIONS_AI_DISABLED=true` stops new generation and new paid reservations; `SUGGESTIONS_PREFETCH_ENABLED=0` stops prefetch. These are the retained emergency controls. Keep exact-operation recovery and lease/refund cleanup running. Free authored choices and manual writing remain available. Restore normal generation after affected operations and ledger rows are reconciled.

Observe pending/failed operations, lease age, refunds, provider fallback, context/version errors, submission failures and lost-draft reports. Failed-generation provider costs are retained in the private operation ledger; the current daily provider-cost view mainly reflects successful suggestion rows and is not a complete incident cost report. Preserve private records for reconciliation. Default availability does not erase failures, outstanding human/native validation or known limits.
