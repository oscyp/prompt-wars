# Android composer remediation QA build — 2 October 2026

Status: intermediate Android build 5 is superseded as a release candidate. Native QA found a result-copy defect; a corrected source freeze and replacement Android build are pending. This artifact must not be presented as the final build.

## Build

- EAS project: `@prompt-wars/prompt-wars` (`d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`).
- Build: [`99f1739f-8928-4a3d-b0ce-7c3207e6a571`](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/99f1739f-8928-4a3d-b0ce-7c3207e6a571).
- Requested at 13:46 UTC after root confirmed the source freeze and backend deployment.
- Android `preview` profile, `INTERNAL` distribution, APK, production EAS environment, version `1.3.3`, version code `5`. No store submission requested.
- Normal existing EAS authentication and remotely managed signing credentials used; no credential extraction.

## Source evidence

Fresh `eas build:inspect --platform android --stage archive --profile preview` output was captured at `/tmp/prompt-wars-android-remediation-20261002-archive`. The archive contains 503 files. Its path-to-SHA256 manifest digest is `e1ab038f21f2cd10987c5a1adcb2190d1451a9c4eac4b34ec891eac09aa5f3ab`.

`android-source-manifest.json` records every archived file hash and the expected dirty checkout (`d66e621264fb56b6471ecbaa4a7971bb689abaca` base). Every archived file matched the frozen workspace before upload. The commit hash alone does not identify this uncommitted release source. The actual EAS upload was 39.8 MB; EAS fingerprint `ac48e203a9a8dfedd66e3c9d61003a92e0184e92`.

Required new composer catalog, situation, coordinator, and public shared modules are present. Only the three intentionally public shared Supabase modules are archived. No environment files, signing credentials, private bot modules, local fixtures, or audit docs are present.

## Configuration finding resolved before build

The default preview EAS environment has only Google client IDs. It lacks required public Supabase configuration. Root updated `build.preview.environment` to `production` before the source freeze. The build confirmed the production environment variable names were loaded. Values are not copied to these audit files.

## Native runtime limit

This Mac has no Android SDK at `~/Library/Android/sdk`, no Android Studio, no installed JDK, and no `adb`, `emulator`, `sdkmanager`, `apkanalyzer`, `aapt`, `aapt2`, or `apksigner` executable. No emulator image or paid remote simulator was installed or started. Native Android launch, keyboard/layout, TalkBack, text scaling, and end-to-end round checks remain unperformed. Static APK checks cannot establish these behaviors.

## Evidence files

- `android-prerequisites.json`: initial read-only configuration/tool checks.
- `android-build-request.json`: exact authorized build request; store submission false.
- `android-build.json`: latest sanitized EAS build result.
- `android-source-manifest.json`: frozen source archive hashes.

Intermediate source evidence is preserved in `android-intermediate-build-5/`. The final replacement artifact metadata and verification will replace this report after root confirms the corrected source freeze.


## Intermediate artifact verification

Build 5 finished and downloaded successfully. APK SHA256: `6af97e2faf5f320589d82f71ac2a1f9b254207a0c979ef8a4592a87d97581e91`. Binary manifest: `gg.promptwars.app`, `1.3.3`, version code `5`, minimum SDK `24`, target SDK `36`. ZIP CRC checks passed. Google ApkVerifier verified its APK Signature Scheme v2 signature with no errors or warnings; certificate SHA256 `0c64ae959415b1406a00943daa0bb4cae83c9e5f816d4be726d8089dd3612c14`. New composer catalog/bank/origin strings and required public backend configuration are present in the Hermes bundle. This is intermediate evidence only; the result-copy correction is in replacement build 6.
