# Face-off composer implementation ledger

Authority: user-approved plan in this conversation: Face-off → Action → Intention → Approach → Your move; selection-only builder; paid per-step rerolls with standard price 1. Backend deployment authorized after tests; NO app build, TestFlight, store or OTA release.

Preserve existing dirty codex branch, SDK and game design components. No commits or production reset. Skills: subagent-driven-development, TDD, Expo native UI/data fetching and Supabase.

## Ownership and interface checks

| Work | Owner | Interface/dependency |
| --- | --- | --- |
| Views, paid client recovery, free prewarm, integration/docs | root | existing Game components; new paid-step wire below |
| State/navigation/draftv5 | faceoff_state | faceoff step, same change/move-type events; composerNextStep helper |
| Step Edge handler and pipeline | step_reroll_plan_audit | independent intent/approach endpoint, SQL RPCs agreed with SQL owner |
| Migration, private payments, concurrency/RLS | step_reroll_sql | battle→round→serialization→operation→wallet; effective price before charge |

No ownership overlap. All tasks preserve legacy free completion and action operations. Read-only audit found action test-account price validation preceded waiver: SQL owner corrects ordering to match displayed effective price, with regression.

## Progress

- [x] User plan and current code inspected; parallel responsibilities assigned.
- [x] Panel regression RED:4fail; selection-only explicit-type GREEN:4pass.
- [x] Paid step API/hook and route integration.
- [x] State/draftv5 and free prewarm regressions.
- [x] SQL/Edge tests and independent review.
- [x] Native development-host checks, no build; iOS375 interactions remain unresolved in the evidence report.
- [x] Backward-compatible backend deploy + verification.
- [x] Product/design docs and final evidence.

## Wire

POST reroll-move-step-suggestions: battle_id, round_number, move_type, target:intent|approach, action_text, intent_text for Approach, composition_version 3, client_contract_version 3, idempotency_key, expected_credits effective 0 or 1. Reply data status ready/pending/failed/stale, operation_id, context_key, target, composition_version, credits_spent, is_paid, refunded, result.intentHints or result.approachHints, error.

## Defaults

Build preference starts authenticated per-type prewarm on Face-off; manual-only entry does not generate. Back restores selections. No paid purchase from keystrokes, Next, navigation or auto recovery with a new key. Incomplete old custom builder drafts migrate exact visible text to freestyle, without prose inference. Prior full-bank availability problems and result screen defects are not silently declared fixed.


## Final review and evidence

Current delivery report: `docs/deployments/2026-10-07-composer-faceoff.md`. Application 227 suites/1,943 tests and TypeScript/scoped lint pass; backend 498 tests plus 59 nested steps pass (7 remote ignored); local SQL/RLS/reapply and 12 separate-connection race groups pass. Review corrections preserve pending financial recovery identity, legacy unstructured text and accessible archived manual versions. Native fixture checks use existing hosts, no new builds. The repository CLI outside the sandbox now confirms access to the correct linked project through the user's Keychain login. The connector remains scoped elsewhere. The final action-recovery regressions and 12 race groups passed. Migration 20261007154542 and the new endpoint v1 are deployed; remote grants/price/recovery/sweeper checks passed.
