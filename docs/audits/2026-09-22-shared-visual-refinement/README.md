# Shared visual system and screen refinement — 22 September 2026

The approved client-and-assets implementation is complete. Native acceptance is **partial**; the remaining device checks below are not reported as passed. No production build, version bump, migration, function deployment, dependency upgrade, rollout-flag change or store submission belongs to this delivery.

[Native comparison gallery](comparison.html) · [Capture provenance](captures.json) · [Automated verification](verification.json) · [Approved implementation brief](../../plans/2026-09-22-shared-visual-refinement.md)

## Changes checklist

| Work package | Implemented behavior | Evidence and limits |
| --- | --- | --- |
| Shared frames | Existing GamePanel/GameBevel provide muted/emphasized double gold, consistent cut corners and one border owner. Inputs and equipped artwork keep their own boundaries. | Shared component coverage; actual Wallet, editor, Profile, battle and result captures. |
| Headers and currency | One compact header per tab/secondary screen; all four tabs share an account-scoped balance reader. Quiet Back and existing fallback routes remain. CreditAmount supplies signed/localized/unknown amounts and spoken credits; priced buttons receive numeric content. | Account-change/focus/unknown-value tests; actual four-tab/Wallet/editor headers. Long amount and accessibility fixtures. Full native account-swap matrix remains open. |
| Arena and Profile | Arena hero/customization/promotional copy removed. Actionable rounds precede quests/progress and existing secondary content. Profile owns the fighter; battle cry wraps in its caption and artwork budget. Full-size export remains separate. | Before/after actual Arena and actual Profile, including equipped frame. Existing export tests retained. |
| Player rows and Safety | Human/bot battle frames have equal width. Navigation and Safety are separate sibling controls inside one frame; comparable rival/ranking rows use the same containment. | Actual battle history; native fixture opens/closes Safety with navigation count remaining zero. Automated independent press tests. Actual current human ranking rows unavailable in ended season. |
| Wallet | Shared header, diamond balances/quantities, one framed ledger with signed amounts, reason/date and navigation only where supported. Purchase/status/restore logic retained. | Actual balance, localized pack and ledger captures; purchase recovery/subscription regressions. No purchase made during capture. |
| Trait assets and pickers | All 6 Vibes, 6 Silhouettes, 5 Eras and 6 Expressions have original bundled 512px references, fallbacks and unchanged submitted keys. Fixed-heading, bounded sheets stage/close/restore focus and honor locks; columns follow 390pt/1.15 threshold. | All 23 mappings tested; actual locked two-column sheet, fixture responsive coverage. 1,095,473 bytes combined; prompts and manifest included. |
| Editor controls | Larger archetype art; gradient palettes; dice for Shuffle; Save changes and Review & draw; included allowance copy; no catalogue search or routine Free suffixes. Pending Check status stays separate. | Actual locked editor/palette/archetype states; focused copy, allowance, pricing, history, gear and recovery tests. |
| Keyboard and drafts | Preview and wallet shortcut hide while typing; one inset owner; focused-field/caret scrolling; compact Save/Done; inputs/drafts retained. At accessibility sizes preview/status join the form scroll. | Behavioral tests pass, large-text native form/action reachability confirmed. **Direct typing, software-keyboard switching and restart validation are blocked by the locked Mac**, so this native acceptance item stays open. |
| Active battle | Full-screen environment outside safe content, top scrim, Arena parking and mode-appropriate Battle options using existing handlers. Quiet authoring and legacy redirects preserved. | Actual expired practice workspace; navigation/leave guards covered automatically. No forfeit/cancel invoked. |
| Round and final results | Authoritative HP and damage deltas beside the receiving fighter; omitted legacy unknowns. Final order: verdict → approved cinematic/status → framed rewards → details. Compact KO, explicit reviewed/no-contest/exhibition states and historical-video restrictions retained. | Actual ready-video result/rewards; HP, no-contest and signing-retry fixtures; orientation/review/media/recovery tests. No generation or spending from layout/retry. |

## Verification

Final verification after the currency/copy sweep: **192 Jest suites / 1536 tests passed**, zero snapshots; TypeScript passed; ESLint zero errors and one existing warning. Totals and log paths are recorded in `verification.json`. TypeScript, Expo ESLint and the complete canonical Jest suite were run. ESLint retains one pre-existing `no-require-imports` warning at `app/_layout.tsx:29` and no errors. Existing draft, tutorial, history, avatars, purchases, media and appeal-display coverage remains in the complete run. Supplementary ESLint for changed hooks/providers/fixtures is clean; balance suites were rerun after a dependency-expression cleanup. Fixture isolation checks and all gallery links pass.

Independent source review found four concrete issues: raw text under a native View, a missing reviewed-rating explanation, one focus ref reused across mounted tab headers, and an errored balance presented as zero. All were fixed; scoped re-review reported no remaining P1/P2. Native feedback then corrected intrinsic trait-image sizing, clipped draw amounts, small archetype art and large-text editor allocation. A final currency sweep covered idea rerolls, editor cost badges, restore labels and offer quantities.

The task baseline was copied outside the repository for scoped comparison. An early run accidentally discovered duplicate baseline tests; its doubled totals are excluded. Only canonical final test totals count. Source/test paths changed by this task are listed in `.superpowers/sdd/2026-09-22-shared-visual-refinement/changed-source.json`; unrelated pre-existing working-tree changes remain in place.

## Native evidence

The gallery contains **26 unaltered captures: 15 actual-route captures and 11 clearly labelled component fixtures**. Actual routes include Arena, Battles, Profile, Wallet, locked Edit Look with its pickers, an expired practice workspace, a completed practice cinematic/rewards and ended-season Rankings. The standard simulator is 402×874pt; the small simulator is 375×812pt, both iOS 26.5. Default and accessibility-large text were exercised; both simulators were returned to default text size.

The small simulator was signed out, so editable/rare-state evidence uses the development-only fixture root with isolated local data and a non-serving backend origin. Fixtures do not establish real account ownership, persistence, purchase completion, server outcomes or provider failure recovery. Existing live content was viewed without drawing, saving, buying, claiming, equipping, reporting, blocking or forfeiting. Opening an existing result can mark that result seen through the normal application flow. The observed account balance remained 130.

A Debug simulator app was rebuilt for native validation. The installed Xcode 27 toolchain required a **build-only iOS 16.4 minimum override** and a temporary relocation of the existing RevenueCat PaywallColor initializer. That Pod source was restored byte-for-byte (`cmp` passed). No dependency, checked-in minimum-OS or native-project change was retained by this task. This is a qualified local Debug build, not a clean production-toolchain/release certification.

## Open acceptance items

- **Android: blocked** until an environment exists, per the user’s instruction.
- **Direct native typing: blocked.** Simulator text injection returned success without text changes, also in an isolated plain React Native TextInput. Computer Use confirmed the Mac was locked; an unlock request was sent. The diagnostic route was removed. Focus-only images are explicitly labelled and do not count as keyboard acceptance.
- Live VoiceOver traversal and a complete OS Reduced Motion walkthrough have not been completed. Automated semantics/reduced-motion regressions do not substitute for them.
- Small-phone authenticated routes, full native foreground/restart draft recovery, remote price/lock changes, provider/payment failure states and real reviewed-human-result export need the remaining device matrix.
- Same-device typing/scroll/transition/memory performance comparison was not completed.
- The earlier 375pt / large-text Japanese-heading clipping observation remains open; the short Unicode list fixture does not establish a fix for that separate runtime behavior.

These are evidence/release gates, not claims that the associated flows failed. Full release acceptance stays open. Production distribution remains a separate task.

## Assets and repeatable entry points

- [Trait manifest](../../../assets/images/traits/manifest.json), [source prompts](../../../output/imagegen/2026-09-22-traits/prompts.md), `constants/TraitPreviewArt.ts`.
- Actual app uses the ordinary Metro root on 8081. [Fixture instructions](../../../test-support/fixtures/README.md) describe the isolated 8082 root.
- `/refinement?state=round|review|recovery|rows` supplies local result/Safety states; `/edit-look?section=fighter&controls=hide&included=2` supplies editor presentation only.
- Design language, concept and acceptance documentation reflect the implemented rules and the outstanding native evidence.
