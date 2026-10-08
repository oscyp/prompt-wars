# Three-decision composer backend verification

This record covers local implementation, six bounded real xAI smoke requests, and the selective backend deployment on October 7, 2026. Native client acceptance and EAS delivery are recorded separately in the [client delivery ledger](../release/README.md).

## Implemented contract

- `generate-move-suggestions` accepts optional `composition_version: 3`; the persisted operation determines retry generation format. Existing `structureVersion: 2`, title/body/action/intention fields and client contract 3 remain compatible. New banks include `compositionVersion: 3` and three `approachHints` per intention.
- A single `ensure_free` can include `suggestion_set_id` to enrich the exact owned cached bank. Original purchase delivery/price/status remain intact. `composition_status` separately reports `pending`, `ready` or `failed`. Batch/purchased requests cannot use this parameter.
- `complete-move-suggestion` accepts `target: intent | approach`, explicit action text, optional intention for Approach, and the existing battle/round/type context. It authenticates the eligible participant and reads fighter/situation from the server. Results remain nested under `data.result`; worker lease tokens are private.
- The SQL completion ledger owns the six delivered adaptations per round, three attempts per context, shared hourly/daily attempt limits, lease fencing and late-delivery rejection. The completion endpoint never calls wallet functions.
- Complete banks moderate each fragment, legacy pair and final triple. Custom prefixes may be individually shorter than a full prompt; all custom final triples still require 20–800 characters. Mixed persisted-version groups start concurrently so one group does not wait through another group's generation without renewing its lease.

## Automated verification

- Final complete local Deno run: **487 passed, 59 steps, 0 failed, 7 ignored**. Remote integration remained opt-in and was not enabled. Log: `/tmp/composer-v3-deno-tests-final.log`.
- Repeated after the occurrence-telemetry endpoint/parser changes: **487 passed, 59 steps, 0 failed, 7 ignored**. Log: `/tmp/composer-v3-deno-tests-post-telemetry.log`. This run verifies the available test suite, not untested live telemetry delivery.
- Scoped Deno lint passed with `no-import-prefix` excluded to preserve the repository's existing pinned URL-import convention. Four new test-only `require-await` warnings were corrected. No production lint warning was suppressed.
- New regressions cover 81 complete paths, stable IDs, duplicate/oversized approaches, partial malformed type output, every triple's moderation, unsafe joined meaning, exact purchased-bank enrichment, eligible participant and authoritative context checks, lease secrecy, replay without another generation, short custom fragments, and concurrent mixed-version groups.
- SQL tests and concurrent connection checks are recorded by the migration owner, separately from this Edge Function report.

## Real provider evidence and limitations

All calls used existing server-only credentials without logging them. No battle, wallet, production operation or player content was read or written. Synthetic fictional context was supplied directly to the local production provider adapters. The classifier transport was real OpenAI moderation.

| Call | Generation | End-to-end | Result |
| --- | ---: | ---: | --- |
| Initial three-type bank | 33.657 s | 40.307 s | 81 valid paths; 17/243 moderation units flagged |
| Custom action completion | 7.065 s | 9.684 s | 9 paths; 22/22 units approved |
| Custom intention completion | 1.860 s | 3.840 s | 3 paths; 8/8 units approved |
| Initial bank enrichment | — | 34.927 s | `malformed_response`; cause not captured sufficiently to identify |
| Safer three-type bank | 36.362 s | 40.723 s | 81 valid paths; 5/243 units still flagged |
| Synthetic safe bank enrichment | 10.388 s | 12.976 s | 27 paths; 81/81 units approved |

Between the first and second bank checks, the generator instructions were tightened toward fictional positional play without body strikes, dangerous restraints, sabotage or injurious use of props. Moderation rules and thresholds were unchanged. Flagged banks fail closed; old successfully delivered purchases remain successful if their optional enrichment fails.

The two successful complete-tree generations are within the new 45-second generation limit, but approximately 40-second total latency confirms the importance of the explicit starter option after eight seconds. Remaining flags mean this is **not** proof of reliable AI-bank delivery or model quality. One successful enrichment does not erase the earlier malformed response. There is no statistical latency or availability conclusion from this six-call sample.

The initial bank's 17 held units were 12 triples, three pairs, one action and one Approach. All 17 had an `illicit/violent` flag; 12 additionally had `illicit`, and one also had `violence`. The safer bank's five held units were one intention and one Approach with `illicit/violent`, and three triples with `violence`. These were classifier decisions, not length errors, missing classifications or a transport timeout. The existing policy preserves provider flags for illicit categories and requires at least 0.85 for a flagged violence category. This policy was not introduced or altered by the composer work.

The synthetic smoke deliberately did not retain generated prose, category scores or unit-to-type indices. Consequently, the exact per-type delivery count cannot be reconstructed from its sanitized output; neither zero delivery nor successful delivery of any named type has been established. Depending on where the flags fell, zero to two of three banks could pass. It would be incorrect to label the flags false positives or prove them legitimate without inspecting that content. The production service does preserve private per-type moderation audit and returns per-type delivery outcomes. There is no supported classifier bug diagnosis or safe reason to weaken moderation from this sample.

An internal test release can exercise the complete experience through explicit authored fallback and manual writing, provided its native checks and financial fences pass. Reliable AI-first delivery remains a documented quality limitation, not a verified release claim. No further paid calls were made beyond the six-request budget.

Sanitized evidence: [initial calls](xai-smoke-initial.json) and [follow-up calls](xai-smoke-followup.json). These contain metadata, schema shape diagnostics and moderation reasons, not generated prose or secrets.

## Read-only release preparation

- Authenticated Supabase CLI 2.98.2 sees linked healthy project `uoyjhudegdpanrgllfoj` (`prompt-wars`). A remote `db push --linked --dry-run` listed only `20261007122059_composer_three_decision_operations.sql`; no migration was applied by this preparation.
- Existing EAS CLI 23.1.0 account access works. Remote counters were iOS build **17** and Android versionCode **8**. These are the previous release, not evidence of this implementation.
- Existing profiles remain iOS `production` and Android `preview`. No new build, upload, submission, group invitation or public store release was started during this preparation.

## Completed selective backend deployment

After root release approval, a fresh remote dry run again listed only `20261007122059_composer_three_decision_operations.sql`. That migration was applied successfully and appears in remote history. Only the following functions changed:

| Function | Previous version | Installed version | Verified state |
| --- | ---: | ---: | --- |
| `generate-move-suggestions` | 20 | **21** | ACTIVE |
| `complete-move-suggestion` | absent | **1** | ACTIVE |
| `record-funnel-event` | 14 | **15** | ACTIVE |

Function count changed from 49 to 50. The other installed function versions, including judges and resolvers, were unchanged. The ten reviewed backend files matched their pre-deployment SHA-256 manifest after installation.

The first API-bundler attempt failed before installing a function because an existing esm.sh Supabase SDK dependency could not be resolved. Retrying with the supported local Docker bundler succeeded for all three functions; no SDK version, dependency, source or moderation policy was changed to bypass the failure.

Live unauthenticated POST probes to all three endpoints returned their handler's **401 / `unauthorized`** response. Remote privilege checks confirm both private completion tables have RLS and no anonymous/authenticated SELECT access. Both reservation signatures and all completion RPCs are executable by `service_role`, not `anon` or `authenticated`.

Sanitized production metrics before (12:41:47 UTC) and after (12:45:07 UTC) remained unchanged: **12 successful and three moderation-rejected operations** in the previous 24 hours, **zero expired pending leases**, and **zero paid/refunded operations**. The success-duration mean for this historical sample was 16.286 seconds. A separate ledger check confirmed zero suggestion debits and refunds in the same rolling window. The new completion and occurrence tables are installed; the completion ledger was still empty at verification.

No additional paid AI call, player submission, purchase or authenticated v3 operation was created during deployment verification. Unchanged metrics therefore establish a stable deployment snapshot, not successful hosted v3 gameplay or future AI availability. Native end-to-end verification remains separate.

Evidence: [deployment result, source manifest, metrics and grants](deployment-result.json), [migration log](migration-deploy.log), [API bundler failure](api-bundler-attempt.log), [generator deployment](generate-deploy.log), [completion deployment](complete-deploy.log), [telemetry deployment](telemetry-deploy.log).

## Hosted native smoke observation

An authorized native Practice smoke after deployment created three round-1 `ensure_free` operations at 13:00:45–46 UTC. All three persisted `composition_version: 3`, used one attempt each, spent zero credits and reached the fenced `generation_failed` terminal state after 45.608–45.778 seconds. No provider or moderation metadata was finalized. The native tester could explicitly choose starter ideas and complete the round.

The timing is consistent with the configured 45-second generation deadline; the underlying exception is not confirmed. The Supabase connector denied function-log access, while the authenticated CLI supported scoped read-only SQL but no function-log command. We do not infer a classifier rejection or code defect from this evidence. No timeout or moderation threshold was relaxed.

The subsequent aggregate snapshot contained 12 historical successful operations, three historical moderation failures and these three new generation failures. There were zero expired pending leases, paid operations, reserved credits or refunds. These checks show v3 request reservation and safe zero-credit failure on the hosted backend; they do not establish a delivered AI bank in this round.

Evidence: [scoped operation metadata](hosted-native-smoke.json) and [aggregate metrics](hosted-native-metrics.json).

### Completed three-round hosted match

The same authorized Practice Bo3 completed with series score 0–2. The database contains three approved, locked player prompts: round 1 from the builder (129 characters), round 2 manual (145), and round 3 manual Finisher (146). Round 3 retained the manual preference and created no suggestion bank. No custom adaptation or retry was recorded.

Across rounds 1 and 2, all six free v3 bank operations failed `generation_failed` after 45.387–45.778 seconds, each with one attempt and no charge. This confirms safe failure and fallback/manual completion, **not hosted AI delivery**.

All three rounds are `result_ready` with persisted judge explanations. Rounds 1 and 3 have JSON-number `combat.winner: 2`; round 2 has `combat.winner: null` and `isDraw: true`. The native tester nevertheless observed stale judge status/missing notes and “Prompt not recorded” for Echo. These are observed presentation defects; their cause and whether they predate this work are unconfirmed. This composer release did not change their resolver or result handling.

The final screen also showed “Rendering…” without a requested purchase. The scoped database check found one **succeeded** video job with zero credits charged, and **zero wallet transactions, debits or refunds** for this battle and account. The label is not evidence of an accidental paid request. No gameplay, video or financial state was changed by these read-only diagnostics.

Evidence: [final battle, round, operation and billing metadata](hosted-native-final-state.json). Native screenshots and observations are recorded separately.
