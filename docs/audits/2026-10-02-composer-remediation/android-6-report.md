> Superseded by Android build 7 (`bc22e58f-7250-4796-94e8-4489e3e80642`) after native Android QA found the composer Lock in control behind the IME. This preserved build 6 report is historical evidence, not the final delivery.

# Android composer remediation QA — final build 6

Status: final Android 6 APK finished and passed every required static check. The verified APK has been handed off for native runtime QA.

## Final build

- EAS project: `@prompt-wars/prompt-wars` (`d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`).
- Final build: [`6a6caf8c-1848-43c1-9f9d-11be150105e2`](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/6a6caf8c-1848-43c1-9f9d-11be150105e2), created 2 October 2026 at 14:39:24 UTC.
- Android `preview` profile, `INTERNAL` distribution, APK, production EAS environment, version `1.3.3`, version code `6` (remote increment confirmed from 5 to 6).
- No Google Play or other store submission. Existing EAS login and remotely managed signing credentials used normally.
- Earlier build `99f1739f-8928-4a3d-b0ce-7c3207e6a571` / version code 5 is intermediate only: native QA found a result-copy issue after its source freeze. The verified fix is in final build 6. Preserve intermediate evidence under `android-5-*`.

## Exact final source

Fresh Android archive `/tmp/prompt-wars-android-remediation-20261002-final-archive` contains 503 files. Every path and SHA256 exactly matches `ios-16-source-manifest.json`. Before- and after-upload comparisons with the frozen workspace found zero mismatches. Android canonical path/hash-map digest: `6605f0e053af102190871388742c93fb8e3875fe5b040cbbef70650f99b6f808`. EAS fingerprint: `d2263d60fbb207fad1a98f98bb12f56813567ffe`.

`android-6-source-manifest.json` records all file hashes. The expected dirty checkout has base commit `d66e621264fb56b6471ecbaa4a7971bb689abaca`; that commit alone does not identify the release source. Only the three intentionally public shared Supabase modules are included. Environment files, credentials, private bot modules, local fixtures, and audit docs are excluded.

## Configuration and verification method

Root corrected the preview profile to select the production EAS environment before either build, supplying required public Supabase configuration, and enabled Android auto-increment before final build 6. Environment values are not copied to these audit files.

APK checks include binary manifest identity/version, ZIP CRC integrity, new composer and backend configuration markers in the Hermes bundle, and cryptographic signature verification with Google's `com.android.tools.build:apksig:8.9.3` library. Only the 507 KB library was downloaded into `/tmp`; it runs using Rider's existing bundled JBR 25.0.4. No SDK or Java installation was needed. See `android-signature-verifier.json` for tool provenance and hashes.

## Native runtime limit

Initial inspection found no Android SDK, Android Studio, `adb`, emulator, `sdkmanager`, `apkanalyzer`, `aapt`, or `aapt2`. Root subsequently authorized a separate bounded setup of official Android tools and an ARM image under `/tmp`; the mobile QA agent owns that attempt and native validation of the final APK. No paid remote simulator is authorized. Native results and remaining limits will be linked here after the attempt. Static APK/signature checks alone cannot establish runtime behavior.

A read-only search of all completed SDK55 Android EAS builds found no existing development-client APK; see `android-existing-sdk55-builds.json`.

## Evidence

- `android-6-build-request.json`: single authorized replacement request; no store submission.
- `android-6-build.json` and `android-build.json`: EAS build identity/status.
- `android-6-source-manifest.json`: exact match with iOS 16 source.
- `android-signature-verifier.json`: official verifier provenance.
- `android-5-*`: superseded intermediate build evidence, including successful static signature and bundle verification.

## Final APK verification

- EAS completed at 15:50:01 UTC on 2 October 2026. [Download final Android 6 APK](https://expo.dev/artifacts/eas/jZ0nzJYG8Jz8wHp6JrdIDp5EU4cJfXB8qrv_mrd15n0.apk).
- Local artifact: `/tmp/prompt-wars-android-6-remediation-20261002.apk`; 138,992,345 bytes.
- APK SHA256: `518ab7917fdabee903f8a4a4cee9feaddb4dea2a7493d27d8f2e4a446fbb106e`.
- Binary manifest confirms `gg.promptwars.app`, version `1.3.3`, version code `6`, minimum SDK `24`, target SDK `36`. Packaged native ABIs: arm64-v8a, armeabi-v7a, x86, x86_64.
- ZIP CRC validation passed. [Google ApkVerifier](https://android.googlesource.com/platform/tools/apksig/+/refs/heads/main/src/main/java/com/android/apksig/ApkVerifier.java) verified the APK Signature Scheme v2 signature with no errors or warnings. RSA signer certificate SHA256: `0c64ae959415b1406a00943daa0bb4cae83c9e5f816d4be726d8089dd3612c14`; same signer as intermediate build 5.
- Hermes bundle is 5,275,876 bytes; SHA256 `adfdef1dd4846a5ebf1df697d29dd81df598efcd6fa4f3846315fd6c4769f098`. Required authored action/intent, grouped-bank API, All ideas, authoring-origin, and final `viewerSide` result-copy markers are present. The exact linked Supabase backend URL and public publishable-key prefix are present; values are not recorded. Checked private bot module markers are absent.
- `android-6-verification.json`, `android-6-apk-inspection.json`, and `android-6-apk-signature.json` record the checks. No store submission occurred.

Native runtime evidence is owned separately in [native/android-local-README.md](native/android-local-README.md); the verified artifact was handed to that agent after all checks above passed.
