# iOS 16 TestFlight delivery

Status: delivered to internal TestFlight. Apple confirmed `VALID` and `IN_BETA_TESTING` for exact build 16 at 2026-10-02 15:50:28 UTC; `expired=false`.

- Version: `1.3.3 (16)`; bundle `gg.promptwars.app`; App Store Connect app `6788787677`.
- Exact [EAS build](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/builds/c60b6c40-b019-46d6-bf93-b88e3200fd33): finished at 2026-10-02 14:45:42 UTC.
- Exact [submission](https://expo.dev/accounts/prompt-wars/projects/prompt-wars/submissions/d50ee6c3-b4c8-4273-b088-007d281c44e6): scheduled at 14:52:25 UTC, finished at 15:48:55 UTC, for existing internal groups `Team (Expo)` and `testers`, with `--no-auto-testflight-setup --non-interactive --no-wait`. No new invitations, public review, or optional paid release-notes feature.
- Verified IPA: 59,281,896 bytes, SHA-256 `47f2ab418ee6befc609b55c5c0ba373eed66dc0d060b0cf86899eccea1e4ba4b`. Strict recursive Apple signature verification passed outside the sandbox; distribution entitlement, production push environment, and encryption declaration checked.
- The 503-file frozen source manifest includes the result winner-side fix; its three changed source files match current hashes. Compiled JavaScript contains composer and `winnerSide`/`viewerSide` markers. Private backend markers are absent.
- Intermediate build 15 is superseded. Its submission `5d810af7-757c-4a34-8c5c-815a438a154c` was canceled by the release owner; it was not retried.

Evidence: `ios-16-delivery-final.json`, `ios-16-build-current.json`, `ios-16-binary-verification.json`, `ios-16-signing-verification.json`, `ios-16-submit-request.json`, `ios-16-submission-current.json`, `ios-16-apple-current.json`, `ios-16-source-manifest.json`, and `ios-16-source-check.json`.

Apple reports this build as internally beta-testable. Individual tester installation was not performed. External state is `READY_FOR_BETA_SUBMISSION`; no external beta review or public App Review was submitted. Verification used normal EAS CLI authentication throughout, without extracting credentials. No app source changed during delivery.

## Later Android-only correction

After iOS16 delivery, Android native QA identified an IME/footer overlap. The current shared route now selects conditional padding on Android only; its iOS branch remains padding and its web/default branch remains undefined. Android7 will contain that correction. The frozen iOS16 manifest remains the evidence for this IPA; the current checkout is expected to differ in that one route. This does not claim native iOS keyboard acceptance, which remains limited as documented in the native audit.
