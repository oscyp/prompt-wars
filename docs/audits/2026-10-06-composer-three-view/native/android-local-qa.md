# Android native fixture checks

Observed October 7, 2026, on a disposable local ARM64 Android 15 / API 35 AOSP emulator. Official Expo Go 55.0.7 ran the final-source development fixture through a clean Metro restart on port 8083. This is presentation and interaction evidence, not verification of the new signed APK or of a live battle.

The fixture uses the current composer panel, situation, editor, footer, semantic reducer and step helpers. It performs no authentication, telemetry, AI generation, purchases or live submission. Its local `PROMPT LOCKED IN` state establishes only the gesture and local guards. Production route focus, persistence, server responses and account scope behavior are covered separately or remain unverified by this fixture.

## Observed

- All nine authored actions are available in three open groups. Selecting an action stays on Action; explicit Next shows its three compatible intentions. Selecting an intention stays on Intention until Review is pressed. The review combines the selected visible text and shows the correct type.
- A native 300 ms hold did not lock. A subsequent 900 ms hold completed the local locked state without an additional ordinary-user confirmation.
- Write → Review → Edit preserves text and type. Explicitly focusing the mounted native editor opens the actual software keyboard. Typing a suffix changes the exact text; native Back first dismisses the keyboard, then returns from Write to Action while keeping detached text.
- A paced native input produced exactly 800 characters, verified against the literal input using the native XML field value. The end of the text, caret and Review footer remained visible above the real keyboard. Write → Review → Edit → refocus retained all 800 characters. The long review scrolls to its editing controls while the hold footer stays reachable.
- Native display overrides exercised logical widths 320, 375, 390 and 402 dp at font scale 1.0. The focused field and Review footer stayed within the screen; each review had an enabled hold footer. Vertical scrolling remained available; the type selector wraps at 320 dp.
- At 320 dp, font scale 2.0 and 440 dpi, labels and type buttons wrapped, the focused editor/caret stayed visible, and the Review button remained above the actual keyboard. Review's hold footer grew vertically and remained reachable.
- At 960 × 1280 dp, all nine actions appeared in three columns; selection left all nine visible, Next opened three compatible intentions, and Review showed the exact Finisher combination. Tablet manual writing retained the real keyboard and Review footer.
- With native `transition_animation_scale=0` (the setting React Native's Android accessibility module reads for Reduced Motion), a 900 ms hold interrupted by native Back after 200 ms returned to Intention, preserved the selected intention and did not locally lock. Returning to Review and deliberately holding 900 ms completed the local lock. This establishes behavior with that native setting, not a frame-by-frame animation audit.

## Evidence

All listed evidence is fixture-only. Native XML files store only the inert authored test content.

- `android-prompt800-final-keyboard.png`, `android-prompt800-paced-settled.xml`: maximum valid input, native keyboard and exact field value.
- `android-prompt800-review-scrolled.xml`, `android-prompt800-edit-focused.xml`: long review editing controls and unchanged maximum text after Edit.
- `android-width-320-font-1.0-keyboard.png`, `android-width-320-font-1.0-review.png`: narrow phone keyboard and review.
- `android-width-375-font-1.0-keyboard.png`, `android-width-375-font-1.0-density-440-keyboard.png`: same logical width at low and high raster density.
- `android-width-390-font-1.0-keyboard.png`, `android-width-402-font-1.0-keyboard.png`: other phone widths.
- `android-width-320-font-2.0-density-440-keyboard.png`, `android-width-320-font-2.0-density-440-review.png`: large native text, keyboard and reachable review hold.
- `android-width-960-font-1.0-keyboard.png`, `android-tablet-actions.png`, `android-tablet-selected.xml`, `android-tablet-intent.xml`: tablet layout, no automatic advance and compatible intentions.
- `android-reduced-review-before-hold.png`, `android-reduced-back-cancelled-hold.xml`, `android-reduced-completed-hold.png`: Back cancellation and subsequent intentional local completion under Reduced Motion.

## Tooling and limits

The AOSP image does not include TalkBack. TalkBack reading, focus announcements and its ordinary-tap confirmation path were not observed natively. No signed-in Android test account was created; no live Android round or paid suggestion was executed. Keyboard visibility was observed after explicitly focusing fields; the fixture does not implement production route automatic focus. Persistence across process restart is not implemented by the fixture and is not claimed.

At 160 dpi, the final `r` in the small Barlow `Finisher` type-button label appeared absent in screenshots although native text remained `Finisher`. At the same 375 dp width and 440 dpi, the complete label rendered clearly. This was treated as low-density rasterization evidence, not a confirmed layout defect or reason to replace the build.

A single extremely fast `adb input text` burst intended to enter 800 characters settled at 235. Repeating native input in 20-character chunks produced the exact 800-character literal. The ultra-fast burst was not used as passing maximum-input evidence or attributed to an app defect. Native `uiautomator dump` during active typing failed its idle wait and left an older XML file; only a fresh, settled dump was used for the exact comparison.

Expo Go uses React Native 0.83.10 while this project's signed build uses 0.83.6; final APK installation and cold-start smoke are recorded separately. Dev-client overlays in some screenshots belong to Expo Go. Device display/font/animation overrides affect only this disposable emulator.

## Runtime provenance

- Official platform-tools 37.0.1, ARM64 emulator 37.2.12, Android 15 API 35 AOSP ARM64 system image revision 2 and Expo Go 55.0.7 were downloaded from Google's repositories or Expo's official release repository. Their combined downloads were 1,397,174,019 bytes, within the approved setup budget. Checksums were checked and recorded in the task directory.
- SDK, AVD, ADB server, Metro process, helper scripts and evidence live under `/private/tmp/prompt-wars-android-qa-20261006`; no global SDK or shell profile was changed.
- Device `emulator-5582`, task-owned ADB server port 5038, fixture Metro port 8083. Child process environment selected the SDK and AVD locations.
- EAS remote Simulator availability returned `available:false`; no remote simulator session was started.

