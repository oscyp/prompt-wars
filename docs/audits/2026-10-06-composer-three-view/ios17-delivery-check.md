# iOS 1.3.3 (17): verified delivery state

The supported EAS CLI 23.1.0 confirmed the exact completed submission and read the live App Store Connect status on October 7, 2026. No new submission, retry, invitation or public release was created during monitoring.

- EAS build: `23d9c863-be66-4640-aa68-79711522050f`, `1.3.3 (17)`, store distribution, bundle `gg.promptwars.app`.
- Submission: `9d527e75-b014-4b1c-b8be-a3cf0e964955`, **FINISHED**, completed October 6 at `23:51:09.799 UTC`.
- Apple: **VALID**, **IN_BETA_TESTING**, `expired: false`; external state remains `READY_FOR_BETA_SUBMISSION`. The status response links the exact EAS submission and build IDs above, distinct from old build 16.
- Existing `Team (Expo)` and `testers` groups were requested by the integration owner. CLI `submit --help` confirms the supported `--groups` flag. Completed `submit:view` returns no worker log files and exposes only the ASC app identifier in `iosConfig`; `submit:status` does not enumerate beta groups. Individual group assignment and installation by a particular tester are therefore not independently established by these reads.

Sanitized evidence: [submission proof](ios17-submission-proof.json) and [Apple status proof](ios17-apple-status-proof.json). Signed log URLs and credentials are omitted. No private CLI internals or private API queries were used.
