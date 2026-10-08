# Android composer remediation QA — final build 7

Status: final Android 7 preview APK finished successfully, passed static artifact verification, and passed exact-APK install, cold startup and signed-out native keyboard checks. Temporary native QA processes are stopped.

## Current delivery candidate

- EAS project `@prompt-wars/prompt-wars` (`d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`).
- [Android build `bc22e58f-7250-4796-94e8-4489e3e80642`](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/bc22e58f-7250-4796-94e8-4489e3e80642), created 2 October 2026 at 16:26:14 UTC.
- Version `1.3.3`, version code `7`; EAS confirmed remote increment 6 → 7. Profile `preview`, distribution `INTERNAL`, APK, production EAS environment.
- EAS completed at 17:40:34 UTC. [Download final Android 7 test APK](https://expo.dev/artifacts/eas/ipYBjrgacAsSHqXsM5drO8aAOcADMFIoUSWAMJYrlC0.apk). Verified local copy: `/tmp/prompt-wars-android-7-remediation-20261002.apk`.
- APK: 138,992,353 bytes; SHA256 `f94aa5520bae299c28ceca16cf1d15a2252ab418c32bbaa36078c228cf81187d`.
- One build request after the explicit final Android source freeze. No Google Play/store submission, iOS build, or additional configuration change was requested.
- Builds 5 and 6 are preserved intermediate evidence under `android-5-*` and `android-6-*`. Build 6 exposed the Android composer keyboard problem; build 7 contains its verified correction. iOS16 remains the current iOS artifact.

## Frozen source and intentional platform difference

Fresh archive `/tmp/prompt-wars-android-7-remediation-20261002-final-archive` contains 503 files. All hashes matched the frozen checkout before and after upload. Canonical path/hash-map digest: `ffc47a95e7c4598328574e2c6253cf024031cc01db87ce84317c1dbf39081048`. The expected dirty checkout has base commit `d66e621264fb56b6471ecbaa4a7971bb689abaca`; that commit alone does not identify the release source.

The sole runtime-file difference from both iOS16 and Android6 is `app/(battle)/prompt-entry.tsx`. The composer KeyboardAvoidingView now selects `keyboardVisible ? 'padding' : undefined` on Android. The iOS branch still returns `padding`, and web still returns `undefined`. `android-7-source-manifest.json` records the complete maps and `android-7-source-diff.patch` records this explicit difference. Cross-platform source equality is not claimed for Android7.

EAS fingerprint `d2263d60fbb207fad1a98f98bb12f56813567ffe` is unchanged from Android6; the file hash manifest identifies the JavaScript correction. Only the three intentionally public shared Supabase modules are archived. Environment files, credentials, private bot modules, fixtures, and audit docs are excluded.

The final source readback at 17:42:55 UTC confirmed all 503 archive hashes still match the checkout, with no added/removed files and exactly the permitted Android route difference from iOS16. Root's independent proof is `android-7-final-source-readback.json`.

## Keyboard correction evidence

The mobile QA owner verified three native Android keyboard show/hide cycles against the frozen fixture/source. Lock in stayed above the IME, the exact 97-character text remained intact, and the closed keyboard layout returned to its original baseline. The focused check passed 63 tests across 8 suites, TypeScript and lint, with independent review. These native fixture observations support the source correction; they do not claim authenticated composer coverage in the release APK.

## Completed APK verification

The full downloaded APK passed ZIP CRC integrity, binary manifest identity (`gg.promptwars.app`, `1.3.3`, code `7`), required composer/result-copy markers, and exact linked Supabase backend URL presence. Minimum Android SDK is 24; target SDK is 36. Native libraries cover arm64-v8a, armeabi-v7a, x86 and x86_64. The bundle contains the expected public publishable-key prefix and none of the checked private bot module markers. Environment values are not recorded.

Google's official `com.android.tools.build:apksig:8.9.3` verified the APK's v2 cryptographic signature with zero errors or warnings. Its RSA signer matches builds 5 and 6: certificate SHA256 `0c64ae959415b1406a00943daa0bb4cae83c9e5f816d4be726d8089dd3612c14`. The verifier runs with Rider's existing bundled JBR 25.0.4; the standalone library's URL and hashes are in `android-signature-verifier.json`.

The shipped Hermes bundle is 5,275,884 bytes, SHA256 `de61a7660617f45945496b3216155c9b567de2e4b0dbf6c90687b82e824ce519`. Its `PromptEntryScreen` disassembly directly confirms an undefined-or-padding conditional written to the KeyboardAvoidingView behavior prop; build 6 wrote undefined directly. `android-7-keyboard-bytecode-proof.json` preserves the narrow before/after instruction excerpts and reviewed interpretation. This confirms the corrected branch is in the signed artifact, while the native fixture supplies its keyboard interaction evidence.

## Native runtime evidence and limits

The mobile QA owner prepared an isolated official AOSP API35/arm64 emulator under `/tmp`; no global SDK or shell profile was changed. The detailed setup, fixture evidence, and final installed-binary observations are owned in [native/android-local-README.md](native/android-local-README.md).

The exact APK above installed with `adb install -r`; package readback confirmed version `1.3.3` / code `7`. Cold launch returned `Status: ok` in 539 ms (one emulator observation, not a benchmark). The signed-out screen rendered, an inert unsubmitted email value remained visible above the keyboard, and ordinary scrolling exposed all lower sign-in controls. The same app process remained alive. Its 336-line captured process log contains no fatal exception, AndroidRuntime failure or ReactNativeJS error. Native startup advisories and a separately buffered Expo Router fixture warning are retained in the native report; this is not a warning-free-log claim.

The final Android7 pass is limited to update/install, startup, crash checks and reachable unauthenticated native UI. Authentication, eligibility decisions, new accounts, live battles, purchases, and Google Play services behavior are excluded. No matching existing SDK55 development-client EAS build was found; see `android-existing-sdk55-builds.json`. Composer interaction evidence remains the isolated Expo Go fixture result, separate from signed-in release APK acceptance. No physical-device or TalkBack coverage is claimed.

Device display/density/font settings returned to their original values. The owned emulator, Metro, device-scoped reverse mapping and task-started ADB server were stopped; ports 5037, 5580, 5581 and 8082 have no remaining listeners. Evidence is `native/android-final7-identity.txt`, `native/android-final7-runtime-proof.json`, the three final7 screenshot/XML pairs, and `native/android-cleanup-proof.json`.

## Evidence files

- `android-7-build-request.json`, `android-7-build.json`: authorized request and current EAS state.
- `android-7-source-manifest.json`, `android-7-source-diff.patch`: exact source and permitted platform delta.
- `android-7-final-source-readback.json`: final independent zero-drift source verification.
- `android-7-apk-inspection.json`, `android-7-signature.json`, `android-7-verification.json`: completed artifact checks and final runtime outcome.
- `android-7-keyboard-bytecode-proof.json`: the corrected conditional behavior in the actual signed APK.
- `android-signature-verifier.json`: official static verifier provenance.
- `android-5-*`, `android-6-*`: superseded intermediate artifacts and checks.

Android7 is the final Android test artifact. Builds 5 and 6 remain superseded audit evidence. No Google Play/store submission occurred.
