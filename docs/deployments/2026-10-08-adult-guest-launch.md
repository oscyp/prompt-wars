# Adult guest launch — 8 October 2026

The owner approved optional sign-in for the current 18+ public launch, separately from the unfinished 13+ combined eligibility/social-authentication rollout. This approval supersedes the earlier requirement that all guest intake await the combined release.

## Scope and behavior

Play now uses the existing adult confirmation and public terms, then creates an anonymous Supabase player without email/password. The backend issues a short-lived, single-use, hashed permit and consumes it atomically with the profile and welcome ledger grant. Direct anonymous requests or client metadata alone cannot authorize account creation. Existing email signup, existing accounts, full guest gameplay/rewards/purchases and optional verified-email linking retain their behavior.

The independent adult guest flag works only while the combined release is off. No jurisdiction policies or guardian consent are fabricated; this change retains the current adult compatibility policy rather than activating the future regional eligibility system. Disabling new guest intake preserves existing guest sessions.

## Delivery steps

- [x] Backend permit/configuration/auth-hook tests and migration.
- [x] Client entry, adult confirmation, failure/retry and optional linking tests.
- [x] Independent security review and complete relevant test suites.
- [ ] Deploy additive backend change; verify old email signup remains available.
- [ ] Signed-client guest creation, onboarding, gameplay, linking/deletion and purchase access verification.
- [ ] Publish accurate adult guest disclosures and activate verified server configuration.
- [ ] Build and upload replacement iOS/Android 1.3.4 binaries with incremented build/version codes.
- [ ] Update store review access instructions and finish authorized store submissions.

This file records planned delivery, not completion. No review credentials, tokens or private keys belong here.

## Verification and deployment evidence

- Client: 229 Jest suites / 2,015 tests passed; final cancellation case passed in the focused run. Typecheck passed using generated Expo route declarations.
- Backend: 597 Deno tests / 74 steps passed; 7 gated tests skipped. Four SQL signup suites passed inside a rollback-only transaction.
- Separate PostgreSQL connections: 16 same-network requests produced 10 permits and 6 rate limits; eight attempts to redeem one permit produced exactly one account and welcome grant; expiry was rechecked after waiting for a lock.
- Independent review found a deletion-based signup-cap bypass and it was fixed/tested. Minimal 24-hour HMAC network reservations survive account deletion; per-account age/Terms evidence is deleted with the account. Redeemed permit metadata is removed atomically. No guest accounts are automatically cleaned up.
- Migration `20261008183306` and the registration Edge Function deployed to project `uoyjhudegdpanrgllfoj`. Intake remains off pending hosted acceptance. Existing Auth anonymous/manual linking switches are on, with email confirmation enabled.
- Guest legal disclosures published through landing-only commit `6c0e379`; Vercel completion still to verify. The newer website artwork metadata is preserved.
- Local Xcode 27 cannot compile the existing RevenueCat dependency. Simulator QA uses an existing 1.3.2 development host with current source JS; this is not evidence for the new signed binary.
