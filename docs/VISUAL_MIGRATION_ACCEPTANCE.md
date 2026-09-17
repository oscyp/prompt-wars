# Visual migration 1.3.0 — acceptance record

This is a release gate, not a claim that native acceptance has passed. Approved scope: `plans/2026-09-15-complete-visual-migration.md`. The original dirty working state was preserved at `/tmp/prompt-wars-visual-baseline`; no backend rollout or data migration belongs to this release.

## Screen inventory (21 routes)

| # | Screen | Route | Required states | Current native evidence |
|---|---|---|---|---|
| 1 | Arena | `(tabs)/home` | known fighter; failed/empty/refresh; actionable round first; quests/offer | iOS dev screenshot after clean restart; remaining state/device matrix pending |
| 2 | Profile | `(tabs)/profile` | equipped frame; progress; share; error/retry | iOS dev navigation/scroll observed |
| 3 | Battles | `(tabs)/battles` | active loading; action/wait; history cursor; canceled; errors | Pending |
| 4 | Rankings | `(tabs)/rankings` | global/seasonal; 0–4 players; season status; safety | Pending |
| 5 | Mode picker | `create` | every mode; costs; unavailable | Pending |
| 6 | Matchmaking | `(battle)/matchmaking` | finding; matched; bot; error; free cancel/park | Pending |
| 7 | Battle workspace | `(battle)/prompt-entry` | long name/theme; keyboard; each move; all modes; failed/paid/submitting/draft recovery | Pending |
| 8 | Waiting | `(battle)/waiting` | exact deadline; waiting/judging; signing/error; park | Pending |
| 9 | Round result | `(battle)/round-result` | win/loss/draw/KO; HP; details; continue; media | Pending |
| 10 | Series result | `(battle)/result` | win/loss/draw/no-contest; appeals; review revision; historical video; share | Pending |
| 11 | Sign-in | `(auth)/sign-in` | keyboard; errors; native Apple sign-in | Pending |
| 12 | Sign-up | `(auth)/sign-up` | age gate; keyboard; errors; validation | Pending |
| 13 | Password reset | `(auth)/reset-password` | request/error/success; keyboard | Pending |
| 14 | Welcome | `(onboarding)/welcome` | starter practice; customize-first; retry | Pending |
| 15 | Create fighter | `(onboarding)/create-character` | every step; drafts; grants/renders/errors | Pending |
| 16 | Edit fighter | `(profile)/edit-character` | Look/Fighter/Gear; durable draft; render recovery; respec | Implemented; automated checks passed; partial iOS evidence, keyboard/VoiceOver/Reduced Motion native checks pending; Android blocked |
| 17 | Cosmetic Shop | `(profile)/shop` | all categories; All/Owned; worn slots; preview; buy/equip/remove; retry | iOS dev preview screenshot after restart; collection scroll and footer observed |
| 18 | Stats | `(profile)/stats` | empty/loading/error; recent data windows; insights | Pending |
| 19 | Wallet | `(profile)/wallet` | localized prices; pending reference/check-again; ledger; restore; subscription | iOS dev navigation and balance observed; pending/store states still pending |
| 20 | Settings | `(profile)/settings` | native switches; disclosures; destructive confirmations | Pending |
| 21 | Blocked users | `(profile)/blocked` | empty/error/retry; unblock busy/failure | Pending |

Startup/root loading/error gates and legacy face-off/move-select redirects are additional states, not new screens.

## Overlay and media inventory

Mode sheet; report and independent block; free forfeit/cancel; draft discard; purchase confirmations; one-time offer; archetypes; gear/item details/custom item; portrait viewer/history; render reveal/restore/retry; tutorial hints; toast/inline errors; native permissions/sign-in/payment; free verdict/winner/judge/payoff beats; round poster; share capture/current revision; splash/font-failure fallback. Essential actions must be reachable without scrolling optional media/details.

## Required device matrix

Record screenshots and actual interaction outcomes for iOS and Android: default and accessibility text size, a small phone, software keyboard/caret, VoiceOver/TalkBack focus/confirmation, Reduced Motion and background/return. Include `Łucja García`, `李小龍`, `Мария`, an unbroken long name, long localized prices and exact localized deadlines. Decorative assets must not intercept taps or focus. Verify >=48pt shared targets and 4.5:1 normal/3:1 large text contrast.

Exercise move switches during editing, failed submission, tab/back/cold links, background/restart drafts, tutorial resumption, purchase delayed completion without another purchase, artwork signing recovery without another render, media retry and revised-result sharing. Do not spend real money or create production competitive fixtures solely for visual acceptance.

## Automated evidence

Baseline before migration: 134 Jest suites / 1103 tests passed. Focused checks are recorded in `.superpowers/sdd/2026-09-15-complete-visual-migration/` during implementation. New behavior coverage includes semantic controls/font failure and stall fallback, collection breakpoints, frame apertures, snapshot artwork recovery, native editor identity across keyboard/move changes, reveal pause, share revision and modal focus restoration. Final integrated automated run: 148 Jest suites / 1193 tests passed (no snapshots), TypeScript passed, and Expo lint passed with one pre-existing require-import warning in app/_layout.tsx. Machine-readable totals are in output/visual-migration/automated-verification.json. Device acceptance remains separate. Static WCAG calculation of the dark palette: body/background 18.75:1, secondary/card 12.07:1, tertiary/card 7.00:1, lavender action ink/fill 10.18:1, gold/card 8.46:1. These token checks do not substitute for checking text over artwork.

## Native build and environment record

- Existing iOS development app on iPhone 17 Pro / iOS 26.5 renders the new wordmark/font/card/nav and Shop. Initial screenshots are under `output/visual-migration/native/ios/`. These precede follow-up sizing refinements and are not final acceptance.
- Fresh Xcode native build was attempted with `/tmp/prompt-wars-visual-native`; tool timed out while Xcode first-launch setup remained incomplete (`xcodebuild -checkFirstLaunchStatus` exit 69). Requested completion of Xcode component/admin setup. No legal agreement was accepted by the agent.
- Android Studio, Android SDK, adb, emulator and AVD are not present in the normal tool/path locations. No Android native checks have passed. The user explicitly selected finishing implementation and recording Android validation as blocked (15 September 2026). This does not waive device acceptance or authorize claiming an Android release.
- Bundled font files, license, UIAppFonts/resources and new splash artwork/storyboard are integrated in the checked-in native project. Info.plist and the Xcode project pass plutil lint; font resource references were explicitly inspected and normalized. A fresh native cold/offline launch remains mandatory.
- No same-device typing/scroll/transition/memory baseline comparison has yet passed. Capture both baseline and candidate under matching settings and data; investigate any material regression.

## Distribution gate and rollback

Version is 1.3.0; the next build number is EAS managed. Do not distribute an incomplete inventory or mark pending native checks as passed. After acceptance, produce TestFlight and Android internal builds. Keep combat and appeal flags unchanged. Rollback selects the prior stable client build; do not reverse migrations or rewrite server data.

Last completed iOS store build read from EAS: 1.2.0 (9), build ac588207-838f-4813-96fc-fb3db760fb36, created 2026-09-14. Treat this as rollback candidate; EAS build completion alone does not prove App Store Connect processing or tester distribution. EAS account/project access verified. The attempted visual-validation build was rejected by automatic approval review before upload: it requires explicit authorization to send private source/build inputs to the existing Expo EAS project and consume a cloud build. That approval was requested and remains pending. No new cloud build or store submission has started.

## Final code review record

All implementation waves and the final shared-component sweep passed independent specification and code-quality review after corrections. Reports live in .superpowers/sdd/2026-09-15-complete-visual-migration/. Corrected findings include long-value line height, real modal opener focus, narrow ranking/creator recap layouts, compact snapshot frame/aura consistency, and small touch targets. The existing audio-provider source and test hashes match the pre-migration baseline. The app icon is unchanged.

The iOS development walkthrough additionally observed Arena → Shop → Wallet → Shop and a Classic Frame preview on the same fighter, with Portrait/Avatar choices and persistent Equip/Clear/Close controls. No purchase or equipment mutation was performed. This is limited walkthrough evidence, not a complete VoiceOver or device-matrix pass.

Local offline Expo export passed for both platforms (iOS 2081 modules; Android 2096 modules). Both Hermes bundles include the two Barlow fonts and branding assets. Output: /tmp/prompt-wars-visual-export. This validates bundling, not compiled native fonts/splash, device behavior or distribution.

## Navigation consistency pass — 15 September 2026

The four tab destinations now have scalable Barlow labels, gold selected bevels, readable inactive icons, explicit accessible names and lavender attention badges. The measured label height expands the bar for wrapped text; the fixed central slot retains the raised Battle action. React Navigation still owns events, links and state. Profile, practice replay and Settings destinations use the shared 64-point `GameNavRow`, with wrapping copy, quiet icon tiles, external-link indicators, focus feedback and disabled/busy semantics. Editor categories use angular selected surfaces and announce unsaved changes.

Verification: 149 Jest suites / 1198 tests passed, no snapshots; TypeScript passed; Expo lint passed with the same pre-existing require-import warning in app/_layout.tsx. The focused navigation suite also passed after the final focus-ring refinement. The real React Navigation harness covers retained scene state, selected state, Battle action independence, long presses, prevented presses, wrapping labels at a 320-point viewport and large text, plus menu link/busy/disabled behavior. Category coverage checks >=48-point targets, complete labels, selection/haptics and selected-text contrast. Full run data: `output/visual-migration/navigation-pass-verification.json`.

On the existing iOS development app, observed Arena → Profile → Settings → Back with the Profile scroll position retained. Opened Battle modes from Profile without changing the tab. After restarting the development app with Expo’s floating tools overlay hidden, the original Close control dismissed the picker and returned to the same Arena state. No battle was started, purchase made, equipment changed, or account action submitted for this pass. Screenshots reviewed:

- `output/visual-migration/native/ios/arena-navigation-pass-dev.jpg` (debug overlay hidden)
- `output/visual-migration/native/ios/profile-navigation-pass-dev.jpg`
- `output/visual-migration/native/ios/settings-navigation-pass-dev.jpg`

These are development-runtime screenshots, not fresh 1.3.0 native binaries (Settings reports the installed development binary's older version). Android validation remains blocked by the missing SDK/emulator, per the user's instruction. The complete device matrix, fresh native font/splash build and distribution gates above remain pending. Existing audio-provider source/tests still match the pre-migration baseline.

Native test-environment note: Expo Dev Menu's floating gear uses a 72×94-point frame plus a 10-point hit-test inset, overlapping the picker Close control despite the visible gear being smaller. The unchanged Close control succeeds with the launch-only argument `-EXDevMenuShowFloatingActionButton NO`. No product-layout workaround was retained; temporary diagnostics were removed and `BottomSheet.tsx` was restored byte-for-byte to its pre-pass state. This launch argument changes neither production UI nor stored user preferences.


## Mockup-parity refinement — 15 September 2026

The audit-driven implementation supersedes the earlier selected-tab bevel: tabs now use custom gateway/blades/rankings/profile glyphs, gold selected underline and a focus-only outline. The raised central Battle action remains. Shared custom icons, metallic native headings, divided responsive stats, fighter-caption assembly, duel/theme/move/lock-in presentation, Shop wearing strip/tab rail/joined filter/item hierarchy/fairness footer have implementation coverage in the [22-ID matrix](audits/2026-09-15-mockup-parity/acceptance.md).

Latest integrated checks: 155 Jest suites / 1,239 tests, TypeScript pass, ESLint zero errors with the pre-existing startup require warning. Accepted-submit cleanup failure, stale round confirmations/responses and labeled-icon accessibility received additional regressions. Existing audio-provider implementation/test hashes match the baseline for this goal; no server deployment or data mutations were made.

This records implementation and partial native evidence, not full release acceptance. Existing Debug binary/current JS captured normal live Arena/Shop, a local icon/contact sheet, local battle component styling and 214% text stat reflow. The local 8082 fixture root is development-gated, outside production routes and isolated to dummy loopback backend credentials. It cannot prove real-route keyboard/draft/purchase integration. Follow the matrix for remaining captures; Android and fresh native Xcode build/font/splash gates remain blocked as previously recorded. Distribution remains gated.

Native build retry: first-launch status now passes, but Xcode 27 rejects old Pod resource deployment targets and, with a build-only 15.1 minimum override, fails in RevenueCat 5.67.1 `PaywallColor.swift` with a synthesized initializer redeclaration. This supersedes the earlier first-launch diagnosis. No billing SDK or Pod configuration was modified. See the parity acceptance record for exact logs; fresh native release validation is still blocked.


## Edit Look follow-up — 16 September 2026

The compact editor replaces the collapsing stage, uses the approved Edit Look reference, and preserves free saves, live-priced confirmed drawing, account/fighter drafts and paid operation recovery. See [implementation and validation](audits/2026-09-16-edit-look/IMPLEMENTATION.md) for the exact changes, automated results, native screenshots and remaining acceptance work. This follow-up does not authorize a version bump, build, distribution or backend deployment. iOS fixture evidence is separate from production-route evidence; Android remains blocked as instructed.
