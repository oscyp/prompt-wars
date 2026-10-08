# Composer native simulator audit — 2026-10-02

## Scope and runtime

Observed on an actual iOS Simulator framebuffer, mirrored through `serve-sim`; these are native React Native views, not a browser rendering of React Native Web.

- Device: iPhone 17 Pro, iOS 26.5, 402-point width (1206 × 2622 framebuffer).
- Simulator: `5BCEAF70-7392-4F8F-92F6-4249428CA786`.
- Native host: previously installed Prompt Wars development app **1.3.2**, bundle `gg.promptwars.app`, loading current checkout JavaScript.
- Fixture: `promptwars://prompt-composer?state=build`, served by the isolated fixture entry at port 8082. The fixture uses the real composer reducer and UI components with local state and unavailable backend endpoints; no real suggestion generation, submissions, payments, or telemetry were performed by the fixture.
- This is **not** execution of the newly submitted TestFlight **1.3.3 (14)** binary, and is **not** a physical-device test. Release artifact verification is recorded separately in `docs/deployments/2026-10-02-composer-testflight.md`.

## Observed results

| Check | Result and evidence |
| --- | --- |
| Native visual rendering | PASS: existing gold/obsidian/lavender presentation, Barlow text, scene art, action cards and footer rendered without a runtime error. Long action/intent copy wrapped inside the 402-point screen. |
| Complete move without typing | PASS: selected the third action, then its first intent. Lock In was disabled before the intent and enabled afterward. [Ready native state](01-ready-native-mirror.jpg). |
| Canonical preview | PASS: preview displayed the combined 121-character action and intent, with `Your move` and `Edit full text`. [Preview](03-preview-after-cancel.jpg). |
| Tap confirmation and cancel | PASS: a single tap opened the native `Lock in?` alert; Cancel retained the action, intent, complete text and enabled footer. [Native alert](02-native-confirmation.jpg). Final confirmation/submission was not executed. |
| Full-text edit | PASS: `Edit full text` switched to Write with the same 121 characters. The native TextInput accepted simulator keyboard input; the visible edited result was 149 characters. [Edited text](04-manual-text-native.jpg). |
| Build/Write preservation | PASS: returning to Build showed the manual-text preservation notice. Returning to Write retained the exact visible edited text and 149-character count. |
| Replacement confirmation | PASS: selecting a new action after a manual edit opened the native `Replace your edited prompt?` alert. `Keep mine` retained all 149 characters. [Replacement alert](05-replace-manual-confirmation.jpg). |
| Incomplete replacement guard | PASS: after choosing `Use builder`, the previous 149-character text remained visible while the new composition awaited an intent. Lock In was disabled and the completion/Undo instruction appeared. [Guard](06-incomplete-replacement-disabled.jpg). |
| Undo | PASS: Undo restored the 149-character manually edited move and enabled Lock In again. [Restored state](07-undo-restores-manual.jpg). |

No upload-blocking application defect was observed in these checks. This limited observation does not replace the remaining acceptance cases below.

## Ordinary app session check

The full app was loaded from a separate ordinary Expo development server at port 8081. It rendered the Arena and Profile screens successfully. An existing authenticated profile and an ongoing battle were visible through ordinary UI. The account was not clearly identified as a dedicated QA account, so its existing battle was not opened or changed and no new battle was created. No credentials or session storage were inspected. An authenticated live composer, free backend suggestions, battle submission and Tier 0 result were therefore **not verified in this native run**.

The first full-app launch used an IPv6-only localhost server while the manifest referenced IPv4. Restarting only the server created for this audit with the matching binding resolved that development-server issue. No source or production configuration changed.

## Explicitly not verified

- Software keyboard visibility, avoidance, scroll/focus movement and return-key behavior. The TextInput accepted native simulator keyboard input, but an on-screen keyboard was not available in this headless interaction. Xcode 27 Device Hub accessibility calls timed out; no keyboard-avoidance pass is claimed.
- VoiceOver, TalkBack, larger accessibility text sizes, Android, physical iPhone, or the new TestFlight binary. No Android SDK/emulator was available on this host.
- Authenticated prompt route header/keyboard integration, paid rerolls, pending-network recovery, persisted draft restart, or final backend submission/results. Fixture state tests do not establish these production-route behaviors.
- Additional device widths or landscape in this run.

## Cleanup and retained state

Only the fixture server and scoped simulator mirror created for this audit were stopped. The full development server at port 8081, booted simulator, installed app and existing account data were retained. Repository product source, environment files, auth flags and production configuration were not edited for this audit.

Screenshots in this directory show the browser mirror surrounding a native simulator framebuffer. The native content is the device-shaped region in the center. Mirror transport documentation: [serve-sim](https://github.com/EvanBacon/serve-sim).
