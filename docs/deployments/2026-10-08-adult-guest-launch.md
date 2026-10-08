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
- [x] Complete a free guest Bo3 practice battle and claim normal quest rewards against the production backend.
- [x] Fix the fresh-sign-in RevenueCat store-loading gap with account-change and stale-response regressions.
- [x] Verify the fresh-sign-in SDK catalog load without restart in the development host using same-process Metro and RevenueCat logs.
- [x] Confirm the live Vercel deployment of the public privacy, Terms and account-deletion adult guest disclosures.
- [x] Verify the dedicated normal reviewer account, finite RevenueCat Plus access, one auditable review-credit grant and the authorized finite Starter Pack exception.
- [x] Build, inspect, upload and select iOS 1.3.4 (23).
- [x] Save review access instructions and submit Apple app/build 23 with all purchase products for public review.
- [x] Complete Google app-access instructions, 18+ audience and final Data Safety declaration.
- [x] Finish, inspect, upload and select Android 1.3.4 (12).
- [x] Submit and verify the Google Play production review submission.

Hosted adult guest intake is active, and both stores have accepted the production review submissions. **Apple 1.3.4 (23) is Waiting for Review**, with all nine submitted items verified in the final UI at **8 October 2026, 20:07 UTC** (22:07 Europe/Warsaw). **Google 1.3.4 (12) shows Changes in review** after submission at **20:18:58 UTC**; Google's quick checks were still running, with the console indicating the changes would be sent onward once those checks complete. Neither release is approved or live. Apple is configured for automatic release after approval in 175 regions; Google has managed publishing off and a full production rollout configured for 177 countries/regions plus the rest of the world. Both builds use pushed source `8b213759987ed2ef53f2f10e3a5cb15244276e0a`. The requested submission work is complete; store review outcomes remain external. No review credentials, tokens or private keys belong here.

## Verification and deployment evidence

- Client after the committed fresh-sign-in store-loading fix: **230 Jest suites / 2,022 tests passed**, zero failures, in the full run saved below. Typecheck passed using generated Expo route declarations; the changed provider and lifecycle tests also passed ESLint.
- A later release audit found that RevenueCat loaded offerings only at provider mount. A fresh sign-in after a signed-out launch therefore had no purchase catalog until restart; Wallet could not reach the purchase method's lazy SDK initialization. The provider now clears and reloads store data on an actual account change, outside the Auth callback, and rejects obsolete data/error/loading results. Token refreshes do not reload the store. Six focused suites / 51 tests passed, including fresh sign-in, account switching, sign-out, delayed success/failure, and batched sign-out/sign-in to the same account. Pending purchase recovery and server purchase eligibility tests remain green. The fresh-sign-in SDK catalog load was verified without restart in the development host: same-process logs show reviewer binding, all seven store products requested/received and offerings updated. The pending Starter Pack modal covered the Wallet route in this exact flow; the evidence limits below identify the UI and purchase behavior this check did not exercise.
- Backend: 597 Deno tests / 74 steps passed; 7 gated tests skipped. Four SQL signup suites passed inside a rollback-only transaction.
- Separate PostgreSQL connections: 16 same-network requests produced 10 permits and 6 rate limits; eight attempts to redeem one permit produced exactly one account and welcome grant; expiry was rechecked after waiting for a lock.
- Independent review found a deletion-based signup-cap bypass and it was fixed/tested. Minimal 24-hour HMAC network reservations survive account deletion; per-account age/Terms evidence is deleted with the account. Redeemed permit metadata is removed atomically. No guest accounts are automatically cleaned up.
- Migrations `20261008183306` (adult guest permits) and `20261008185347` (authorization profile index) and the registration Edge Function deployed to project `uoyjhudegdpanrgllfoj`. Hosted ACL checks and deployed-source parity passed. The follow-up index covers account-deletion cascades and removes the redundant authorization-network index.
- Adult guest intake was enabled at **18:55 UTC**. The combined release and its guest flag remain disabled. Existing Auth anonymous/manual linking switches are on, with email confirmation enabled. To stop new adult guest intake, disable only `private.auth_release.adult_guest_signup_enabled`; existing guests retain access.
- Hosted probes passed: direct anonymous signup and false adult attestation were blocked, and attempted forwarded-header spoofing did not create a new network identity. The probes left the Auth user count unchanged. A forged Cloudflare connecting-IP header was rejected with HTTP 403; an accepted X-Forwarded-For variant resolved to the same HMAC network reservation.
- Security advisor warning/error keys were unchanged from the pre-deployment baseline: 68 before and after, with no new security warnings or errors. The broader scan identified the profile foreign-key index addressed by the second migration. Private tables intentionally have RLS enabled without client policies.
- Guest legal disclosures are live and verified on Vercel deployment `Cqyq3pQnZi1KWr9mk2MzgKVYVG3x`, production commit `6c0e379e7e5c47c484bcd8350618ce7baaf76d70`, with `landing` as the production root. The public [privacy policy](https://promptwars.gg/privacy-policy.html), [Terms](https://promptwars.gg/terms-and-conditions.html) and [account-deletion page](https://promptwars.gg/account-deletion.html) all contain the updated guest disclosures. The newer website artwork metadata is preserved.
- Native QA in the Expo development host passed guest creation/onboarding, session/battle restoration and a completed free Bo3 practice victory **2–0**, including the Tier 0 reveal, result summary and judge notes. The guest claimed the normal First Victory **+2** and Finisher Focus **+1** quest rewards; the wallet moved **11 → 14**. This used the production backend and current source JS in the existing development host, not an installed replacement store binary.

## Reviewer access verification

The dedicated reviewer is a normal player, with password sign-in and own-profile access verified. Sanitized hosted verification confirms derived Plus access is active until **2026-11-08 19:39:37.852 UTC**, with **90 round upgrades and 30 full battles** available. The actual RevenueCat promotional transaction identity is recorded. There are **zero purchase rows** for this account: the promotional entitlement was not represented as a fabricated store purchase.

The account has exactly **one `review_access_grant` ledger entry for 100 credits**. This is the review grant amount, not a claim about the total wallet balance after ordinary gameplay grants or spending. The grant is idempotent and auditable. Reviewer credentials are kept outside this document and the repository.

The owner's explicit reviewer-only exception created a live pending Starter Pack offer ending **2026-11-07 19:33:26.728267 UTC**. It used the real provisioning time and did not backdate signup, change global offer eligibility, fabricate a purchase or grant the bundle contents. Normal players retain the existing first-battle, 24–72-hour eligibility window and 48-hour offer duration.

Promotional Plus support is deployed through migration `20261008191802`, committed in `a0d3412`. It validates provider evidence, preserves paid subscriptions, revokes promotional access on terminal events, and creates no purchase or credit rows. The promotional helper is not executable by anonymous or authenticated client roles. Focused RevenueCat tests passed **14 tests / 28 steps**; separate PostgreSQL connections verified duplicate delivery, competing identities, activation/revocation ordering and paid/promotional transaction collisions. The fresh-sign-in store-loading fix is committed in `8b21375`; the remaining verification scope is documented below.

App Store Connect review notes were saved and verified after reload, covering optional guest entry, the reviewer credit grant, Plus expiry on 8 November and the Starter Pack window through 7 November. The Starter Pack uses the actual live reviewer account PNG and updated notes in place of the seed preview. The final [Apple review submission](https://appstoreconnect.apple.com/apps/6788787677/distribution/reviewsubmissions/details/017ae5b2-3af9-469a-b278-412c622dd9fd) contains **nine items**: app 1.3.4 (23), four credit packs, the Starter Pack, two Plus subscriptions and the subscription group. All nine are verified **Waiting for Review**. The selected Apple build UUID is `e8a2f709-5eed-4d23-8e91-22ec5b432d90`.

Google Play's app-access instructions, 18+ target audience and final Data Safety declaration are complete. The submitted [production release](https://play.google.com/console/u/0/developers/6091751989392131587/app/4972578862027355782/tracks/4698183965943005670/releases/2/details) contains only version code 12. The [publishing overview](https://play.google.com/console/u/0/developers/6091751989392131587/app/4972578862027355782/publishing) confirms **12 changes submitted** and **Changes in review**, with quick checks running at the final observation. Managed publishing remains off; the full rollout is configured but has not begun serving a live release. The production Apple and Google Starter Pack products are both mapped and saved in RevenueCat's default offering under `$rc_lifetime`.

## Replacement build status

| Platform | Version / build | EAS build ID prefix | Source commit | Verified status |
| --- | --- | --- | --- | --- |
| Android | 1.3.4 (11) | `bb1d2800` | `6eb4ac2` | Superseded: lacks the fresh-sign-in store-loading fix |
| iOS | 1.3.4 (21) | — | `6eb4ac2` | Failed because the build encountered CRLF line endings; superseded by build 22 |
| iOS | 1.3.4 (22) | `5c8b3654` | `1463d32` | Superseded: lacks the fresh-sign-in store-loading fix |
| Android | 1.3.4 (12) | `4fea640d-89c3-424c-b2f3-2008c64350b7` | `8b21375` | FINISHED at 20:12:57 UTC; artifact verified and uploaded; production Changes in review, quick checks running |
| iOS | 1.3.4 (23) | `3e675939-7635-40bc-b007-9b80c46e2524` | `8b21375` | FINISHED; artifact verified, selected and submitted; Waiting for Review |

iOS artifact inspection verified the app identity, strict production code signature, production RevenueCat key, adult guest markers, disabled combined/social flow and absence of the checked fixture markers. Upload completed under EAS submission `f0b09a08-d4dd-4143-845b-628024d3f044`. The subsequent public-review submission is `017ae5b2-3af9-469a-b278-412c622dd9fd`; it is awaiting review, not approved or live.

Android artifact inspection verified package/version identity, upload signature, bundletool validation, the production RevenueCat key, adult guest markers, disabled social discovery and absence of the checked fixture markers. The 104,208,929-byte AAB has SHA-256 `51fdd8191a06c66183d1e0a40074ea4f1c787717c5b6e318042f8316cdc6f215`. The manifest does not declare `AD_ID`, and the exact application source does not invoke advertising-identifier collection; this matches the saved Google declaration of No.

## Evidence limits and recorded observations

The completed guest battle, ordinary rewards, account restoration and fresh-sign-in SDK catalog checks used a development host connected to production. Exact replacement store-binary UI, completed paid purchases, guest linking and account deletion were not exercised in this smoke test. These are evidence limits, not required delivery gates; the delivery checklist relies on artifact inspection, current-source native testing and the regression suites. No new paid transaction is requested by this release record.

Two non-blocking observations were recorded without new source changes: guest recovery copy mentions Apple/Google while social discovery is disabled, and the development host displayed a duplicate React key warning on Home. The warning was dismissed; the ordinary guest battle and rewards completed successfully. Local Xcode 27 could not compile the existing RevenueCat dependency, so native smoke testing used the existing development host; the produced iOS23 archive was inspected separately.

The temporary Metro session was stopped intentionally after QA (session 70177, exit 130). Reviewer and guest accounts and simulator data were retained.

## Evidence locations

The following local evidence files are outside the repository and may be temporary:

- [Hosted ingress probes](/tmp/prompt-wars-adult-guest-evidence/hosted-ingress-probe.json).
- [Deployed migration, configuration and ACL verification](/tmp/prompt-wars-adult-guest-evidence/deployment-acl-verification.json).
- [Pre-deployment security advisor baseline](/tmp/prompt-wars-adult-guest-evidence/advisors-before.json) and [matching-scope post-deployment report](/tmp/prompt-wars-adult-guest-evidence/advisors-after-security-warn-error.json).
- [Expected migration function-body hashes](/tmp/prompt-wars-adult-guest-evidence/function-body-hashes-expected.json).
- [Local SQL verification log](/tmp/prompt-wars-auth-db-test.log) and [PostgreSQL concurrency verification log](/tmp/prompt-wars-adult-guest-concurrency.log).
- [Full Jest run after the store-loading fix](/tmp/prompt-wars-adult-guest-full-jest.log).
- [Sanitized reviewer verification query](/tmp/prompt-wars-reviewer-verification.sql) and [promotional Plus concurrency verification](/tmp/prompt-wars-revenuecat-promo-concurrency.log). The query is a reproducible read-only check; the verified values above were reported by the coordinating release agent after execution.
- [Current durable release status and hosting provenance](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/release-status.json), [preserved 19:22 history](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/release-status-history-1922.json) and [public deletion-page evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/account-deletion-live.png). The history file preserves resolved blockers; only the current status reflects completed reviewer access and store prerequisites.
- Native development-host reviewer evidence: [profile](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/reviewer-profile-native.jpg), [Wallet Plus access](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/reviewer-wallet-plus-native.jpg) and [credit products](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/reviewer-credit-products-native.jpg). These were captured after a signed-in cold restart using the production backend and StoreKit prices; they prove neither fresh-sign-in catalog loading nor replacement store-binary behavior. The [live reviewer Starter Pack](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/starter-offer-review-live-account.jpg) is the real account evidence; the separately named preview PNG is not used as proof of live provisioning.
- [Live Starter Pack capture provenance](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/starter-offer-review-live-provenance.json) records that no purchase or dismissal occurred. The offer modal can fall back to its server USD price, so this screenshot alone does not establish a localized StoreKit lookup or completed purchase.
- [Fresh-sign-in native SDK evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/reviewer-native-qa-evidence.json), [actual live Starter Pack PNG](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/starter-offer-review-live-account.png) and [saved Apple Starter Pack review evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/apple-starter-live-review-evidence.png).
- [Completed Google prerequisites](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/google-prerequisites-complete-pending-build12.jpg), [saved adult audience](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/google-adult-audience-saved.jpg) and [iOS23 artifact inspection](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/adult-guest-builds/ios-artifact-inspection.json).
- [Apple final nine-item Waiting for Review evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/apple-1.3.4-23-waiting-review.png).
- [Google final Changes in review evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/google-1.3.4-12-in-review.jpg), [Android 12 artifact inspection](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/adult-guest-builds/android-12-artifact-inspection.json) and [advertising-ID declaration verification](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/adult-guest-builds/android-12-advertising-id-verification.json). The artifact report's pre-upload `submitted: false` records its inspection time; the later store evidence and current release status establish submission.
- [Completed guest practice and reward evidence](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/guest-practice-native-qa-evidence.json), [2–0 victory](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/guest-practice-victory-native.jpg) and [normal quest rewards](/Users/patdom/sources/prompt-wars/output/store-submission/2026-10-08/release-preparation/guest-rewards-native.jpg).

The broader `advisors-after.json` includes performance and informational findings that the original security-only baseline did not collect; additional entries in that broader report are not proof of deployment regressions. The failed initial `deployment-verification.json` attempt is not verification evidence; use the successful ACL report above.

For the previously delivered 1.3.4 (20) TestFlight and 1.3.4 (10) Android internal-testing artifacts, see the [earlier all-changes release record](2026-10-08-all-changes-release.md) and its repository evidence under `docs/audits/2026-10-08-all-changes-release/`. Those earlier delivery outcomes do not establish submission or QA of these replacement builds.
