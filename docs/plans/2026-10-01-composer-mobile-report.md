# Prompt composer mobile implementation report

> Superseded activation policy: The subsequent 1 October user decision enables composer assignment in all modes and AI/explicit paid availability by default. References below to the parent staged rollout are historical. Draft, confirmation, purchase recovery and legacy-version behavior remain applicable; native and pilot evidence is still unperformed. See [the current release instructions](2026-10-01-composer-release.md).

Date: 2026-10-01. Scope: Task 1 of `2026-10-01-prompt-composer-implementation.md`, plus the parent-authorized appeal projection fix described below. Implementation stayed in the existing dirty checkout and did not commit, deploy, spend credits or change rollout flags.

## Delivered behavior

- `prompt-entry.tsx` selects the new experience only for a frozen `prompt_experience_version === 2`. Legacy single/Bo3 matches keep their existing Ideas/Write workflow, deadline handling, safety controls and lock ceremony.
- V2 lock-in uses tap + confirmation for all players. Cancel keeps the draft, confirmation submits once, and failed submission offers Try again without hold instructions. `BattleLockInControl` defaults to legacy hold and preserves its screen-reader confirmation fallback; v2 and the fixture explicitly request confirmation activation.
- The v2 flow contains Build move / Write your own, three action choices or a written action, contextual suggested intentions or a written intention, and one canonical full prompt labelled Your move. Its existing `GameField` stays mounted across mode, move, tips and keyboard changes. Build shows a read-only preview; Edit full text changes to Write. V2 does not show the old word-quality/theme-keyword checks.
- A complete valid move can be selected and submitted without typing. The final string is trimmed action + one space + trimmed intention. No secondary AI rewriting or local score estimation occurs. Freestyle uses the same existing 20–800-character validation as the server-facing submission contract. Oversized composed text is preserved and shown as invalid rather than silently truncated.
- Local account mode preference applies only when no round draft exists. V1 draft text migrates without invented action/intent fields. V2 persists the canonical text, mode, builder fields, selected identifiers, contextual intent hints, detached/pending flags and context key. The serialized payload is version 2 under the existing scoped key so migration does not leave a second resurrectable draft. V1/v2 deletion tombstones and write serialization remain supported.
- Manual full-text editing detaches the builder. Merely switching modes never modifies the final text. The first later builder change requests replacement; cancel keeps the complete prior state. Undo restores text, fields, identifiers and validity. The v2 draft persists exactly one nonrecursive prior snapshot, so unfinished or complete replacement can be undone after app restart. Corrupt prior snapshots are dropped without discarding the canonical current text; nested history is stripped.
- Replacing an action clears its suggested intention and keeps a custom intention. Incomplete builder changes block submission in both modes. Changing move/context preserves prose, detaches incompatible identifiers and preserves an incomplete guard. Missing round data does not reconcile context until the real situation arrives.
- `BattleSituation` displays the frozen server situation. Missing context disables lock-in, not drafting. `OpponentMoveHistory` is collapsed, shows at most five resolved moves oldest-to-newest, and is absent for bots/empty/unavailable history.
- Immediate authored free choices remain usable during network/generation failures. Remote sets are staged and require explicit Use new starters; they never overwrite text or current choices. Selected action hint text is kept in the draft when the displayed set changes.
- Shared Game controls retain obsidian surfaces, gold edges, lavender actions, Barlow labels, system body text, wrapping text and 48-point targets. Fields remain steady; the existing keyboard inset owner and compact battle context remain. New action/intention fields use bounded scrolling and scroll into view on focus.

## Suggestion purchase and recovery

`useMoveSuggestions` owns v2 reads/generation and the explicit purchase path for both v2 and legacy UI. It calls `ensure_free` only for automatic acquisition. A pending read polls for at most 25 seconds and never purchases. Read/generation errors leave free choices intact.

An explicit reroll requires a known price and a saved local purchase journal before the network request. The journal binds the account/battle/round/move/situation scope to the original idempotency key and expected price. An uncertain response or restart exposes Check starter request; retry replays that same operation. No new purchase is allowed while its outcome is unknown. A storage failure blocks only purchases and has its own Retry request storage action.

Successful/terminal-refunded responses clear the journal. Exact pre-reservation rejection codes supplied by the server also clear it; generic transport/server failures do not. Price-change rejection refreshes the displayed price before another explicit confirmation. Local epoch/scope guards discard late account/round/move responses. Legacy full-body suggestions remain readable and their explicit New ideas action uses the same journal rather than the old implicit charge call.

## Telemetry integration

The root-owned `useComposerTelemetry` is wired to semantic mode, action, intention, full-edit, first-change, restored-draft, submission and suggestion lifecycle events. Calls pass only the allowed event/category values; no prompt, fragment, name or keystroke payload is added. The root hook owns foreground/focus timing and event deduplication.

## Files

- Updated: `app/(battle)/prompt-entry.tsx`, `utils/battleDrafts.ts`, `hooks/useBattleDraft.ts`, `components/game/battle/BattleLockInControl.tsx`.
- Added state/controller: `utils/promptComposer.ts`, `hooks/usePromptComposer.ts`, `hooks/useMoveSuggestions.ts`.
- Added UI: `components/battle/PromptComposerPanel.tsx`, `components/battle/BattleSituation.tsx`, `components/battle/OpponentMoveHistory.tsx`.
- Tests: added `promptComposer.test.ts`, `usePromptComposer.test.tsx`, `useMoveSuggestions.test.tsx`, `opponentMoveHistory.test.tsx`; expanded existing `battleWorkspaceLayout.test.tsx`, `battleDrafts.test.ts`, `useBattleDraft.test.tsx`.
- Added isolated presentation route: `test-support/fixtures/app/prompt-composer.tsx`.

Root-owned interfaces consumed: battle/version/situation types, fallback catalogue, explicit suggestion request/response types, opponent history and private telemetry. No changes to those files were made by this task.

Parent-authorized follow-up: `utils/appeals.ts` now preserves only the original round's `frozen_inputs` when applying reviewed judge data. Current reviewed scores and explanation retain precedence; stale original judge fields are not merged. `__tests__/roundMoveReview.test.tsx` adds a UI regression proving both recorded moves, the scene and the reviewed verdict remain visible after an appeal. The regression failed with missing frozen inputs before the fix.

## Verification

Before the final activation correction, the focused Jest command covered 16 suites and **120 passing tests**, zero failures and zero snapshots:

```text
rtk yarn test --runInBand __tests__/promptComposer.test.ts __tests__/usePromptComposer.test.tsx __tests__/useMoveSuggestions.test.tsx __tests__/battleDrafts.test.ts __tests__/useBattleDraft.test.tsx __tests__/battleWorkspaceLayout.test.tsx __tests__/opponentMoveHistory.test.tsx __tests__/promptSelection.test.ts __tests__/promptCoach.test.ts __tests__/battleVisualControls.test.tsx __tests__/battleLockInControl.test.tsx __tests__/battleDeadline.test.tsx __tests__/nativeBattleText.test.ts __tests__/promptPreparationState.test.tsx __tests__/roundMoveReview.test.tsx __tests__/useBattleAppeal.test.tsx
```

`rtk proxy yarn tsc --noEmit` passed. Targeted ESLint passed with zero errors and zero warnings across the owned production files, tests and fixture. Prettier was applied only to owned files. `rtk node scripts/visual-fixtures-check.cjs` passed the existing config-isolation and direct-call checks; this check does not certify all transitive network behavior.

After the final v2 copy correction and appeal projection fix, `roundMoveReview`, `useBattleAppeal` and `battleWorkspaceLayout` passed again: **3 suites / 26 tests**. TypeScript and ESLint for all five touched code/test/fixture files also passed. The fixture isolation check passed with the published catalogue scene.

After the final v2 tap-confirmation correction, its affected `battleWorkspaceLayout` and `battleLockInControl` suites passed: **2 suites / 26 tests**, including the new non-screen-reader and failure-copy cases. TypeScript, targeted ESLint and fixture isolation also passed again.

Meaningful failing-then-passing evidence includes initial no-typing state/UI implementation, v2 draft restoration, a stale old-account save error, complete A → complete B → Undo A, incomplete builder → move change remains blocked, restoration before the round snapshot arrives, ordinary builder telemetry and retrying unavailable journal storage. Purchase tests cover unknown price, no request if journal save fails, restart with the same original operation/price, terminal refund, late-round response and no generation on top of a pending read. Existing lock-in races, failed-submit text retention, legacy nullable metadata and mounted-editor regressions remain green.

## Review corrections

1. The first undo implementation retained the first empty baseline across successive completed builds. Independent review caught it; the new transaction starts from the last complete move and remains stable while the new intention is pending.
2. Context changes initially cleared `pending`, potentially making stale final text submittable. Independent review caught it; pending remains set and Undo restores prior prose with identifiers detached from the changed context.
3. Temporarily unavailable round context could detach a restored builder unnecessarily. Reconciliation now waits for the actual snapshot, with a route regression test.
4. Normal builder choices initially omitted telemetry outside replacement confirmation. Both paths now emit the same semantic events, without copying their text.
5. A failed purchase-journal read originally needed remount for recovery. A free retry control now re-reads it while free authoring stays available.
6. Independent integration review found that an appeal replaced the full judge payload and removed recorded moves from result review. The authorized projection correction preserves the immutable input snapshot while replacing the judgment.
7. Final plan review found that Undo initially lasted only for the mounted screen. Its single prior snapshot is now stored/restored with the scoped v2 draft; incomplete and complete replacement restart cases failed before the fix and pass afterward. Invalid Undo data and recursive history are covered by a separate regression.
8. The implementation ledger incorrectly retained mandatory hold for v2, contrary to approved spec 2.5. V2 now uses explicit tap confirmation, tested with screen reader both off and on, including cancel, double-confirm protection, exact no-typing submission and failed retry copy. Legacy hold/cancellation regressions stay covered. The ledger line was corrected.

## Visual evidence and remaining release gates

The isolated fixture reuses the real panel/situation/field/move/lock components and existing artwork. Its `storm-1` situation is imported from the published catalogue, so fallback actions reference the actual scene. Routes are `/prompt-composer?state=build|ready|write|detached|pending|overflow|loading|error`. It makes no live battle, suggestion or purchase calls. Its simplified local header and interactions are component evidence, not an authenticated route/keyboard/submission pass.

This task did not claim native screenshots, an iOS/Android keyboard pass or real VoiceOver/TalkBack traversal. Root is coordinating available browser fixture checks. Required native release evidence still includes 320/375/390/402/tablet geometry, dynamic text and non-Latin wrapping, software/hardware keyboard and caret behavior, focus restoration, Reduced Motion, offline/price/error recovery, actual account/round transitions and screen-reader confirmation. The 12-person usability pilot and real-model calibration are outside this mobile unit-test result. Rollout remains gated by the parent plan.
