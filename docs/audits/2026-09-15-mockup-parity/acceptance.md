# Mockup-parity acceptance evidence

All finding groups have implementation changes; final visual and behavior acceptance remains in progress. The full 22-finding contract remains in README.md and the implementation plan. A screenshot or passing unit test closes only the state it actually proves.

## Current native environment

Existing iOS development app, iPhone 17 Pro / iOS 26.5, simulator 5BCEAF70-7392-4F8F-92F6-4249428CA786. Native viewport 402×874; tool downscales captures to 368×800. Current live fighter AndrewTwo, Neon Circuit equipped; 126 credits. Default text. New compiled 1.3.0 font/splash validation remains pending. No purchase, equipment change or new battle was performed to populate evidence.

| Evidence | Observed | Remaining |
|---|---|---|
| `screens/arena-stat-parity-dev.jpg` | Four stats on one row with three gold dividers; custom hanger/mask, custom root icons, selected underline. | Small phone, large text, native cell bounds, later caption attachment refinement. |
| `screens/shop-parity-dev.jpg` | Centered wordmark with normal balance, compact wearing strip, five underlined tabs, joined filter, name-before-rarity item tiles. | Long balance, text scaling, all categories, footer, complete equipment and preview checks. |

## Required fixture matrix

Native captures: widths 320, 375, 390/402 and 430; default and accessibility text; missing-font fallback; short/long names and unsupported scripts; 1–10 stat values; no, circular and full-body frame equipment; long localized prices/deadlines. Workspace: real single/Bo3 and both player orientations, AI practice, long theme, each move, keyboard, Ideas/modes, failed draft and failed/holding/submitting states. Reuse local fixture data outside app routes and test discovery; no production mutations.

Android validation remains blocked by the missing SDK/emulator, as the user instructed. Do not mark the full native matrix, performance baseline, VoiceOver/TalkBack or fresh offline launch as passed from these captures.

## Implementation matrix (15 September, current goal)

“Implemented” records source coverage, not a blanket native pass. The approved references contain Arena, workspace and Shop only. Different live names/art/prices and circular equipped frames are data exceptions, never fixture values to inject into accounts.

| ID | Implemented source / result | Current evidence and remaining gate |
|---|---|---|
| G1 | `game/icons`: original glyph family, compatibility adapter and destination/move/status consumers | Native icon contact sheet and live Arena/Shop. Remaining 21-screen audit / VoiceOver. |
| G2 | `GameDisplayTitle`, `GameHeader`: native measured silver/gold headings, casing and system fallback | Native normal headings/contact sheet; Jest missing-font/non-Latin fallback. Existing Debug binary cold-launch font-unavailable fixture passed; fresh production font/splash gate remains. |
| G3 | `GameButton`, `GameBevel`, move tiles and lock control: separate materials/states | Native move/lock/Preview examples; state/contrast/selection tests. Large-text state matrix pending. |
| G4 | `GameMasthead`, `CreditChip`, Arena avatar and Shop opener | Normal live Arena/Shop. Long balance and native cold-link round trip pending. |
| A1 | `FighterStatTray`: four equal cells, three rules, deliberate 2×2 | Live default screenshot; accessibility 2.14 fixture capture. 320/375/390 layout-equivalent containers and native stat-cell bounds checked; other physical devices remain. |
| A2 | `FighterCard`: attached caption/stats, measured cosmetic lower padding | Same live fighter retained. Final default/circular/full-body side-by-side capture pending. |
| A3 | `ArenaFighter`, `GameAttentionStrip`: hanger/mask actions and illustrated actionable count | Live action icons; actual count wiring tested. Pending-action native state pending. |
| N1 | `ArenaTabBar`, tab layout and destination menus: glyphs, gold underline, raised Battle | Live tab visuals; existing navigation tests. Profile → Settings → back preserves scroll; Arena/Profile mode sheet closes via native accessibility action. Full deep-link matrix remains. |
| B1 | Workspace round/mode title from real source | Source/fixture plus single/practice tests. Full-route native fixture pending. |
| B2 | `VersusStrip`: mirrored gold plates, default chamfered/cosmetic portraits, real score/HP | Native inspection found wrapping and prompted wider label/HP rows. Final normal refreshed capture: `battle-parity-fixture.jpg`; full-route/both-orientation native matrix pending. |
| B3 | `BattleThemePlaque`: visible right focal crop and localized scrim, gold native theme | Native capture prompted second art refinement. Long-theme/native default and 2.14-scale examples checked; full-route matrix remains. |
| B4 | Exact deadline below theme, integrated viewer-oriented score | Source tests and native fixture. Values are local sample data in fixture. |
| B5 | `BattleMoveTile`: bolt/shield/skull, explicit selected check, ember/cyan/violet bevel | Native default fixture and editor-preservation tests. Native 2.14-scale stacked layout captured; full-route interaction remains. |
| B6 | Workspace prompt/Ideas/editor/draft hierarchy | Real-route Jest typing/move/Ideas/recovery tests. Composed fixture does not prove pinned keyboard/footer integration. |
| B7 | `BattleLockInControl`: quill, progress and truthful state | Native normal ready capture; hold/confirmation/failed/accepted/stale-round tests. Full native state matrix pending. |
| S1 | `ShopEquippedSummary`: compact current slot, expandable all equipment, real color edit | Normal live Shop + screen/recovery tests. Expanded native loadout and live portrait/avatar preview checked; no purchase/equip mutation. |
| S2 | `ShopCategoryTabs`: five underlined tabs with selected reveal | Normal live Shop + selection/resize tests. Native 2.14-scale horizontal rail scroll checked; measured category targets are 48pt high. |
| S3 | `ShopFilterControl`: joined All/Owned | Normal live Shop + recovery/empty tests. |
| S4 | `ShopItem`: art/name/rarity/status/price/earned/Preview; all catalog items retained | Normal live collection/footer capture + layout/recovery tests. Long-price 390-layout fixture captured with 48pt Preview targets; actual purchases not performed. |
| S5 | `ShopTrustFooter`: exact ruled shield-check statement after content | Live `shop-footer-parity-dev.jpg` inspected. |
| V1 | Shared title/icon/card/control propagation through existing routes and overlays | Source inventory and regression suite; complete native state inventory pending. |
| V2 | Guarded local native fixture root and explicit evidence ledger | Runtime 8082 uses loopback backend dummy credentials. Current iOS component captures only; release matrix remains open. |

### Additional evidence

- `screens/shop-footer-parity-dev.jpg`: live Shop bottom, default text, existing AndrewTwo/Neon; complete prices and earned path, exact fairness footer. No catalog/equipment mutation.
- `screens/icon-contact-sheet-fixture.jpg`: native local SVG family, 402pt, scale 1.00, fonts loaded, top of Icons surface. No live business data.
- `screens/lock-in-fixture.jpg`: native local editor and ready lock-in, 402pt, scale 1.00, middle/bottom of Battle surface. Demonstrates appearance only: fixture hold/confirmation are local and the footer is composed in a scroll view.
- The native fixture launcher is development-only and forbidden by config in EAS/production. It sits outside the production Router root. Static config/direct-call isolation checks pass; this is not a full transitive network audit.

### Explicit remaining native gates

The current old Debug binary loading current Metro JS is not a freshly built 1.3.0 app. Fresh Xcode build/font/splash validation is blocked by the current Xcode 27 / RevenueCat compiler incompatibility described below; first-launch status now passes. Android SDK/emulator remains unavailable and validation is blocked per user decision. Small-phone/other widths, complete native bounds, full workspace route keyboard/draft/background behavior, VoiceOver/TalkBack, Reduced Motion, cold/offline startup and same-device performance still require their named evidence. The later explicit release request authorizes the 1.3.1 production build and TestFlight submission; see the release record below.

- `screens/stats-accessibility-fixture.jpg`: iPhone 17 Pro 402pt, iOS content-size accessibility-large, measured RN fontScale 2.14 after relaunch, local Mira/no equipment/mixed stats. Four complete labels/values in deliberate 2×2 with gold internal rules; actions wrap vertically. Bundled fonts loaded, offline Metro with dummy backend, scrolled to hero caption/stats. Native debug-tools bubble is development chrome.

- `theme-accessibility-fixture.jpg` and `moves-accessibility-fixture.jpg`: same 402pt / fontScale2.14 local fixture, sample Last Library theme and default names, no equipment. Visible right-side art and complete multiline title/deadline; three moves stack deliberately with readable labels and independent Attack check. The first image predates the final HP inset correction; theme evidence remains current.

- `lock-in-accessibility-fixture.jpg`: local Battle bottom at 402pt / fontScale2.14. Complete prompt, saved-state text, ready quill/ring action and confirmation all wrap visibly. Appearance evidence only; this composed fixture does not establish production footer/keyboard integration.

- `shop-accessibility-fixture.jpg`:402pt / fontScale2.14 local Shop/no equipment. Wearing summary wraps, category rail overflows horizontally, joined filter remains readable and collection uses one column. Native category horizontal scroll and expanded loadout checked separately. Synthetic catalog values are not production pricing.

- `battle-parity-fixture.jpg`: final current duel/theme/moves at 402pt / fontScale1.00, local Mira/Rook, no equipment, zero series score, short theme. Mirrored plates, 72pt default portraits, complete labels/HP with inset bars, diamond VS, visible theme art and custom selected move are observed. The fixture has its own development restore button and smaller title style; it is not a production-route screenshot. Different bundled mood art is a data/reference exception. Right portrait is partly overlapped by the native development-tools bubble, not production chrome.
- `shop-tabs-scrolled-accessibility-fixture.jpg`: native horizontal scroll at fontScale2.14 exposes Auras/Badges/Colours without wrapping the tab rail. Complete loadout expanded/collapsed through the native button and all four slot labels plus Edit character colours were in the runtime accessibility snapshot.

Implementation inventory: [all 21 screens and additional surfaces](consumer-inventory.md). Latest full suite: 155 suites / 1,242 tests after name/archetype matchup reflow corrections. TypeScript and focused lint passed; independent battle review passed 29 focused tests.

- `arena-final-caption-dev.jpg`: final live AndrewTwo/Neon at 402pt/default text after restoring original 8081 server. Gold name/caption attaches to measured frame, four stats align with three gold dividers, paired hanger/mask actions and raised Battle/selected underline are visible. Account and 126-credit balance restored unchanged.

- Live native Profile → Settings → Go back returned to the identical Profile runtime screen hash `1kls9o7` with the same scrolled menu location. `profile-menus-dev.jpg` and `settings-dev.jpg` show custom destinations, readable rows, shared heading and native switches. No settings were toggled.

- Central Battle opened the mode sheet from Profile without choosing a mode. Native automation did not dismiss it through the close target; the development-tools bubble is near this control, so dismissal and focus restoration are not yet accepted from this run. No automatic enqueue or production match was triggered.

- Direct computer-use fallback for the mode close check is blocked: the registered/running Simulator references `/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app`, which is absent. Native runtime tools still capture the existing simulator; full direct-UI confirmation requires repairing the Xcode/Simulator installation. No application dismissal code was changed based solely on this automation result.

## Latest native build diagnosis (14:54–14:56 UTC)

`xcodebuild -checkFirstLaunchStatus` now exits 0. Active toolchain is Xcode 27.0 (27A266a). A fresh Debug build first failed because several existing Pod resource targets declared iOS 9–13 minimums, below the SDK 27 minimum 15. A diagnostic build-only `IPHONEOS_DEPLOYMENT_TARGET=15.1` override (the app's existing minimum) passed that stage and failed in installed RevenueCat 5.67.1:

```
RevenueCat/Sources/Paywalls/PaywallColor.swift:57
invalid redeclaration of synthesized memberwise 'init(stringRepresentation:)'
```

No Podfile, lockfile, billing dependency or vendored SDK was changed to bypass this failure. Current native screenshots still come from the existing Debug binary with current Metro JS. Fresh font/splash/offline/native acceptance remains blocked; the earlier first-launch blocker is superseded. Build logs: `~/Library/Developer/XcodeBuildMCP/workspaces/prompt-wars-6f3579d758f6/logs/build_sim_2026-09-15T14-54-48-194Z_pid96446_da654fbb.log` and `build_sim_2026-09-15T14-55-19-090Z_pid96446_722c187f.log` in the same directory.

Fixture server 8082 stopped after capture; original server 8081 and live Arena restored, original iOS text-size setting `large` restored. Final focused lint and TypeScript passed after all source edits.

## Follow-up native evidence (15:00–15:20 UTC)

This continuation made implementation and verification progress. It did not repeat the fresh-build failure or attempt distribution.

- **B2 overflow fixed:** at a 335pt native content width (375pt screen-gutter equivalent), long Latin and Japanese names previously made the two plates 221pt and 197pt wide, pushing the opponent beyond the viewport. Plates now explicitly share the measured width after reserving the center/gaps. Names taking more than two lines beside portraits reflow below both portraits. Native after widths are 142.33pt and 142.67pt (pixel rounding); both remain within the 335pt parent. `screens/battle-long-names-375-container-fixture.jpg` shows the final contained names/HP and P2-oriented score 0–1. Long theme/deadline are retained; the image ends before the full scrolling theme/deadline. Independent review found no issues; native screen captures remain component evidence.
- **A1 narrow/default values:** `stats-320-container-fixture.jpg` uses a 280pt content container and deliberate 2×2; `stats-375-container-fixture.jpg` uses 335pt with all stats at 1 and four columns; `stats-390-container-fixture.jpg` uses 350pt with all stats at 10 and four columns. All at actual viewport402×874, fontScale1.00, bundled fonts loaded, isolated loopback backend, Stats fixture at top with controls hidden. These are container-width checks, not separate-device checks.
- **Native bounds:** [native-bounds.json](native-bounds.json) records AXe frames for stat cells, matchup/portraits, move container, lock-in, Shop category targets and Preview buttons. Stat cells share a y coordinate and widths within one physical pixel; measured inter-cell gaps are 1pt. Decorative divider nodes are excluded from the accessibility tree and are verified visually, not claimed as directly measured AX nodes. Category and Preview targets measure48pt high; local lock-in measures64pt. Off-screen coordinates describe scroll content, not current reachability.
- **Native font fallback:** `font-unavailable-native-fixture.jpg` follows a complete stop/reopen of the existing development binary with display registration skipped. The runtime reported `Display fonts: unavailable — system fallback`; shared headings and stats remain visible, and wider system labels deliberately use2×2. Viewport402×874, fontScale1.00, content362pt, no equipment, mixed stats, no live backend. This proves actual missing-font component fallback, not production splash/font integration.
- **S4 long price:** `shop-long-price-390-container-fixture.jpg` shows synthetic123456789-credit price complete, real bundled frames and explicit Preview actions. Actual viewport402×874, content350pt, fontScale1.00, fonts loaded, long fixture fighter name, no account writes, scrolled to first collection row. The screenshot uses168pt cells; the final harness matches production’s169pt formula at this width. Native bounds were collected after that one-point fixture adjustment.
- **N1 sheet dismissal:** the Xcode27 frontend is Device Hub (`com.apple.dt.Devices`). Its native accessibility click dismissed the battle-mode sheet from both Arena and Profile and returned to the originating tab. The earlier statement that direct UI was unavailable is superseded. AXe touch targeting still did not establish physical-touch dismissal; a direct coordinate click returned `noWindowsAvailable`. No application dismissal change was necessary. Screen-reader focus restoration is still not accepted without a VoiceOver run.
- **Live Shop preview:** `shop-preview-portrait-dev.jpg` shows the full-body Astral Codex on the current fighter and reachable Clear preview/Buy25cr footer. Switching to Avatar showed the distinct circular aperture and the same fighter. Closing returned to Shop with Neon Circuit still equipped and126credits. No Buy/Equip action was pressed. This uses the old Debug binary/current JS at402pt/default text; generated art is existing account art.
- **Harness isolation:** the second Metro initially replaced real generated route declarations. The launcher now sets `EXPO_NO_TYPESCRIPT_SETUP=1`; a failing-before/passing-after guard covers it. Real route types were regenerated from`app/`, and TypeScript passes while fixture Metro runs. The Shop fixture now mirrors production row stretch, gap and numeric column widths; the earlier center-aligned fixture caused artificial extra blank card height. No production Shop behavior changed for this harness issue.

Fixture8082 stopped; ordinary8081 app and original text size restored. Audio provider and test remain byte-identical to the goal baseline. Fresh iOS compilation, complete production workspace keyboard/background recovery, the full physical-device/VoiceOver/Reduced Motion/performance inventory and Android remain open as previously identified. This is not release acceptance.

## Release request and actual small-phone check

The user explicitly requested a version bump, production build and submission after the implementation work. Version1.3.1/build10 is now dispatched to EAS with automatic TestFlight submission; [release record](../../deployments/2026-09-15-release-1.3.1.md). This does not convert the outstanding native/Android gates into passes.

An isolated iPhone13mini/iOS26.5 simulator (`6F8B783F-D76B-4F4F-8174-94F52489E10F`) provided an actual375pt viewport. It runs the existing Debug binary with current fixture JS and no account. The short-name battle showed the system-font archetype breaking MYSTIC into two lines. The archetype now uses the bundled condensed label font; native measured wrapping also triggers portrait reflow for longer/fallback labels. `screens/battle-375-native-fixture.jpg` shows the final default Mira/Rook matchup, all HP and MYSTIC on one line at actual375pt, default text and no equipment. A regression covers both names and archetypes. This remains component evidence, not a production build or full-route keyboard test.

Release checks:155suites/1,242tests pass, TypeScript passes, lint has0errors/1pre-existing warning, native plist/project validation passes. Fixture Metro8082 is stopped and Xcode tools target the original live simulator again. The production upload excludes fixture/test/backend/env/credential/agent artifacts and contains both display-font files.

The authorized EAS production build **1.3.1 (10)** succeeded at **20:43 UTC, 15 September 2026**, using Xcode 26.2. This establishes fresh signed release compilation; it does not establish native interaction, cold/offline launch or Android acceptance. The local Xcode 27 incompatibility remains separately recorded. Automatic TestFlight submission follows the completed build.
