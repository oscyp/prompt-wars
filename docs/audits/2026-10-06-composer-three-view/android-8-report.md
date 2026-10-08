# Android preview 1.3.3 (8)

Exact EAS build `48838813-cfd4-45a5-a027-c651fda305c6` finished successfully. Its verified APK was installed on the disposable Android emulator, cold-launched to the unauthenticated sign-in screen, and exercised with the real native keyboard. This release was not submitted to Google Play.

- Created: October 6, 2026, 22:12:27 UTC. EAS completion: October 7, 00:03:08 UTC. Finished state observed locally: October 7, 00:24:59 UTC.
- Package `gg.promptwars.app`, version `1.3.3`, version code `8`, min SDK 24, target SDK 36. Release manifest is not debuggable.
- [Official APK](https://expo.dev/artifacts/eas/GYZUBgnxSVyfSQGKLSjZ1hERxBvYWjwAQxATqPwSx30.apk); EAS metadata gives artifact expiration October 20, 2026, 22:12:28 UTC.
- Local APK: `/tmp/prompt-wars-composer-release-20261007/prompt-wars-1.3.3-8.apk`; 138,996,261 bytes.
- SHA-256: `22d8f7dec1d17ed0ea0efe37d9673819bf0af165c7372bae2dd50cac5fb6c709`.

## Static verification

ZIP CRC checks passed. Google's pinned `com.android.tools.build:apksig:8.9.3` verifier accepted the APK v2 signature with one RSA signer, no errors and no warnings. Certificate SHA-256 `0c64ae959415b1406a00943daa0bb4cae83c9e5f816d4be726d8089dd3612c14` matches the previously verified Android 7 release certificate.

The Hermes bundle contains `composerStep`, `Review move`, both construction questions, Change action/intention, Undo builder changes, `HOLD TO LOCK IN`, Keep mine and Use builder. The old All ideas, Draft saved on this device and Discard draft strings were absent. The checked private bot-table/tactic markers and development-fixture dummy connection markers were absent. These are explicit marker checks, not a claim that scanning known strings proves every aspect of bundle privacy.

All 504 source files matched the frozen release manifest without drift. Static results and verifier provenance are recorded in `android-8-apk-inspection.json`, `android-8-signature-verifier.json` and `android-8-source-freeze-check.json`. Sanitized service metadata and observation history are in `android-8-build.json` and `android-8-build-observations.json`.

## Exact binary runtime

The same SHA-256 APK installed successfully on `emulator-5582`, the task-owned ARM64 Android 15 / API 35 AOSP emulator through ADB server 5038. Installed package metadata independently reported version 1.3.3, code 8. Cold launch returned `Status: ok`, `LaunchState: COLD`, activity `gg.promptwars.app/.MainActivity`, total time 343 ms.

The visible sign-in screen rendered correctly. Focusing Email opened the actual software keyboard. Native input entered the inert address `smoke@example.invalid`; the field and caret stayed visible. Back dismissed the keyboard and preserved the local value. The value was cleared afterward. Sign in, sign up and purchases were never submitted. A bounded600-entry `AndroidRuntime:E` / `ReactNativeJS:E` log read after these interactions contained no entries. The app process remained present after the smoke.

`native/android-release-runtime.json` records the observed runtime and precise limits. `native/android-release8-cold-launch.png`, `native/android-release8-keyboard-caret.png` and accompanying XML provide exact-binary evidence. The broader width, font, composer and 800-character interaction evidence in `native/android-local-qa.md` belongs to the separate Expo Go fixture; it must not be reported as signed-release gameplay verification. No signed-in Android round, production composer persistence or TalkBack path was tested.

## Cleanup

The emulator's display, font, animation and hardware-keyboard preferences were restored. The task's Metro reverse mapping was removed, and only its verified Metro server 8083, emulator and ADB server 5038 were stopped. Those ports no longer listened. The root's Metro server 8082 and global SDK configuration were untouched. Evidence, APK and task-owned runtime files were preserved. See `native/android-task-cleanup.json`.

