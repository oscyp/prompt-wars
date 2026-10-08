# Composer TestFlight source audit

Date: 2026-10-02. Scope: read-only source/archive/configuration review and test-note preparation. No build, store, backend or account mutation was performed by this audit. The release coordinator owns those actions and their live status.

**Outcome: no source/archive blocker found for the requested iOS TestFlight build.** Keep marketing version **1.3.3** and use the next remote build number, **14**. Native acceptance, binary verification and Apple processing remain separate checks.

## Source provenance and exclusions

The fresh EAS inspection archive is `/tmp/prompt-wars-composer-testflight-archive-20261002`. All **497 files** match the current checkout byte-for-byte by SHA-256. Its paths and hashes also exactly match `/tmp/prompt-wars-composer-ios-archive-20261001-2308`; the earlier archive is not stale. No runtime file is missing across `app`, `assets`, `components`, `constants`, `hooks`, `providers`, `styles`, `types`, `utils` and `ios`, after intentionally excluding Pods, local Xcode environment, build products and generated bundles.

The digest of sorted `relative-path<TAB>sha256` records, joined with newlines and no trailing newline, is `a7f0f2d39ae303faac9275da4a4650ad74499981911ff6d5638bd2dd8db80867`. The coordinator's [source manifest](source-manifest.json) is the durable per-file evidence. A Git revision alone does not identify this dirty checkout's uploaded contents.

`.easignore` excludes environment/credential files, local agent output, documentation, fixtures, tests, Pods and backend files. The only included Supabase files are the deliberately imported pure modules `prompt-situations.ts` and `composer-events.ts`. No fixture path or sensitive credential filename was found. A bounded text scan found no private-key PEM, recognized long provider-token prefix, AWS access-key pattern or decoded service-role JWT; no matched secret values were printed. This is a source packaging check, not a certification of every possible secret format or build-time environment.

Relative to the saved 1.3.3 (13) manifest, this archive adds **23 files**, changes **45**, and removes none. Additions include composer/context/result code and existing parallel guest/email-linking work. Some database test scripts remain in the uploaded source archive, but they are not application imports or package lifecycle hooks. No dependency manifest or lockfile changed relative to that release. No packaging edit was needed.

## Version and native configuration

| Check | Observation |
| --- | --- |
| Marketing version | `package.json`, `app.config.js`, native Info.plist and both Xcode build configurations agree on `1.3.3`. |
| App identity | `gg.promptwars.app`; production submit target `6788787677`. Coordinator verified EAS project `d4c525e1-0a95-4c6a-b1ee-106fa2f03f46`, `@prompt-wars/prompt-wars`. |
| Build version | `eas.json` uses remote versions and production `autoIncrement: true`. Local native build `1` is not the EAS counter. The coordinator's [build request](build-request.json) already identifies STORE / production / physical-device build `1.3.3 (14)`; compiled IPA still requires verification. |
| Previous TestFlight | [Live pre-build snapshot](testflight-before.json) shows `1.3.3 (13)` valid and in internal beta testing. Prior September release evidence records TestFlight only, with no public App Store submission. |
| Native source | Committed `ios/` is included. Check the native project and signed artifact, not app-config plugins alone. Hermes/new architecture; iPhone target, iOS deployment target 15.1. |
| Icon and fonts | Native 1024×1024 AppIcon PNG has RGB color type 2, no alpha channel. Both Barlow display fonts are registered in Info.plist. |
| Updates/signing | Native `EXUpdatesEnabled=false`; delivery requires this binary. Source APNs entitlement is `development`; distribution provisioning and final signed entitlements must be checked on the built IPA. |
| Native permissions | No microphone permission added. Existing local-network/dev-launcher strings and Apple/Google native capability configuration remain present; their presence does not activate social-auth intake. |

Apple associates uploads with bundle ID/version and distinguishes them by build string. EAS remote auto-increment changes the developer build value without requiring a marketing bump. Thus the inspected evidence supports `1.3.3 (14)` for this additional TestFlight build; Apple acceptance must still be observed. Sources: [Apple upload rules](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/), [Expo remote versioning](https://docs.expo.dev/build-reference/app-versions/).

## Feature and backend boundaries

Composer availability is intentionally default-on for new practice/tutorial, casual/friend and ranked series. The client renders v2 only when the server's stored `prompt_experience_version` is 2; existing series retain their pinned behavior. New v2 lock-in is tap plus confirmation. AI availability does not authorize automatic credit spending; paid rerolls require the explicit purchase flow. Primary ranked calibration blocking was deliberately removed by the later user decision; this must not be described as completed calibration.

The unrelated `EXPO_PUBLIC_SOCIAL_AUTH_ENABLED` flag is absent from inspected local dotenv files and the audit shell. The coordinator also reported it absent from live EAS public/sensitive environment names. Auth entry/access checks require it to equal `1`. Existing guest recovery behavior for already-anonymous accounts remains in the binary; this is not new guest intake. `PROMPT_WARS_NATIVE_FIXTURES` is likewise absent, fixture files are excluded, and app config rejects fixture mode during EAS builds.

The [deployment verification summary](../2026-10-01-composer-deployment/verification-summary.json) records four hosted migrations, 19 function deployments and 38 negative-auth requests. It also records **216 Jest suites / 1,750 tests**, TypeScript success, **454 Deno tests / 56 steps**, seven remote tests ignored, and local transactional SQL checks. These existing results were inspected, not rerun by this documentation task. Negative-auth checks do not prove an authenticated battle, purchase or native UI flow.

## Release checklist — record actual evidence

- [x] Fresh source archive matches the checkout; required pure shared modules included; fixture and credential filenames excluded.
- [x] Production identity and marketing version agree; build request uses remote build 14 and is not a simulator build.
- [x] Intended default-on composer versus disabled social/guest intake reviewed; compatible backend deployment evidence exists.
- [x] EAS build finished successfully; exact build ID `7db76299-0128-406d-8b24-86fe7b6058b5` and artifact digest are recorded in the [delivery record](../../deployments/2026-10-02-composer-testflight.md).
- [x] Actual IPA verified: bundle ID, `CFBundleShortVersionString=1.3.3`, `CFBundleVersion=14`, embedded JS/fonts, signed distribution entitlements, strict recursive signature and supported-device metadata.
- [x] Exact build submitted once. EAS submission `0bb38afd-be02-453c-a536-4ec67b9971ea` finished; Apple reports build 14 `VALID` and `IN_BETA_TESTING`. Group targets were specified, but individual tester access was not inspected.
- [ ] Confirm build 14 is selectable/installable by the intended existing TestFlight group and save [What to Test](test-notes.md). No new tester invitations or public App Store release are implied.
- [ ] Install/upgrade from build 13; confirm startup, existing session and draft preservation, then perform the documented native authoring/result flow with measured device/accessibility settings.
- [ ] Record keyboard, VoiceOver, Dynamic Type and Reduce Motion evidence. Native acceptance is **NOT RUN in this audit**; Android acceptance is also not covered by an iOS release.
- [ ] Keep human-reviewed labels, actual paid-model calibration and the 12-person pilot explicitly **NOT RUN** until separately performed. Do not infer their results from deployment or TestFlight availability.
