# Prompt composer — iOS TestFlight delivery

The user authorized the proposed next step: an Expo/EAS build for TestFlight followed by available native testing. This delivery targets the existing iOS app and internal testing; no public App Review submission or Android store release was made.

## Verified delivery

**Prompt Wars 1.3.3 (14) is accepted by Apple and in internal beta testing.**

- EAS project: `@prompt-wars/prompt-wars`, `d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`.
- App: `gg.promptwars.app`, App Store Connect `6788787677`.
- [EAS build](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/7db76299-0128-406d-8b24-86fe7b6058b5): `FINISHED` at 2026-10-02 08:17:06 UTC.
- [EAS submission](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/submissions/0bb38afd-be02-453c-a536-4ec67b9971ea): `FINISHED` at 08:22:25 UTC. The command requested the existing `Team (Expo)` and `testers` groups and disabled automatic group creation.
- Apple verification: build 14, `processingState=VALID`, `internalState=IN_BETA_TESTING`, `expired=false`. External state is `READY_FOR_BETA_SUBMISSION`; this is not a public release.

The production EAS profile reused the existing signing credentials and incremented the remote build number from 13 to 14. Marketing version 1.3.3 remained consistent. No app source changed during this delivery. The prior backend deployment is recorded [separately](2026-10-01-composer-default-on.md).

## Source and binary checks

The fresh source archive contains 497 files, all matching the working tree. Composer runtime files, the two deliberately shared pure modules and both Barlow fonts are present. Environment files, fixtures and backend implementation are excluded; the bounded source-secret scan found no matches. The dirty working tree's actual content is recorded in the [source manifest](../audits/2026-10-02-composer-testflight/source-manifest.json), since the older Git commit label alone does not identify the uploaded changes.

The downloaded IPA is 59,251,110 bytes, SHA-256 `0bdfd423d5f272ef6f16785aba300e97def16797303e882fe354e0317cf62d76`. Its actual plist reports `gg.promptwars.app`, version 1.3.3, build 14 and iPhoneOS. The compiled JavaScript contains the new composer and contract markers. Both display fonts are registered and embedded.

Signed entitlements identify the existing Apple team and app, disable debugger attachment, and use production APNs. Recursive strict signature verification passed. No signing credentials were regenerated. The initial deprecated entitlement-display invocation failed locally; Apple's documented `codesign --display --entitlements - --xml` invocation and signature verification subsequently succeeded without altering the IPA.

Evidence: [build](../audits/2026-10-02-composer-testflight/build-completed.json), [binary](../audits/2026-10-02-composer-testflight/binary-verification.json), [signing](../audits/2026-10-02-composer-testflight/signing-verification.json), [submission](../audits/2026-10-02-composer-testflight/submission-current.json), [Apple status](../audits/2026-10-02-composer-testflight/testflight-after.json), [source audit](../audits/2026-10-02-composer-testflight/source-audit.md).

## Testing and limits

Native composer interaction checks ran on an iPhone 17 Pro simulator, iOS 26.5, using an existing development binary with current JavaScript and an isolated fixture. This is native interaction evidence, not installation of the App Store-signed IPA on a physical device. Action/intention selection, incomplete-move blocking, native lock-in confirmation/cancel, manual editing, mode switching, replacement confirmation/cancel and full Undo were observed successfully. See the [native audit and screenshots](../audits/2026-10-02-composer-native/nativeaudit.md).

Software-keyboard avoidance, VoiceOver, Dynamic Type/Reduce Motion matrix, physical TestFlight install/upgrade and Android device acceptance remain unverified. This host has no Android SDK/emulator. Human-reviewed judge calibration and the 12-person pilot were not performed by a build/upload task.

The ordinary full native app also launched successfully with current JavaScript. It exposed an existing authenticated profile and an ongoing battle, without evidence that this was a dedicated QA account. No existing battle was opened or altered and no new live battle/purchase was created. The authenticated end-to-end practice/result path remains unverified.

[What to Test notes](../audits/2026-10-02-composer-testflight/test-notes.md) are prepared locally. They were not saved to Apple: both available browsers require an App Store Connect sign-in. Build delivery and Apple status verification succeeded through the existing Expo-managed API credentials. The submission status endpoint does not expose per-tester membership, so the evidence establishes internal beta availability and the requested group targets, not installation by an individual tester.
