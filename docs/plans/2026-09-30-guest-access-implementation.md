# Full guest access implementation record

The user-approved plan in this task is the implementation specification: full
guest gameplay and purchases, optional Apple/Google/verified-email linking on the
same Supabase UUID, no account merging, and rollout with the existing 13+
eligibility release. All age, consent, moderation and anti-abuse rules remain.

## Execution and integration

Work continues in the existing feature checkout, preserving the earlier auth
release and subsequent unpublished UI work. The local implementation made no
commits or database resets. The later authorized hosted setup deployed additive
safeguards while keeping the combined release and guest intake disabled. A task
baseline is retained in `/tmp/pw-guest-before` for review against the pre-existing
dirty checkout.

| Workstream  | Owns                                                                                                      | Shared contract                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Backend     | Guest permits, additive SQL, registration service, SQL/Deno coverage                                      | Config `guest_signup_enabled`; authorize `provider: anonymous`; response `authorization_token` and `permit_expires_at` |
| Linking     | Auth coordinator, native link refresh, email upgrade UI/utility                                           | `signInAnonymouslySafely(input, operation)`; Settings embeds SignInMethods                                             |
| Entry       | RegistrationForm, entry screens, routing/restoration, client registration API                             | Guest metadata key `registration_authorization`; no account before eligibility                                         |
| Integration | Settings exit warnings, home reminder, purchase warning, documentation, console setup, final verification | Same UUID and existing purchase ownership; no new guest gameplay gates                                                 |

The guest permit is random, hash-only in private storage, valid for five minutes
and consumed atomically with profile/eligibility/grants. Guest intake is separate
from ongoing eligibility. No anonymous account cleanup by age/inactivity.

## Progress

- [x] Backend authorization and tests.
- [x] Safe anonymous sessions, native/email linking and conflicts.
- [x] Guest entry, eligibility and session-restoration UX.
- [x] Settings, reminder, purchases and account-switch integration.
- [x] Release documentation, draft legal notices and published email-code template.
- [x] Hosted additive migrations, 41 current auth-related function bundles, Auth hook, manual linking, anonymous Auth support and native Apple enablement.
- [x] Apple credentials/relay sources and Google web, iOS, EAS Android and Play Android clients.
- [x] Verified Resend sending and enabled Supabase SMTP with a domain-scoped sending key.
- [ ] Production email delivery, receiving verification and app processing.
- [ ] Signed-device acceptance and release activation after external prerequisites.
- [x] Independent review and final app/backend/SQL verification.

## External release dependencies

Reviewed regional policies, KWS Consent Management onboarding and implementation,
required assurance, AI-provider suitability, and audience/store approval remain
prerequisites. Do not invent policies or enable guest intake before readiness.
Signed device and Play-installed acceptance must be distinguished from automated
checks. Production credentials/settings are only changed where the concrete
action is authorized and the rollout sequencing remains safe.

## Verification

- Baseline before this task: 199 Jest suites / 1,620 tests passed.
- Final integrated `rtk proxy yarn test --runInBand`: **206 suites / 1,709 tests
  passed**, zero failures. Log: `/tmp/pw-guest-final-jest.log`. Coverage includes
  auth restoration/retry, eligibility-first guest signup, duplicate actions,
  account-switch races, native/email linking, reminders, checkout and recovery.
  The final guest recovery copy was also checked with all 11 provider UI tests.
- Backend `rtk proxy deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests`: **426 passed, 0 failed, 7 ignored** (18 steps).
  Environment-gated remote and Auth HTTP checks did not exercise integrations.
- `rtk proxy python3 scripts/test-social-auth-db.py`: social, Apple and guest
  SQL/RLS fixtures passed with **ROLLBACK**. Verified authorization expiry,
  rotation/replay, identity/type mismatch, eligibility/consent, grant rollback,
  private records and continued guest access after intake shutdown. Existing
  local Docker database used; no reset or persistent migration apply.
- `rtk proxy node_modules/.bin/tsc --noEmit`: passed after regenerating Expo's
  local route declarations for the new entry route.
- `rtk proxy yarn lint`: zero errors; one existing require-style warning in
  `app/_layout.tsx`. Scoped lint for changed helpers/providers/tests passed.
- TOML parses; configured local email template exists and contains the OTP;
  anonymous Auth remains disabled in local config. Hosted Auth support was enabled
  later behind the registration safeguards described below. `git diff --check`
  passed (line-ending conversion notices belong to the existing working tree).

Independent backend/auth and mobile-integration reviews found four P2 issues:
Apple authorization retry visibility, restricted-guest account switching,
pending-link cancellation on confirmed switch, and an unsupported linked-account
switch action. All were fixed, regression tested and re-reviewed. The restoration
loading overlay also now hides/disables auth deep-link children until restoration
finishes. No remaining P1/P2 findings in those reviews.

## Hosted setup completed so far; release not activated

On 30 September 2026, the Apple revocation, social eligibility and guest
registration migrations (`20260922162927`, `20260922163026`, `20260930164433`)
were applied to project `uoyjhudegdpanrgllfoj`. All 41 auth-related bundles were
verified current among 49 active functions. The hosted
`public.before_user_created_hook`, manual linking, anonymous Auth support and
native Apple provider for `gg.promptwars.app` are enabled. Email confirmation is
on. The combined release and guest intake remain **false**, minimum client
version remains `1.4.0`, and there are zero jurisdiction policies.

A direct anonymous Auth signup without a permit returned HTTP 403
`registration_required`, with counts unchanged at seven users, seven profiles and
zero anonymous users. No account was created. The audit is recorded in
`docs/audits/2026-09-30-guest-auth/hosted-verification.json`; it does not claim successful provider
login or linking. During hosted preparation, `leave-battle` was corrected to use
the account-management capability so required settlement remains possible after
eligibility restriction. Its ownership checks remain in force; focused Deno
coverage passed **13 tests and three steps**.

All three SQL suites subsequently passed against hosted Supabase in rollback
transactions with bounded timeouts. Before/after comparison confirmed all 17
checked tables were unchanged and no test accounts, policies, triggers or helpers
persisted. Evidence is in
`docs/audits/2026-09-30-guest-auth/hosted-sql-acceptance.json`. Real concurrent
permit consumption and provider/device flows remain acceptance gaps.

The hosted **Change Email Address** template now matches
`supabase/templates/change-email.html`, with subject **Confirm your Prompt Wars
email** submitted to the editor. The in-app OTP and legacy confirmation link
were verified after reload; the browser redacts the subject readback.
On 1 October, Resend verified sending DKIM, MX and SPF/TXT. A dedicated sending
key restricted to `promptwars.gg` was installed in Supabase custom SMTP, which is
enabled and verified after dashboard reload. Host/port, sender name and minimum
interval were read back; the submitted sender address/username and stored
password are redacted. No test email, SMTP authentication probe or end-to-end
delivery check has run. Evidence is in
`docs/audits/2026-09-30-guest-auth/resend-smtp-verification.json`.

The owner then chose to move all incoming mail to Resend. The root MX now points
only to `9 inbound-smtp.eu-west-1.amazonaws.com.` on both authoritative
nameservers over TCP; `10 mail.promptwars.gg.` was removed. Recursive caches
still show the old route. Sending records remain unchanged. Receiving
verification is pending and no receiving webhook/app handler is configured.
See `docs/audits/2026-09-30-guest-auth/resend-receiving-mx-2026-10-01.json`.
The hosted Site URL was changed from
localhost to `promptwars://`; `promptwars://reset-password` was added alongside
the existing `promptwars://` allowlist entry. Saved values match
`utils/authCopy.ts` and were verified in the dashboard.

The dedicated Apple key `5NWY9P7M25` for team `9665HWDCCA` is now installed
server-side after the owner moved the file. PKCS8/P-256 and ES256 sign/verify checks
passed; the remote secret digest matched and the encryption key stayed unchanged.
The configured revocation worker returned HTTP 200 with zero revoked/retrying
jobs. Evidence: `docs/audits/2026-09-30-guest-auth/apple-provider-verification.json`.
Apple Private Email Relay now lists `promptwars.gg` and `send.promptwars.gg`,
with SPF checkmarks and all four prior sources preserved after reload. Real Apple
authorization exchange, relay delivery and deletion acceptance remain.

Google Auth Platform is configured in External/Testing, with the approved owner
contact/test user, existing legal-page URLs and only basic identity scopes. Web,
iOS, EAS Android and Play Android clients are created; Supabase Google is enabled
with all four IDs, nonce validation and email required, verified after reload.
Real public IDs are installed in all three EAS environments and local
configuration; the checked-in iOS reversed scheme and server audience are set.
Forty-six focused Jest tests and two Deno tests passed, plus Expo/plist checks.
Evidence: `docs/audits/2026-09-30-guest-auth/google-native-configuration.json`.
EAS development/production fingerprints and the owner's supplied Play SHA-1,
with the inspected Play SHA-256, are recorded in
[`SOCIAL_AUTH_RELEASE.md`](../SOCIAL_AUTH_RELEASE.md). The separate Play client is
saved in Google and Supabase. Optional Play ownership verification remains
unverified because Google requires Play Console administrator permission; this
did not block client setup. Google remains in Testing, with production publishing
and applicable brand verification required before general availability.
No private credentials were added to the app. The concept, safety playbooks,
teen feasibility document and staged legal pages describe full guests; existing public legal pages remain unchanged.

## Remaining acceptance work

- Provision reviewed regional/subdivision policies, required age assurance,
  actual KWS Consent Management integration, AI-provider suitability and truthful
  store declarations. Missing inputs remain fail closed.
- Test simultaneous permit consumption through separate transactions and
  successful authorized hosted signup after prerequisites permit it. The hosted
  negative probe confirms rejection without a permit; rollback fixtures exercise
  competing prechecks, replay and transactional failure, but neither constitutes
  a concurrent successful HTTP signup test.
- Test signed iOS/Android builds and Play signing with fresh/existing accounts,
  Apple Hide My Email, multiple Google identities, OTP delivery/verification,
  interrupted linking, reinstall/session loss, cross-device recovery, both battle
  formats, full progression/rankings/generation, guest purchases/subscriptions,
  restores and deletion. Mocked unit tests do not replace these checks.
- Resolve/recheck the earlier documented full-iOS-build RevenueCat/Xcode blocker
  before TestFlight acceptance; this task did not run signed builds.
- Publish reviewed notices and align release/minimum client versions (current
  package is 1.3.3; staged minimum is 1.4.0), then activate the combined release
  and guest intake. Rollback stops new guest intake without disabling eligibility
  enforcement or deleting existing guests. Do not advertise worldwide coverage
  until all intended markets have reviewed policy.
