# Complete visual audit remediation — implementation and evidence

[Native comparison gallery](comparison.html) · [Capture manifest](captures.json) · [Route coverage](coverage.json) · [Changed files](changed-files.json) · [Work ledger](PROGRESS.md)

The four implementation waves for F1–F10 and C1 are complete in the working tree. The original doubled metallic glyphs, squeezed banners, split series headline, missing equipment treatment and duplicated writing controls have been corrected. **Full native acceptance remains incomplete:** Japanese heading clipping at accessibility text size remains reproducible in the tested iOS runtime, and the outstanding device/state checks below have not passed.

This delivery contains **29 inspected native screenshots: 18 real-route captures and 11 explicitly labelled component-fixture captures**, across 402×874 and 375×812 point iPhones. Captures are optimized images of those viewports, not full-resolution raw simulator PNGs.

## Findings-to-fixes checklist

“Implemented” means source and automated checks agree. “Verified layout” names the native state actually observed; it does not close untested states.

| Finding | Implemented fix | Native evidence and disposition |
| --- | --- | --- |
| F1 · Metallic headings | [GameDisplayTitle](../../../components/game/GameDisplayTitle.tsx) uses native Barlow text as the mask over the existing gradient, with identical measurement styles, one accessible heading and solid native fallback. No independently positioned SVG glyphs remain. | Wallet/auth/diacritic/multiline headings are sharp in 02, 14, 19–22. **Partial:** non-Latin text at 2.143 font scale clips on the small iPhone (27); F1 is not fully closed. |
| F2 · Banners | [InlineBanner](../../../components/InlineBanner.tsx) gives icon/message a full-width row and the utility action its own row below. | **Verified layout:** real Settings (13), both fixture sizes (14, 22), expanded action/message at accessibility size (26). VoiceOver traversal remains pending. |
| F3 · Result composition | [ResultShareCard](../../../components/ResultShareCard.tsx) uses Victory/Defeat/Draw/No contest and one separate score. No contest suppresses stale winner/KO/score; legacy single results have no invented series score. | Real 2–1 practice result (08), exported fixture (16), adversarial no-contest fixture with stale incoming winner/KO/score (17). Live reviewed human results and the complete outcome/device matrix remain pending. |
| F4 · Safe boundaries / Back | Opaque native headers; safe inset outside Arena/Profile scrolling bodies; optional fixed header in [GameScreen](../../../components/game/GameScreen.tsx); quiet Back; native-header keyboard offset helper. | Real Arena/Profile/Wallet/Shop/auth and keyboard captures (01–06, 10, 12, 19–21). Opener round trips and existing guarded/cold-link tests pass. Full accessibility traversal and every secondary route remain pending. |
| F5 · Equipment / export | Current Shop cosmetics and frozen result cosmetics/signature colours use the shared measured portrait renderer. [ResultShareExport](../../../components/ResultShareExport.tsx) waits for fonts, layout, avatars and frames; failed art is retryable; capture checks adjudication revision before sharing. | Shop’s Neon Circuit summary (03), equipped real result (08), local exported PNG (16). Readiness, error and revision races are automated. Live revised-human export and real signing/removal failures remain pending. |
| F6 · Secondary surfaces | Explicit shared text variants, quiet information panels, one border treatment, separated reward explanations, shared utility controls and custom outcome glyphs. | Rivals/Wallet/result surfaces (06, 08, 29), fixture outcome hierarchy (15–17). Not every preview, reward/judge beat or recovery overlay was freshly captured. |
| F7 · Winner size | [RevealWinnerBeat](../../../components/reveal/RevealWinnerBeat.tsx) budgets contained artwork against the measured stage while reserving identity and controls. Profile export and full-card viewing keep their independent sizes. | **Verified default layout in fixtures:** frame, name and Continue visible together at both viewport sizes (15, 23). Full timed reveal and long-name/accessibility matrix remain pending. |
| F8 · Writing workspace | One Ideas/Write selector, concise allowance/live-price row, Writing tips disclosure, wrapped suggestion titles and unobstructed selected markers. Editor stays mounted. | **Verified real active practice:** workspace (09), typed text/caret and lock control above keyboard (10), parked/reopened draft and tips (11). Move/mode/failed-submit behavior passes existing/focused tests. Native paid-reroll/failure/accessibility states remain pending. |
| F9 · Loading / feedback | Compact [ProfileSkeleton](../../../components/profile/ProfileSkeleton.tsx), quiet list skeletons, shared [GameFeedback](../../../components/game/GameFeedback.tsx) for root/error/empty/season recovery. | Real ended season (28); empty/error and skeleton fixtures (24–25). Confirmed-empty/error distinction passes tests. Full startup, refreshing-known-data and offline native matrix remains pending. |
| F10 · Entry / lists | Compact auth wordmark and functional headings; height-aware Welcome with pinned actions; compact initially-unselected creator preset sheet; shared illustrated styles; quiet history and independent labelled Safety action outside row navigation. | Real auth (19–21), Battles (07), creator components (18). Presets, styles, Welcome footer and Safety navigation have behavioral tests. Actual Welcome/creator progression and populated human safety rows remain pending. |
| C1 · Signature colour | Both Shop actions route to `section=fighter&focus=signature-color`; parameterless links retain Look. | **Resolved for the reported shortcut:** real Shop → Signature colour (04), pre-existing editor draft preserved and Back round trip observed; both destinations covered by the Shop suite. |

## Verification

| Check | Result |
| --- | --- |
| `yarn test --runInBand` | **174 suites / 1,393 tests passed**, no snapshots. Final run: 26.367 seconds of Jest execution. |
| `yarn tsc --noEmit` | Passed. |
| `yarn lint` | Zero errors; one pre-existing `@typescript-eslint/no-require-imports` warning at `app/_layout.tsx:29`. |
| `node scripts/visual-fixtures-check.cjs` | Passed config isolation and direct-call checks. This is not a transitive network-egress audit. |
| Local rebuilt iOS Debug app | Succeeded; native masked-view 0.3.2 exercised on both simulators. Toolchain qualifications below apply. |
| Independent source review | One Welcome footer raw-whitespace issue was found, fixed and regression-tested. No outstanding correctness findings from that review; it did not certify native acceptance. |

Focused coverage includes single-title accessibility/fallback and live font-scale remeasurement, persistent headers, no-contest suppression, score orientation, frozen equipment, capture readiness/failure/revision invalidation, selected creator presets, workspace editor identity/failed submission, independent Safety actions and both Shop colour links. Existing drafts, navigation, tutorial, wallet, media, avatars and appeal-display suites were included in the complete run.

Final command logs are under `/private/tmp/pw-visual-{tests,types,lint}-final.log`. The branch is `codex/visual-audit-remediation-20260921`. Review against the captured starting state at `/private/tmp/pw-visual-remediation-baseline`; the repository already contained substantial unrelated changes. Nothing was automatically committed.

## Native environment and actual interactions

- Standard device: iPhone 17 Pro, **402×874 pt**, iOS 26.5, existing signed-in fighter AndrewTwo and equipped Neon Circuit frame.
- Small device: PromptWarsParity375, **375×812 pt**, iOS 26.5, signed out. Default and accessibility text were exercised; the non-Latin reproducer reports **fontScale 2.143**.
- Both simulators use the rebuilt development app and current JS. Their text sizes were restored to `large`; the standard device was returned to Arena and its development floating control restored. The fixture server was stopped; the existing real-app Metro server remains running.
- Real navigation included Arena → Wallet → Shop → Signature colour and return, Profile/Rivals, Battles/result, Settings and ended-season Rankings. Localized Wallet pack prices such as **1,99 US$** remained full-width (29). No purchase, drawing, equip, report/block, signup or reset request was submitted.
- One **free practice battle** was created to verify the previously source-only writing route. The local draft “Quiet words shelter the city before the storm.” survived parking/reopening and the Writing tips toggle. No prompt was submitted and no suggestions were bought. The first cancel attempt failed with a network error; a later normal free cancel succeeded. Arena attention count returned from 11 to 10 and the balance stayed **129 credits**. The existing Edit Look draft was not changed.
- Fixtures use bundled artwork and local state, outside the production router and live providers. They exercise the real result/export/winner/creator/feedback components, but do not prove backend review, purchases, tutorial progression or authenticated navigation. The fixture export was captured to a local PNG preview; no OS share destination was used.
- Some images retain the development LogBox toast for the already-implemented but **undeployed `sign-player-avatars` endpoint**. It is labelled evidence of that environment condition, not counted as a new product footer defect.

## Open native findings and acceptance work

1. **F1 remains partially open: non-Latin heading clipping at accessibility size.** Capture 27 shows `星の守護者` painting past the right edge at 375 pt / fontScale 2.143. It also reproduced with plain React Native Text in a temporary native fixture. Solid fallback, font-weight, line-break/width and soft-break experiments did not fix it reliably and were removed. Original name strings and unrestricted OS scaling remain intact. A final installed-source check also tested the native text-container line limit and fallback line-height; neither resolved the clipping, and those temporary fixture overrides were removed. The native renderer/root cause is not established; do not describe this as a confirmed upstream bug or a resolved issue. Reproduce and resolve it on a supported clean native toolchain before closing F1.
2. Accessibility-size auth text remains sharp but a long heading can wrap inside a word; the large-text Arena capture also shows existing tab-label truncation. These observations prevent a broad “all accessibility states passed” claim.
3. VoiceOver traversal/confirmation, a complete **OS** Reduced Motion walkthrough, small-phone authenticated routes, long/unbroken names, long themes, the full localized-price matrix and measured scrolling/typing/memory baseline remain unverified. Winner fixture `reduceMotion` is component evidence only.
4. Actual Welcome/creator progression, matchmaking/waiting/round result, populated 0–4 player ranking variants, all editor/recovery overlays, delayed purchases/provider failures and real reviewed-human-result export were not all freshly captured. [Coverage](coverage.json) identifies real-route, fixture and unavailable evidence separately.
5. Live current/frozen human-list avatars require the previously implemented avatar endpoint to be deployed before a later client distribution. This remediation did not deploy it.
6. **Android validation remains blocked** under the user’s existing instruction until an SDK/emulator/device environment is available.

## Native dependency and scope review

The only new package is **`@react-native-masked-view/masked-view@0.3.2`**, installed with the Expo-compatible workflow; CocoaPods lockfile changes reflect its native integration. The app version stays **1.3.1**.

Xcode 27 initially rejected old Pod deployment targets and an existing RevenueCat `PaywallColor` synthesized initializer. The local simulator build used **build-only `IPHONEOS_DEPLOYMENT_TARGET=16.4`** and temporarily moved the existing designated initializer into its struct. The original Pod source was restored byte-for-byte after the build. The checked-in deployment target and billing package version were not changed. This is a rebuilt development-app validation, **not a clean production-build validation**.

This remediation changes client presentation and tests/documentation. No server function, migration, combat/appeal flag, version bump, production build, deployment or store submission is included. Existing audio work is preserved. The compatible avatar endpoint remains a later distribution prerequisite.

## Artifact validation

All gallery images and relative report/source links are checked on disk. Native captures were visually inspected through simulator/image tools. Browser rendering of the gallery has not been runtime-verified; the earlier local-file browser security restriction was not bypassed.

Design and acceptance contracts are updated in [DESIGN_LANGUAGE](../../DESIGN_LANGUAGE.md), [the concept](../../prompt-wars-implementation-concept.md) and [VISUAL_MIGRATION_ACCEPTANCE](../../VISUAL_MIGRATION_ACCEPTANCE.md).

