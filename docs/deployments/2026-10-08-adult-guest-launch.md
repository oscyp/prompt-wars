# Adult guest launch — 8 October 2026

The owner approved optional sign-in for the current 18+ public launch, separately from the unfinished 13+ combined eligibility/social-authentication rollout. This approval supersedes the earlier requirement that all guest intake await the combined release.

## Scope and behavior

Play now uses the existing adult confirmation and public terms, then creates an anonymous Supabase player without email/password. The backend issues a short-lived, single-use, hashed permit and consumes it atomically with the profile and welcome ledger grant. Direct anonymous requests or client metadata alone cannot authorize account creation. Existing email signup, existing accounts, full guest gameplay/rewards/purchases and optional verified-email linking retain their behavior.

The independent adult guest flag works only while the combined release is off. No jurisdiction policies or guardian consent are fabricated; this change retains the current adult compatibility policy rather than activating the future regional eligibility system. Disabling new guest intake preserves existing guest sessions.

## Delivery steps

- [x] Backend permit/configuration/auth-hook tests and migration.
- [x] Client entry, adult confirmation, failure/retry and optional linking tests.
- [x] Independent security review and complete relevant test suites.
- [x] Deploy both additive migrations and the registration Edge Function; verify hosted guards, permissions and source parity.
- [x] Activate the independent adult guest configuration at **2026-10-08 18:55 UTC**, with the combined release disabled.
- [x] Verify guest onboarding, practice creation and session restoration after restart in the native Expo development host.
- [x] Fix the fresh-sign-in RevenueCat store-loading gap with account-change and stale-response regressions.
- [ ] Verify fresh sign-in followed by Wallet/Starter Pack in the replacement binaries without restarting the app.
- [ ] Verify a completed battle and guest linking/deletion/purchase access in the exact replacement store binaries.
- [ ] Confirm the live hosting deployment of the published adult guest disclosures.
- [ ] Build and upload replacement iOS/Android 1.3.4 binaries with incremented build/version codes.
- [ ] Update store review access instructions and finish authorized store submissions.

Hosted adult guest intake is active. Both platforms need replacement binaries containing the final fresh-sign-in store-loading fix; their new build numbers are pending. **No store submissions have been made for this adult guest launch**. The earlier all-changes testing release is separate. No review credentials, tokens or private keys belong here.

## Verification and deployment evidence

- Client: 229 Jest suites / 2,015 tests passed; final cancellation case passed in the focused run. Typecheck passed using generated Expo route declarations.
- A later release audit found that RevenueCat loaded offerings only at provider mount. A fresh sign-in after a signed-out launch therefore had no purchase catalog until restart; Wallet could not reach the purchase method's lazy SDK initialization. The provider now clears and reloads store data on an actual account change, outside the Auth callback, and rejects obsolete data/error/loading results. Token refreshes do not reload the store. Six focused suites / 51 tests passed, including fresh sign-in, account switching, sign-out, delayed success/failure, and batched sign-out/sign-in to the same account. Pending purchase recovery and server purchase eligibility tests remain green. Native verification without restart is still required.
- Backend: 597 Deno tests / 74 steps passed; 7 gated tests skipped. Four SQL signup suites passed inside a rollback-only transaction.
- Separate PostgreSQL connections: 16 same-network requests produced 10 permits and 6 rate limits; eight attempts to redeem one permit produced exactly one account and welcome grant; expiry was rechecked after waiting for a lock.
- Independent review found a deletion-based signup-cap bypass and it was fixed/tested. Minimal 24-hour HMAC network reservations survive account deletion; per-account age/Terms evidence is deleted with the account. Redeemed permit metadata is removed atomically. No guest accounts are automatically cleaned up.
- Migrations `20261008183306` (adult guest permits) and `20261008185347` (authorization profile index) and the registration Edge Function deployed to project `uoyjhudegdpanrgllfoj`. Hosted ACL checks and deployed-source parity passed. The follow-up index covers account-deletion cascades and removes the redundant authorization-network index.
- Adult guest intake was enabled at **18:55 UTC**. The combined release and its guest flag remain disabled. Existing Auth anonymous/manual linking switches are on, with email confirmation enabled. To stop new adult guest intake, disable only `private.auth_release.adult_guest_signup_enabled`; existing guests retain access.
- Hosted probes passed: direct anonymous signup and false adult attestation were blocked, and attempted forwarded-header spoofing did not create a new network identity. The probes left the Auth user count unchanged. A forged Cloudflare connecting-IP header was rejected with HTTP 403; an accepted X-Forwarded-For variant resolved to the same HMAC network reservation.
- Security advisor warning/error keys were unchanged from the pre-deployment baseline: 68 before and after, with no new security warnings or errors. The broader scan identified the profile foreign-key index addressed by the second migration. Private tables intentionally have RLS enabled without client policies.
- Guest legal disclosures published through landing-only commit `6c0e379`; Vercel completion still to verify. The newer website artwork metadata is preserved.
- Native QA in the Expo development host passed guest creation/onboarding, practice creation and session restoration after restart. A completed battle has not been verified. Local Xcode 27 cannot compile the existing RevenueCat dependency, so this QA uses the existing 1.3.2 development host with current source JS; it does not verify either replacement store binary.

## Replacement build status

| Platform | Version / build | EAS build ID prefix | Source commit | Verified status |
| --- | --- | --- | --- | --- |
| Android | 1.3.4 (11) | `bb1d2800` | `6eb4ac2` | Superseded: lacks the fresh-sign-in store-loading fix |
| iOS | 1.3.4 (21) | — | `6eb4ac2` | Failed because the build encountered CRLF line endings; superseded by build 22 |
| iOS | 1.3.4 (22) | `5c8b3654` | `1463d32` | Superseded: lacks the fresh-sign-in store-loading fix |
| Android | 1.3.4 (new version code pending) | — | Fix commit pending | Rebuild required after lifecycle verification |
| iOS | 1.3.4 (new build number pending) | — | Fix commit pending | Rebuild required after lifecycle verification |

These are the last observed build states, not claims of upload or store acceptance. Record exact finished build IDs and validate the produced artifacts before submitting them. Exact store-binary QA, a completed guest battle and the remaining account/purchase checks are still outstanding.

## Evidence locations

The following local evidence files are outside the repository and may be temporary:

- [Hosted ingress probes](/tmp/prompt-wars-adult-guest-evidence/hosted-ingress-probe.json).
- [Deployed migration, configuration and ACL verification](/tmp/prompt-wars-adult-guest-evidence/deployment-acl-verification.json).
- [Pre-deployment security advisor baseline](/tmp/prompt-wars-adult-guest-evidence/advisors-before.json) and [matching-scope post-deployment report](/tmp/prompt-wars-adult-guest-evidence/advisors-after-security-warn-error.json).
- [Expected migration function-body hashes](/tmp/prompt-wars-adult-guest-evidence/function-body-hashes-expected.json).
- [Local SQL verification log](/tmp/prompt-wars-auth-db-test.log) and [PostgreSQL concurrency verification log](/tmp/prompt-wars-adult-guest-concurrency.log).

The broader `advisors-after.json` includes performance and informational findings that the original security-only baseline did not collect; additional entries in that broader report are not proof of deployment regressions. The failed initial `deployment-verification.json` attempt is not verification evidence; use the successful ACL report above.

For the previously delivered 1.3.4 (20) TestFlight and 1.3.4 (10) Android internal-testing artifacts, see the [earlier all-changes release record](2026-10-08-all-changes-release.md) and its repository evidence under `docs/audits/2026-10-08-all-changes-release/`. Those earlier delivery outcomes do not establish submission or QA of these replacement builds.
