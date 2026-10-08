# Four-view composer client delivery

The native source was frozen after the final small-screen font checks and tutorial wording fix on October 7, 2026. Backend deployment is recorded in [the backend report](../backend/README.md). Both EAS builds and the exact iOS submission finished; the observers exited normally and no background release observer remains. [Delivery summary](delivery-result.json).

## Build source

Official EAS archive inspection for iOS `production` and Android `preview` yielded the same 508 files. The sorted file/hash manifest SHA-256 is `935e94dd6b0616e3e302ef39398af0c112b2e3bc786c33480ef7b00b8f365d29`.

Both archives exclude environment files, signing credentials, the root `docs/`, `__tests__/` and `test-support/` directories, and private backend modules. Only the three pure shared situation/affordance/event modules are included from `supabase/`. This does not exclude every documentation or test-related file: some asset `README.md` files and Python test harnesses under `scripts/` remain in the source archive. Source inclusion is distinct from JavaScript runtime bundling; the compiled IPA separately passed the private-backend and fixture-marker checks. File scans found no private-key or provider-secret markers or matching available server-secret values. The working-tree files matched the frozen manifests immediately after both uploads.

Evidence: [source freeze](source-freeze.json), [iOS manifest](ios-source-manifest.json), [Android manifest](android-source-manifest.json), [upload drift checks](upload-source-drift.json).

## Exact builds

| Platform | Profile | Version | Build ID |
| --- | --- | --- | --- |
| iOS | production / store distribution | 1.3.3 (18) | [9301c70c-2276-481c-a0ea-fcd63323bcfc](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/9301c70c-2276-481c-a0ea-fcd63323bcfc) |
| Android | preview / internal APK | 1.3.3 (9) | [c177cc6f-084e-4130-981f-ac85f9cabfac](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/c177cc6f-084e-4130-981f-ac85f9cabfac) |

EAS CLI 23.1.0 uploaded both archives. Builds are observed by exact ID, initially with 90-second backoff and then 180 seconds after the queues remained unchanged for about an hour. Current evidence: [iOS build](ios-build.json), [Android build](android-build.json), [status observations](build-observations.json). iOS build 18 completed and passed [artifact verification](ios-18-ipa-inspection.json): bundle identity, production signing entitlements, strict recursive code signature, ZIP integrity, source icon and the new composer markers. Its SHA-256 is `fab2de05705a71547f5c5407e353d78da82baa957f96111bf6cf1c13819ab153`. The first signature check lacked host certificate-trust access; the same strict check passed with normal host trust access. No validation check was disabled.

The exact verified iOS build was submitted for the existing `Team (Expo)` and `testers` internal TestFlight groups, with automatic group setup disabled. [Submission bb09da5a-13cd-4e2f-b8ab-79ea3d486a76](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/submissions/bb09da5a-13cd-4e2f-b8ab-79ea3d486a76) **finished** at 14:19:52 UTC. App Store Connect confirms exact build **1.3.3 (18): VALID / IN_BETA_TESTING**, matched to the same EAS build and submission IDs. [Apple proof](ios18-apple-status-proof.json). The supported CLI does not enumerate exact group assignment or confirm installation by an individual tester; requested groups are distinct from those unverified access details. No Android store submission or public iOS store release was requested.

## AI availability limitation

The six-call real provider smoke found valid complete trees but remaining moderation rejections and one malformed enrichment. Reliable AI-bank delivery is not established. Explicit starter ideas and manual writing remain available, and all moderation failures remain closed. See the [exact measured results](../backend/README.md#real-provider-evidence-and-limitations); this internal release is not a model-quality approval.

Android build **1.3.3 (9)** finished and its exact APK passed [binary verification](android-9-apk-inspection.json): package/version, non-debuggable manifest, matching existing release certificate, APK v2 signature, ZIP integrity, native ABIs and the new composer markers. The removed composer copy, checked private-backend markers and fixture markers were absent. SHA-256: `b52abf2944adf655674cb3575207291ea1dd1414966eec522d321c6638f326c9`. [Verified APK](https://expo.dev/artifacts/eas/wLVxM2ADE8p3-7X-ZDki69YaiJCObWRLAT4n6etkKKI.apk). The native QA owner installed this exact APK and verified version 1.3.3/code9, then cold-launched it to **SIGN IN**: Android reported **Status ok / COLD / 447 ms**, with an empty bounded AndroidRuntime/ReactNativeJS error scan. No authentication, battle or purchase was performed in this final binary smoke. Evidence: [runtime and identity](../native/android/release9-runtime.json), [launch timings](../native/android/release9-launch.txt), [error scan](../native/android/release9-native-errors.txt), [cold-launch screenshot](../native/android/release9-cold-launch.png); this is separate from the earlier development-host composer walkthrough. The task-owned emulator, ADB server and Metro server were stopped after verification.
