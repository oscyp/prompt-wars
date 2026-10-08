# Android native fixture verification — 2026-10-07

## Environment and scope

Local Android API 35 arm64 AOSP emulator, Expo Go SDK 55, dedicated ADB port 5038 / emulator 5582 / Metro 8083. The composer fixture imports production composer state, components, layout, and hold control. Its Supabase URL was overridden to localhost port 9; no live backend submission or purchase occurred.

Widths below use Android `wm size` with density 160, giving logical dp widths, and real software keyboard input. The fixture matrix is component/runtime verification, not a completed live battle. A separate signed APK cold-launch smoke is recorded below. Temporary scripts used sequential UIAutomator snapshots and native ADB input; XML and PNG files are evidence. Expo Go's Tools overlay and the explicit DEV banner are fixture/runtime chrome, not product UI.

## Executed checks

| Check | Result / evidence |
| --- | --- |
| Action → Intention → Approach → Your move | Passed, `390-*-top`, `390-*-selected`, `390-review` |
| Back and Android hardware Back preserve the selected branch | Passed, `390-back-approach`, `branch-restored-*` |
| Different action blocks Next until a new intention exists | Passed, `branch-new-action-intention-empty` |
| Returning to the original action restores its intention and Approach | Passed, `branch-restored-intention`, `branch-restored-approach`, `branch-restored-review` |
| Exact deterministic final text | Passed for builder and manual paths |
| Short tap does not lock; 850 ms native hold locks | Passed, `390-short-tap.xml`, `branch-held-submitted` (production threshold remains 600 ms) |
| Explicit starters after waiting/error | Passed, `loading-before-starters`, `loading-starter-intention`, `error-before-starters`, `error-starter-intention` |
| Reduced Motion system settings | Navigation/Review smoke passed with all three Android animation scales at zero, `reduced-motion-review`; this does not measure every animation |
| Maximum prompt | Exactly 800 native input characters and exact Review text, reachable enabled hold, `maximum-prompt-*` |
| Reader service availability | TalkBack package absent and no enabled accessibility service, `accessibility-check.json`; spoken-reader behavior was **not verified** |

### Native keyboard and width matrix

Each case typed a manual prompt through the Android software keyboard, confirmed the focused EditText and visible enabled Review control, closed into Review, verified exact text and reachable hold. `*-ime.txt` contains `mIsInputViewShown=true`. `*-result.json` contains measured bounds.

| Width (dp) | Font scale | Result |
| ---: | ---: | --- |
| 320 | 1.0 | Passed |
| 375 | 1.0 | Passed |
| 390 | 1.0 | Passed |
| 402 | 1.0 | Passed |
| 800 | 1.0 | Passed |
| 320 | 1.5 | Passed; Review content scroll required as intended |
| 390 | 1.5 | Passed |

The theme and full shared situation remain in the scroll content; keyboard hides decorative artwork. At large font they can extend below the viewport and remain reachable by scrolling. The footer stays reachable. XML snapshots include off-screen nodes; positive viewport bounds and screenshots were checked for focused input/footer rather than treating mere node presence as visibility.

## Findings fixed during this pass

- The fixture's `write` initializer used builder reducer actions that switched its mode back to Build. It now explicitly restores Write mode, matching the intended fixture scenario.
- The fixture header now uses Arena on Action and Back on later steps, and includes the production-style Battle options control.
- Android Barlow intrinsic label width could clip the end of Finisher and wrap Back at large font. Scoped production layout adjustments are in `ComposerMoveTypeControl` and `BattleHeader`; no global font scaling cap or global button style was introduced. Final verification is recorded in `font-final-*` captures.

## Unverified / separate checks

- TalkBack spoken output, exploration order, announcement timing, and accessibility tap-confirm dialog with the real reader enabled.
- Physical Android devices, additional keyboard vendors, landscape/foldables, and font scales above 1.5.
- Signed APK composer parity beyond the unauthenticated smoke, actual xAI generation timing, paid-operation recovery, persistent drafts after real process/account/round changes, and a full live battle result. These require separate backend/release checks; this fixture does not prove them.
- `initial.xml`, `build-current.xml`, and `current-step.xml` are early harness diagnostics; `font-fix-*` are intermediate padding-only experiments. Use the named final captures, not these intermediate files, for acceptance.

## Final signed APK9 smoke

Build `c177cc6f-084e-4130-981f-ac85f9cabfac`, package `gg.promptwars.app`, version `1.3.3`, versionCode `9`.

- The artifact SHA256 matched `b52abf2944adf655674cb3575207291ea1dd1414966eec522d321c6638f326c9` before install.
- Installation returned Success. Package manager confirmed the expected version and code.
- Actual launch output: Status ok, LaunchState COLD, MainActivity, total 447 ms / wait 449 ms. These are this one emulator observation, not a performance benchmark.
- The screenshot was visually inspected and shows SIGN IN. No login, account creation, battle or purchase action was performed.
- No AndroidRuntime:E or ReactNativeJS:E entries appeared in the bounded 600-entry logcat read after the launch.
- Evidence: `release9-runtime.json`, `release9-launch.txt`, `release9-cold-launch.png`, `release9-cold-launch.xml`, `release9-native-errors.txt`.

After the smoke, baseline display/font/animation settings and the keyboard override were restored. Only task-owned emulator5582 and ADB5038 were stopped; fixture Metro8083 had already been stopped. Port checks and cleanup scope are recorded in `task-cleanup.json`. SDK/AVD caches and the downloaded artifact were retained. This signed-out smoke does not establish signed-in gameplay, composer behavior in the release APK, or TalkBack coverage.
