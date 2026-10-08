# Visual remediation ledger — approved plan, 21 September 2026

Authority: the user's Complete Visual Audit Remediation implementation plan; findings F1–F10/C1 in ../2026-09-21-full-visual-pass/README.md.

## Scope and preservation

- Implement the approved four waves; retain metallic headings using native masking.
- Current dirty working state is the baseline. No production release, backend deployment, version bump, DB migration or audio changes.
- Baseline source copies and hashes: /private/tmp/pw-visual-remediation-baseline. Baseline Jest: /private/tmp/pw-visual-baseline.log.
- Ruling: work in the existing checkout on a new codex branch, retaining all dirty changes — the user explicitly requires the current state and previous fixes; a clean worktree would omit them. Only remediation changes are reviewed against the captured baseline.
- Ruling: no automatic commits of the pre-existing dirty tree; deliver reviewable working changes and a persistent ledger.
- Pre-flight: shared text and screen-shell changes feed every wave; result cosmetics use the existing frozen battle-character contract; no new wire type or backend write is needed.
- Android native validation stays blocked until an environment is available.

## Waves

1. Implemented — F1 native mask/font fallback, F2 banners, F4 fixed headers/safe boundaries. Install compatible mask dependency, update native lockfile and build locally.
2. Implemented — F3 typed concise outcome, F5 current/frozen cosmetics, export readiness/revision cancellation, F7 measured winner card.
3. Implemented — F6 panels/type/glyphs, F9 shared feedback/skeletons, C1 explicit colour shortcut.
4. Implemented — F8 authoring hierarchy, F10 auth/welcome/creator/list hierarchy and independent safety controls.
5. Delivered — final regressions, 29 native captures, independent review, docs and findings-to-fixes report. Native acceptance remains partial as detailed below.

## Validation

Record command/result and meaningful limitations here as work progresses. Do not mark a visual finding fully resolved without its relevant native evidence.

### Native toolchain investigation

- CocoaPods install succeeded with mask 0.3.2. Local Xcode 27 rejects several existing Pod minimum targets below iOS 15. Build-only `IPHONEOS_DEPLOYMENT_TARGET=15.1` matches the app’s existing minimum.
- Xcode 27 also finds an ambiguous synthesized `PaywallColor` initializer in the existing RevenueCat Pod. For simulator validation only, the unchanged designated initializer is temporarily moved from an extension into its struct to suppress synthesis. Original at `/private/tmp/pw-RevenueCat-PaywallColor.original.swift`; restore after building. No package upgrade or committed billing implementation change.
- Result/share regression checks: 4 suites / 14 tests passed. Shared shell/navigation/signing checks: 5 suites / 14 tests passed; duplicate decorative React key warning fixed.

### Current implementation and checks

- Waves 1–4 implemented in source; native evidence and final review in progress. Native mask 0.3.2, opaque stack headers/safe boundaries, banner rows, typed no-contest card and frozen cosmetics, revision-guarded readiness export, measured winner stage, quiet panels/rewards, feedback/skeletons, C1 links, one authoring selector/tips, compact auth/welcome/creator, shared styles/presets and row-level Safety.
- iOS simulator build succeeded with **build-only iOS 16.4 minimum** (Expo Router also required ≥16). Original RevenueCat source restored. Bundle `/private/tmp/pw-visual-remediation-derived/Build/Products/Debug-iphonesimulator/PromptWars.app`.
- Full suite initial post-change run: 172 pass / 1 fail, 1383 pass / 6 fail. Remaining failures are Rankings rendering after introducing named PlayerSafetyRow into a test that mocks only the default export; investigate/update test boundary, then rerun. Workspace 12 tests pass, TS passes. Lint 0 errors / 8 warnings; 7 introduced unused imports removed, 1 existing root-layout require warning remains.
- Current native standard phone shows signed-in Arena with compact hero/actions visible. Screenshot while Metro refreshing is diagnostic only, not acceptance evidence. Both simulators remain available; small phone is signed out.

### Final regression and independent review

- Final product checks: `yarn tsc --noEmit` passed; `yarn lint` passed with zero errors and one pre-existing require-import warning; `yarn test --runInBand` passed **174 suites / 1,393 tests**. Logs: `/private/tmp/pw-visual-{types,lint,tests}-final.log`. Fixture isolation checks pass.
- Independent gpt-6-astra source review against the captured dirty-state baseline found one P2: a whitespace string directly beneath Welcome's native footer View. Removed it and added a red→green account-entry regression. No outstanding correctness findings. Reviewer did not claim native or release acceptance.
- Reviewer set aside native pixel/VoiceOver/keyboard behavior (handled in native evidence), Android (blocked), endpoint deployment (outside scope), prior dirty changes (preserved), ongoing gallery/docs (completed separately), and clean production compatibility of local toolchain workarounds (not established). All rulings accepted and explicitly retained in the report.
- Root unresolved-character error now reuses GameFeedback; existing eight routing/retry/account-isolation tests pass. Writing tips use secondary utility styling. Safety-row navigation isolation and live font-size remeasurement have focused behavioral tests.
- Version remains 1.3.1. The only package dependency delta is masked-view 0.3.2. RevenueCat Pod source matches its original backup. No audio provider, server function or migration was edited by this remediation.


### Final delivery and open native evidence

- Final post-investigation verification: **174 suites / 1,393 tests pass**, TypeScript pass, lint zero errors / one pre-existing warning; direct fixture isolation check passes. Product code did not change after that final run.
- 29 inspected native captures: 18 real-route and 11 explicitly labelled component fixtures. Gallery/report/coverage/manifest are in this directory. Actual active-round keyboard, parking/reopening and writing tips were exercised; the temporary free practice was then canceled successfully. Attention count returned to 10 and balance stayed 129. Both simulator text sizes were restored to large; standard phone returned to Arena.
- **F1 partial, not fully resolved:** non-Latin heading clipping at 375pt / fontScale 2.143 remains. Temporary plain Text probes also reproduced clipping. System-family, weight, line-break/width and soft-break experiments were not reliable and were removed; no changed name strings or scaling limits were retained. GameText and its earlier foundation tests are unchanged from the starting baseline. Root cause is not established.
- Full VoiceOver, OS Reduced Motion, small authenticated routes, full provider/payment/reviewed-outcome and performance matrix remain open. Android remains blocked. Previously source-only route/component states are labelled explicitly in coverage.json.
- Only masked-view 0.3.2 was added; package version stays 1.3.1 and the RevenueCat Pod file still matches its original backup. No production release/backend work is included.
- Final gallery uses static HTML with checked local links/images; browser rendering was not runtime-verified and no local-file security workaround was attempted.

- Validation continued just after midnight on 22 September: installed React Native text-container/line-height probes did not resolve CJK clipping; temporary fixture overrides were removed. No additional product changes resulted.
