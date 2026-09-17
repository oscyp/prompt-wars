# Local native parity fixtures

Start a **second** development server from the repository root:

```sh
rtk proxy sh scripts/visual-fixtures.sh
```

This selects `test-support/fixtures/app` using `extra.router.root`, starts Expo development-client Metro on port **8082**, and leaves the ordinary server on **8081** alone. Open the existing development client against the 8082 URL using the native-session owner's workflow. The script does not boot a simulator, build, install, or submit anything. It sets `EXPO_NO_TYPESCRIPT_SETUP=1` so the second server cannot overwrite the real app’s `.expo/types/router.d.ts`, `expo-env.d.ts`, or TypeScript setup. The normal server owns route type generation. Do not use the fixture flag in a production/build command: config rejects it unless NODE_ENV is development and EAS_BUILD is absent. With the flag absent the router configuration has no alternate root.

The local layout loads the existing bundled Barlow fonts and uses SafeAreaProvider and Router Stack. It has no AuthProvider, RevenueCat, battle/audio/business provider or mutation hooks. Buttons only update local state. Because shared FighterCard imports the existing eager cosmetics/Supabase module transitively, the launcher replaces public Supabase URL and keys with a non-serving loopback origin and dummy key. This isolates the Supabase auth storage namespace from the real app; do not start by setting only the router flag. No live account/catalog/battle endpoint is requested by fixture actions. Static checks cover direct calls, not a full transitive network audit.

## Use

Select Arena, Battle, Shop, Icons, or Stats in the controls. Layout cycles the current viewport and 320/375/390-point screen-gutter equivalents; these are measured native component containers inside the current simulator, **not** evidence of a different device. The capture subtracts the same 20-point screen gutter on each side, and the Shop grid uses the production gap and column-width formula. Cycle name, stats (mixed, 1, 10), equipment (none, circular Neon, illustrated Astral), long content and missing-art variants. Battle adds single/Bo3, ranked/practice, viewer orientation, series score and each lock presentation state. Shop categories, All/Owned, complete-loadout expansion and preview buttons are interactive; preview deliberately shows a read-only message. Typing, move selection and guided/custom controls keep the local editor state. Hold only displays partial progress; it does not run the real submission state machine. Failure/blocked/submitting/submitted are manually selectable visual states.

Use “Hide fixture controls” and scroll its small restore button above the capture viewport for a comparable image. The `native-fixture-capture` view contains the composed screenshot content. The surrounding development controls are never production UI.

For each capture record actual viewport, OS, font scale, runtime/build provenance, selected name/stats/equipment/state, font status, network state and scroll position in the audit evidence. Use actual devices/simulators for full 375/390/430 and 320-point acceptance; bounded-container controls only establish component reflow. The Icons surface includes the real glyph registry, diacritic/non-Latin headings and an explicit system-font heading. That last heading does **not** simulate a cold font-loading failure. Collect native element bounds using the session owner's accessibility/screenshot tools; these fixtures do not invent measured bounds.

## Edit Look native workspace

Open **Edit Look fixture** from the index (fixture route `/edit-look`). This is a full-height editor composition using the real preview, tabs, Look/Fighter/Gear panels, footer, item details, card/history sheets, and confirmation sheet. It has one root iOS keyboard avoider and one vertical form scroll; the header, preview, tabs, and footer remain outside that scroll. The preview compacts when the keyboard opens or the actual viewport is short. Use actual small and standard simulators for keyboard and footer captures; this route does not simulate another device with a narrower container.

The horizontal DEV control rail exposes ordinary accessible buttons named **DEV Look**, **DEV Writing**, **DEV Fighter**, **DEV Gear**, **DEV Locked**, **DEV Pending**, **DEV Failure**, **DEV Card**, **DEV History**, **DEV Confirm**, and **DEV Reset**. Swipe the rail to reach later buttons. These duplicate state selection for native automation tools that omit `tab` targets; the real editor tabs remain interactive. Tap the small DEV note to hide or restore the rail before captures. While typing, **DEV Dismiss keyboard** dismisses the keyboard; the rail hides to preserve form space. Record the visible DEV note and native viewport as part of capture provenance.

All editing state is in memory and artwork comes from bundled assets. Save, drawing, status checking, battle management, and confirmation actions only show a local preview message; they never invoke their production operations. This fixture validates component presentation, sheet reachability, and keyboard geometry, not live draft persistence, account writes, battle locks, pricing, or render recovery. Continue to launch through `scripts/visual-fixtures.sh` so shared imports retain the dummy Supabase origin and isolated auth namespace.

## Coverage limits

This is composed native component evidence, **not proof of full production route integration**. It does not prove navigation retention, real server snapshot orientation, authentication, draft persistence/background restoration, timed hold cancellation, actual submission/refund recovery, live catalog ordering/prices, purchase/equip flows, native font/splash startup, or Android acceptance. Synthetic cosmetic prices and text deliberately stress layouts and must not be represented as server catalog data. Fighter art is the existing bundled archetype illustration, not the approved mockup's Mira render. Equipped frame apertures are real current component presentations, including circular/fullBody variants.

## Checks

```sh
rtk proxy node scripts/visual-fixtures-check.cjs
rtk proxy yarn tsc --noEmit
rtk proxy yarn eslint test-support/fixtures/app test-support/fixtures/mockupParity.ts scripts/visual-fixtures-check.cjs
```

The config test verifies normal-root preservation and rejection under production/test/missing NODE_ENV or EAS build, plus development-only selection. Passing static checks is not visual acceptance. Do not close audit V2 until actual native captures, measured bounds and named exceptions are reviewed.

## Native font-unavailable case

Stop the fixture server, then run `rtk proxy env EXPO_PUBLIC_FIXTURE_SKIP_FONTS=1 sh scripts/visual-fixtures.sh --offline` and fully stop/reopen the development app against port 8082. The fixture skips font registration and reports actual `expo-font` availability in its controls. On an older binary without embedded display faces this exercises the shared native system fallback. If the native binary already embeds the fonts, it will report loaded; do not call that a missing-font check. This remains distinct from a freshly compiled production splash/font/offline launch. Stop the server and reopen the ordinary 8081 app after checking.
