# All-changes testing release — 2026-10-08

## Authorized scope

Commit the accumulated application, backend, artwork, documentation and test changes; deploy the pending Supabase changes; deliver new binaries to iOS TestFlight and Android internal testing. Public store review and production rollout are outside this release.

The source includes the composer refinements and cinematic audio/playback follow-up that postdate TestFlight 1.3.4 (19). Existing social/guardian/guest intake activation remains disabled.

## Fresh pre-commit verification

- Jest: 228 suites, 1,987 tests passed.
- TypeScript: `yarn tsc --noEmit` passed.
- Repository lint: passed with one existing `no-require-imports` warning in `app/_layout.tsx`.
- Deno: 592 tests and 74 steps passed; 7 remote integration tests intentionally skipped.
- Changed backend modules: Deno type check passed.
- `git diff --check` on previously tracked changes: passed. The staged all-files check reports whitespace in accumulated historical logs, notes and already-applied migrations; these do not change runtime behavior.
- Bounded credential-marker and artifact hygiene audit: no detected credentials, signed URLs, native build archives or files exceeding 100 MB. Python caches excluded and personal contact metadata redacted from audit evidence.

## Deployment preparation

Read-only production inspection found all 126 local migrations already applied. Of 51 hosted Edge Functions, 25 source bundles match the checkout and 26 require a refresh for changed shared dependencies or the cinematic worker entrypoint. Preserve each existing JWT verification setting.

Existing Supabase advisor findings remain; this release does not claim a clean advisor report. Existing cinematic fidelity-matrix and native audible-playback QA gaps remain unverified. Mock tests do not substitute for those checks.

Builds must use the committed source and reuse existing signing credentials. Verify exact build IDs and submission statuses before recording delivery. Deployment and submission outcomes will be recorded after execution.

## Deployed backend

- Source commit: `475d538aec619a35810fb0f826d436cf7bbf5c5c`.
- All 26 pending function bundles deployed; all 51 functions ACTIVE.
- Downloaded deployed sources match the committed checkout; JWT settings and feature gates unchanged.
- Worker now version 41; all 126 migrations already present, none applied during this release.
- Unauthenticated smoke: access denied by all 26 endpoints. Five handlers return denial as HTTP 500; their entrypoints and auth/error helper are byte-identical to the predeployment downloaded sources. No predeployment HTTP comparison was performed.
- Evidence: `docs/audits/2026-10-08-all-changes-release/backend/`.

## iOS TestFlight delivery

- Version **1.3.4 (20)**, bundle `gg.promptwars.app`.
- [EAS build](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/35c4b1d1-7d56-4f57-92e6-8d297254aefd): FINISHED, exact source commit above.
- [Submission](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/submissions/d8efec75-8b95-4d98-bcdd-9ca46df7db05): FINISHED.
- Apple verified `VALID / IN_BETA_TESTING` at 2026-10-08 12:41:57 UTC.
- Existing signing reused; IPA identity, ZIP integrity and strict recursive signature verification passed. Uploaded source showed no drift.
- No public review submitted. Physical installation and exact tester-group membership not independently checked.
- Evidence: `docs/audits/2026-10-08-all-changes-release/ios/`.

## Android internal-testing delivery

- [Production AAB build](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/f3ceb8ea-7074-4705-b1b8-b49c6b036913): FINISHED, source commit `475d538`, version **1.3.4 (10)**.
- Actual manifest: `gg.promptwars.app`, version name `1.3.4`, version code `10`, debugging disabled.
- Bundletool validation, ZIP integrity, JAR signature and existing upload-certificate checks passed.
- AAB SHA256: `2f3938152f96778b8075fe316bdcf84b182d34d7914a3d22b57eac5184bca714`.
- EAS has no assigned Google Play service-account key; authenticated Play Console is the delivery route.
- Delivered through the native Chrome file picker after the extension upload path continued to report a file-access error. No Chrome settings were changed by the agent.
- Google Play accepted version code `10`; release name `1.3.4 (10)` and en-US notes were saved and published to internal testing.
- Final Play Console status: **Available to internal testers**, latest release **1.3.4 (10)**, one version code, released October 8 at 15:05 Europe/Warsaw. No public store review or production rollout.
- One non-blocking warning: no deobfuscation mapping file. Supported-device counts unchanged.
- Screenshot: `docs/audits/2026-10-08-all-changes-release/android/play-internal-testing.jpg`.
- Evidence: `docs/audits/2026-10-08-all-changes-release/android/aab-inspection.json`.
