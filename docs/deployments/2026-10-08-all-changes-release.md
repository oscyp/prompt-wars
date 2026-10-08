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
