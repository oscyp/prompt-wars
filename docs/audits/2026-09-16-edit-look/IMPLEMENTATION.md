# Edit Look implementation and validation — 16 September 2026

## Delivery

Implemented in the existing `codex/ux-game-integrity` working tree, preserving the earlier UX, cosmetics, integrity and unrelated audio work. Reference: [approved mockups](../../../output/mockups/2026-09-16-edit-look/concept-board.png) and [audit](README.md).

No version bump, production build, store submission, schema migration, Edge Function deployment, pricing change or combat/appeal flag change was performed. The existing iOS development binary loaded the current client JavaScript for the checks below. This is reviewable client work, not release acceptance.

## Completed changes

| Area | Implementation |
| --- | --- |
| Editor shell | Removed the route's collapsing-stage dependency. Compact framed identity, metallic heading, visible Look / Fighter / Gear rail, one vertical form scroll and persistent measured footer. Ordinary entry starts on Look; explicit section/color parameters override the restored position without discarding staged work. Per-category scroll positions survive switching. Cold links retain Profile fallback. |
| Look | Choose traits / Write my own retains independent text and guided choices. Featured style thumbnails, all-style sheet, outfit palette, and disclosure rows for every existing Vibe, Silhouette, Era and Expression option. The description retains its 200-character limit. Artwork remains labeled current until a drawing actually completes. |
| Fighter and Gear | Free identity edits, owned colours, cooldown copy, separate respec confirmation and real battle-lock disabling. Current custom/legacy equipment is resolved independently of selectable catalogue filtering. Responsive one/two-column tiles use explicit Preview and free staging from item details. No new custom-item creation or unequip. |
| Local draft | Versioned AsyncStorage record scoped to account/fighter. Serialized writes, hydration/account fences, background/navigation flush, storage-error retry, deliberate discard with tombstones, per-field acknowledgements, remote-field conflict comparison and independent inactive description text. |
| Save and draw | Separate free Save and confirmed Draw/Shuffle. Live prices and remaining free allowance, balance effect and cooldown disclosure. Save before normal drawing; acknowledge only successful identity/look requests. Unknown prices and late locks disable confirmation and mutation handlers. Ordinary Back saves the device draft; only a storage failure requires a leave decision. |
| Render recovery | Caller-owned request identity is durable before paid dispatch. Owner-readable audit/job reconciliation never starts generation. Ambiguous responses remain pending; definite pre-charge rejection can return to editing. Terminal evidence survives a temporary local-write failure within the running process and is persisted before acknowledgment. Result IDs survive signing failures; loading retry and avatar repair remain separate. |
| Previews/history | Measured equipped-frame apertures, contained full-card art, loading/error/empty history, preview and free paired restore. Known artwork is retained on refresh/signing failure. Sheets retain Close, bounded body, pinned actions and return focus. |
| Accessibility | Labels, selected/expanded/disabled states, 48-point shared targets, scalable text, horizontal category overflow and intrinsic-height stacked footer buttons. One iOS keyboard avoider; Android retains native resize ownership. |

Primary code: `app/(profile)/edit-character.tsx`, `components/edit-character/EditorChrome.tsx`, the Look/Identity/Gear panels, `hooks/useCharacterEditDraft.ts`, `utils/characterEditDrafts.ts`, `hooks/usePortraitOperationRecovery.ts`, `utils/portraitOperations.ts`, `utils/characters.ts` and `utils/equippedSignatureItem.ts`. Shop colour navigation now targets Fighter / Signature color. Design-language and concept documentation reflect these contracts.

## Automated verification

Final result: **161 Jest suites / 1,332 tests passed**, TypeScript passed, and ESLint passed with no new warnings. Command results are recorded in [automated verification](evidence/automated-verification.json).

- `yarn test --runInBand --silent`: full Jest suite, including the existing navigation, history, cosmetics, wallet, media and appeal-display suites.
- `yarn tsc --noEmit`: complete client TypeScript check.
- `yarn lint`: passes with the existing `app/_layout.tsx` require-import warning; no lint errors. Direct ESLint over changed editor/recovery files and focused tests also passes.
- `node scripts/visual-fixtures-check.cjs`: development-only route/config isolation and direct-call checks pass. This static check is not a full transitive network audit.

Behavioral coverage includes restart restoration, background flushing, account isolation, storage failures and discard/write races; independent written/guided inputs; remote conflicts and acknowledgements during further editing; partial identity/look saves; ordinary and explicit entry, cold fallback and category scroll storage; stale prices and late battle locks; pending render checks making zero generation calls; signing failure without spending; definite rejection plus failed outcome persistence; success dominance over stale failure; legacy gear and signing/query errors; responsive panels, intrinsic large-text button sizing and cancelable unavailable confirmations. Initial-portrait reservation/reconciliation regression tests remain intact.

An independent source review identified price-query handling, definite-rejection recovery, account scope, retained gear, failed signing retry and terminal-storage-write recovery issues; these were corrected and regression checked. The native accessibility check exposed clipped stacked footer labels; intrinsic button sizing corrected that issue.

No backend changed for this editor update, so no database reset, remote RLS mutation test or Deno deployment suite was run. Current-item lookup continues to respect existing RLS. An unreadable legacy row remains unavailable with Retry rather than bypassing ownership policy.

## Native evidence

Captured on iOS 26.5 simulators using the existing installed development app: **402 × 874 points** (iPhone 17 Pro) and **375 × 812 points** (Prompt Wars Parity 375). Default font scale is 1.00; the small-phone accessibility capture uses 1.79 (`accessibility-medium`). The original `large` text-size setting was restored. Optimized JPEGs are scaled captures, not literal point coordinates. A floating simulator/development overlay and a DEV provenance strip may be visible; neither belongs to the production editor design.

| Evidence | What it establishes |
| --- | --- |
| [Production Look](evidence/production-locked-look.jpg), [Fighter](evidence/production-locked-fighter.jpg), [Gear](evidence/production-locked-gear.jpg) | Real authenticated route in a read-only active-battle state, visible categories, retained current fighter/frame and custom Lipstick equipment. These captures precede the final compact-title adjustment. No fighter save, draw, respec or battle mutation was triggered for evidence. |
| [Standard Look](evidence/standard-look.jpg), [Fighter](evidence/standard-fighter.jpg), [Gear](evidence/standard-gear.jpg) | Real shared components composed in the isolated fixture, default sizing and two-column gear. |
| [Small Look](evidence/small-look.jpg), [Fighter](evidence/small-fighter.jpg), [Gear](evidence/small-gear.jpg) | Actual small simulator, default text size, visible controls and one-column gear. |
| [Accessibility Look](evidence/small-accessibility-look.jpg) | Actual 375-point simulator at 1.79 scale, compact identity, horizontally overflowing category rail and readable stacked footer labels. The form remains scrollable; the smaller visible form area is an accessibility layout tradeoff. |
| [Card](evidence/standard-card.jpg), [History](evidence/standard-history.jpg), [Confirmation](evidence/standard-confirm.jpg) | Shared native sheets with contained artwork, bounded scroll areas and pinned actions. |
| [Pending](evidence/standard-pending.jpg), [Failure](evidence/standard-failure.jpg) | Recovery-state presentation in local fixtures. Their buttons do not exercise live operations; Jest covers production status semantics. |
| [Writing — standard](evidence/standard-writing-no-software-keyboard.jpg), [writing — small](evidence/small-writing-no-software-keyboard.jpg) | Native written form only. These are explicitly **not** successful software-keyboard typing evidence. |

Fixture route: `test-support/fixtures/app/edit-look.tsx`, launched only by the existing safe `scripts/visual-fixtures.sh` harness on port 8082. It reuses the real panels/chrome/sheets with bundled art, synthetic prices and in-memory choices. It excludes account, payment and generation providers. Fixture screenshots establish component presentation, **not** full production-route navigation, persistence, financial recovery or provider integration. The ordinary 8081 server was left running.

## Remaining acceptance checks

Implementation and automated verification are complete; native release acceptance is still partial:

1. **iOS software keyboard and typing:** runtime type actions focused the field but did not reliably insert text or bring up the software keyboard. Mac Computer Use could not open the Simulator application (`Simulator.app` file-not-found). Caret movement, footer clearance with the software keyboard and typed-text retention still need a manual device walkthrough. Do not treat these captures as passed keyboard checks.
2. **VoiceOver and native Reduced Motion:** screen-reader semantics and motion behavior have automated coverage; an end-to-end native focus/announcement and reduced-motion walkthrough was not completed.
3. **Complete state matrix:** standard-size previews/history/confirmation/pending/failure and small-size core forms were captured, but every failure/lock/media state at both sizes and both text settings was not exercised on the real route. Use staging fixtures/accounts for destructive/paid/live-provider cases before a release.
4. **Android: blocked**, per the user's existing instruction, until an Android test environment is available.

If a process terminates after a definitive server rejection but before any terminal local write succeeds, the persisted pending operation remains ambiguous. The client does not infer no charge from absent server rows or automatically dispatch again. Existing owner-readable server records remain the recovery authority.

The previous stable client remains the release fallback. No deployment or historical data change is part of this delivery.
