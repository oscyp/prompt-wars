# Combined social authentication and eligibility release

Implementation is staged and **disabled by default**. No production jurisdiction
policy is seeded. This is not a worldwide launch or a completed guardian-provider
integration. The current public legal pages remain in force until coordinated
activation; draft replacements live in `landing/release-social-auth/`.

## Prerequisites and incomplete external integration

1. Obtain reviewed country/subdivision policies, including independent-consent
   age, age assurance, purchase restrictions, processing permission, retention,
   AI-provider suitability and store audience/content declarations. A product
   minimum of 13 does not determine an App Store or Play content rating.
2. Complete KWS Consent Management onboarding. KWS Parent Verification proves
   adulthood; it does **not** establish consent to this game. See `KWS_SETUP.md`.
   `_shared/guardian-consent.ts` and `verifyConsentManagementCallback` deliberately
   return unavailable. The reviewed CM transport, hosted initiation, status lookup
   and authenticated callback adapter still need the product-specific contract.
   No secret or environment flag enables a fictional consent integration.
   Required-consent registrations therefore remain incomplete. Required verified
   age assurance also blocks until its reviewed provider is integrated.
3. Provision native Apple/Google credentials and test signed builds. TestFlight,
   Play internal testing, a Play-installed build and real provider accounts cannot
   be replaced by simulator/unit checks.
4. Complete the audience-specific moderation review described below. Confirm the
   hosting ingress overwrites trusted network-address headers used for signup
   velocity limits. Put pre-auth registration behind deployment-level abuse/rate
   limits. Do not use caller-supplied forwarded headers on a custom ingress.

## Configuration

Client build values (public identifiers, never private keys):

| Value                               | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `EXPO_PUBLIC_SOCIAL_AUTH_ENABLED=1` | Include the combined registration and native-provider experience |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`  | Native Google token audience                                     |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`  | iOS Google OAuth client and reversed client URL scheme           |

Keep the public build flag unset during staging of the backend. The server switch
is `private.auth_release.enabled`, initially false. Its minimum version starts at
`1.4.0`; the existing app is still `1.3.3`. Set an actual release version/build
number, regenerate native configuration and coordinate this value before testing
activation. Version checks improve compatibility; registration permits and
transactional checks provide security even against modified/old clients.

For `gg.promptwars.app`, enable Sign in with Apple in the Apple App ID/provisioning
profile; configure Apple in Supabase. Create Google OAuth clients for web, iOS
bundle ID, and Android package. Register fingerprints for local development, EAS
distribution, and the **Play App Signing certificate** (the upload certificate
alone is insufficient). Use the matching iOS Google client/reversed scheme.
Enable manual identity linking in hosted Supabase Auth. Do not disable nonce
validation. Existing verified-email automatic linking remains enabled.

`app.config.js` configures the Apple entitlement and conditional Google plugin.
The checked-in iOS project includes Nitro/Google pods, the URL handler and the
real Google reversed client URL scheme. Expo introspection and plist validation
passed. Before signed-build acceptance, regenerate/inspect native configuration
as needed, review the diff, install pods, and inspect the built Info.plist.
Do not commit private credentials or generate fake client IDs to make a build pass.

Server secrets are listed in `supabase/ENV_VARS.md`. The Apple encryption key must
remain stable while encrypted refresh credentials or queued revocations exist;
rotate by re-encrypting retained credentials, not by replacing the key blindly.

## Full guest access

`Play now` creates a Supabase anonymous user only after the same regional
eligibility, consent and terms flow. Guests have the same gameplay, rankings,
generation, rewards and purchase capabilities as linked players; policy and
normal anti-abuse checks still apply. Guest status comes from `is_anonymous`,
not editable user metadata.

`private.auth_release.guest_signup_enabled` defaults to false and requires the
combined release to be enabled. Registration issues a random 256-bit permit,
valid for five minutes, retaining only its hash. Signup passes the opaque permit
in `registration_authorization` metadata. The Auth hook checks the actual account
type, and the profile transaction consumes the permit with profile, eligibility
and welcome-grant creation. Linking never creates another profile or grant.
Disabling this intake flag leaves existing guest sessions and capabilities intact.
Never schedule automatic deletion of anonymous or inactive player accounts.

Native linking publishes a refreshed session for the same UUID. Email linking
uses a verified `email_change` code and subsequent password setup. Configure the
Supabase **Change Email Address** template to display `{{ .Token }}` so players
can enter the code in-app; retain secure email change confirmation behavior.
The template is `supabase/templates/change-email.html`; it also preserves the
confirmation link for older clients. Local config selects it. The hosted template
was published on 30 September 2026 with subject **Confirm your Prompt Wars email**;
its OTP and legacy-link body were verified after reloading the dashboard.
Custom Resend SMTP is enabled; delivery and end-to-end email verification remain
pending.
Incomplete linking remains resumable and does not prevent play. Conflicting
identities keep saves separate; loading an existing account authenticates before
replacing the guest session, following an explicit recovery warning.

RevenueCat keeps the Supabase UUID before and after linking. Retain **Keep with
original App User ID** ownership behavior. The first guest purchase offers a
recovery notice with optional linking; it does not impose a guest purchase gate.
A receipt cannot recover a fighter account, transfer a purchase to a replacement
guest or grant duplicate credits. Pending transactions remain scoped to their
original account. One dismissible home reminder appears after a completed battle;
Settings always exposes sign-in methods and warns before abandoning a guest.

## Hosted deployment and remaining setup — updated 1 October 2026

Supabase project `uoyjhudegdpanrgllfoj` now has the additive migrations:

- `20260922162927_apple_authorization_revocation.sql`
- `20260922163026_social_registration_eligibility.sql`
- `20260930164433_guest_registration_authorization.sql`

All 41 auth-related function bundles were verified current; the project has 49
active functions. The hosted **Before User Created** hook is enabled for
`public.before_user_created_hook`. Manual identity linking, anonymous Auth support,
native Apple authentication (`gg.promptwars.app`), Google and email confirmation
are enabled. Anonymous Auth support does not activate guest intake: both
`private.auth_release.enabled` and `guest_signup_enabled` remain false, the minimum
client version is `1.4.0`, and there are zero jurisdiction policies.

A direct anonymous signup without a permit returned HTTP 403 with
`registration_required`. Counts remained seven users, seven profiles and zero
anonymous users; no account was created. The deployment audit is
`docs/audits/2026-09-30-guest-auth/hosted-verification.json`. These checks do not establish successful
provider login, linking, signed-device acceptance or live guardian consent.

The Apple, social-registration and guest-registration SQL suites also passed on
the hosted database, each inside BEGIN/ROLLBACK with bounded lock/statement
timeouts. All 17 inspected tables were unchanged afterward; no fixture account,
policy, trigger or helper persisted. See
`docs/audits/2026-09-30-guest-auth/hosted-sql-acceptance.json`. These suites verify
hosted SQL/RLS and transactional rollback, not a simultaneous-session permit race.

- **Apple:** the App ID has Sign in with Apple enabled for team `9665HWDCCA`.
  Supabase allows authentication without a returned email, while registration
  remains bound to the verified provider subject. Dedicated key `5NWY9P7M25`
  was validated as PKCS8/P-256 and installed as `APPLE_SIGN_IN_PRIVATE_KEY`.
  The client/team/key identifiers, stable encryption key and registration HMAC
  secret are provisioned. The configured revocation worker returned HTTP 200
  with zero revoked/retrying jobs; its five-minute schedule is active. This
  empty-queue check does not prove a real Apple authorization exchange/revocation.
  See `docs/audits/2026-09-30-guest-auth/apple-provider-verification.json`.
  Private Email Relay now lists `promptwars.gg` and the Resend envelope-sender
  domain `send.promptwars.gg`; both show SPF checkmarks after reloading the source
  list. The four existing sources were preserved. Actual Hide My Email delivery
  still requires acceptance testing.
- **Google:** Auth Platform is configured for External/Testing with the approved
  support/contact email and owner as a test user. Branding uses the existing
  home/privacy/terms URLs. Only `openid`, email and profile scopes are selected.
  Web, iOS, EAS Android and Play Android OAuth clients are created. Supabase
  Google is enabled with all four IDs, the web client first, its OAuth secret,
  nonce checks retained and authentication without email disabled. Saved provider
  settings were verified after reloading the dashboard.
  Both public IDs are installed in EAS development/preview/production and ignored
  local environment configuration; the checked-in iOS reversed scheme is present.
  `GOOGLE_SIGN_IN_CLIENT_IDS` contains the web audience used by native clients.
  Focused verification passed: 46 Jest tests, two Deno provider-token tests,
  Expo introspection and plist validation. See
  `docs/audits/2026-09-30-guest-auth/google-native-configuration.json`.
  The separate Play Android client uses the owner's supplied App Signing SHA-1.
  Optional Play app-ownership verification could not complete because Google
  requires Play Console administrator permission; this did not block client
  creation or saving its ID in Supabase. Ownership remains unverified.
  Signed-device authentication has not been exercised. Google remains in Testing;
  production publishing and applicable brand verification precede general access.
- **Email:** on 1 October, Resend verified sending DKIM, MX and SPF/TXT for
  `promptwars.gg`. The dedicated **Prompt Wars Supabase Auth** API key has Sending
  access restricted to this domain. Custom SMTP is enabled in Supabase and was
  saved/reloaded: `smtp.resend.com`, port 465, sender name `Prompt Wars`, minimum
  interval 60 seconds. The submitted username is `resend` and sender address is
  `noreply@promptwars.gg`; the dashboard redacts their saved values. The password
  is stored hidden; no credential is recorded in these documents. Email
  confirmation and the verified OTP/legacy-link template remain enabled.
  The enablement UI states 30 emails/hour; the rate-limit page was inspected,
  but its numeric value is redacted. No rate limits were changed. No test email,
  live SMTP authentication probe or end-to-end delivery test has been performed.
  Evidence:
  `docs/audits/2026-09-30-guest-auth/resend-smtp-verification.json`.
- **Incoming mail:** the owner explicitly chose to move all incoming
  `@promptwars.gg` mail to Resend for app processing. The malformed new MX owner
  was corrected to `promptwars.gg.` with priority 9 and target
  `inbound-smtp.eu-west-1.amazonaws.com.`; only the old root MX
  `10 mail.promptwars.gg.` was removed. Both authoritative nameservers confirm
  the sole Resend MX over TCP, while recursive caches still show the old route.
  The separate `send.promptwars.gg` sending MX/SPF remain unchanged. Resend
  receiving verification is still pending, so its overall domain status is
  partially verified. No receiving webhook/app handler is configured; DNS
  routing alone does not establish app processing. Evidence:
  `docs/audits/2026-09-30-guest-auth/resend-receiving-mx-2026-10-01.json`.
- **Auth redirects:** the hosted Site URL is now `promptwars://` instead of the
  default localhost URL. The allowlist retains `promptwars://` and adds the exact
  `promptwars://reset-password` callback used by `utils/authCopy.ts`; saved values
  were verified in the dashboard. Signed-device recovery still needs acceptance.

EAS development and production use the same verified signing certificate:

| Certificate | SHA-1 | SHA-256 |
| --- | --- | --- |
| EAS development/production | `CA:44:24:45:80:B8:75:C4:5F:4B:72:9B:C1:9C:04:86:6B:65:56:A2` | `0C:64:AE:95:94:15:B1:40:6A:00:94:3D:AA:0B:B4:CA:E8:3C:9E:5F:81:6D:4B:E7:26:D8:08:9D:D3:61:2C:14` |
| Play App Signing | `BA:42:AE:43:3D:59:58:D0:8E:94:27:35:96:8F:F2:D7:BC:F4:6D:10` | `12:8C:84:F6:F7:94:99:E8:F5:BF:81:58:81:4F:24:19:06:1E:AD:6A:AE:FD:3E:F8:D7:4C:B2:DC:C8:59:F1:87` |

No local Android debug certificate was found; do not substitute the EAS or Play
certificate for a future local debug build. The Play SHA-1 was supplied by the
owner and saved on its separate Android OAuth client. Validate native builds,
SMTP delivery and Apple relay delivery. Keep the combined release
and guest intake disabled until all documented prerequisites are satisfied.

## Architecture and boundaries

- `registration` is the only allowlisted pre-auth client function. Neutral intake
  rejects under-13s before identity/account/profile creation, selects a reviewed
  policy, and stores an opaque token hash plus private age-transition data.
  Identity authorization binds one short-lived permit to a normalized email or
  signature-, issuer-, audience-, expiry- and nonce-verified provider subject.
- `public.before_user_created_hook` is enabled as the hosted **Before User
  Created** hook. Local config still stages the hook disabled. The profile
  transaction independently consumes a valid permit, preventing direct Auth API
  bypass even without the hook. New accounts have no fabricated adult attestation.
  Existing adult evidence and credit-ledger idempotency remain intact.
- Supabase `signInWithIdToken` owns sessions. Manual native-token linking uses an
  isolated nonpersistent Auth client and checks account identity, preserving the
  active session on conflict/account switches. No balances/accounts are merged.
  Apple relay/different-email accounts need explicit linking.
- Credential exchanges run in isolated clients before committing a session.
  Monotonic operation IDs and serialized mutations reject delayed sign-in,
  registration, linking and recovery responses after a newer account operation.
  Password updates, sign-out and account-bound Edge retries verify the same
  account so a late response cannot overwrite or act on a newer session.
- `eligibility` is authenticated but remains available to restricted accounts.
  Gameplay defaults to an authoritative capability check. Restrictive table/RLS,
  privileged RPC fences, generation and purchase gates provide server enforcement.
  Account management, reporting, blocking and deletion remain available.
- Consent records never appear in player profiles or analytics. Callback/browser
  parameters cannot grant permission. SQL transitions deduplicate verified
  events and prevent delayed approval from undoing withdrawal.
- Apple codes are exchanged on the server; the verified subject must match the
  authenticated identity. Refresh credentials are encrypted and server-only.
  Deletion captures durable revocation work before removing the Auth identity.
  Missing credentials/provider outages do not prevent account-data deletion;
  cron retries temporary failures. The web deletion page reflects the existing
  scrub/retention behavior and directs ownership verification to support.
- Purchase checkout requires current `can_purchase`. This conservative policy
  also covers optional credit spending (cosmetics and generation), including
  earned credits. Free play and required leave-battle settlement remain available.
  Restores and already-paid
  receipt fulfillment remain available; blocking new purchases must not discard
  a charge or its ledger record. Revocation blocks subsequent gameplay/generation.

Registration tokens stay only in UI memory; a killed app starts assessment again.
Foregrounding refreshes a pending flow and account eligibility. DOB is cleared
from intake after assessment. Failed/cancelled provider selection does not create
an account. Supabase email confirmation remains a separate step.

## Moderation review before teen activation

Existing moderation continues to hold sexual content, exploitation/harm involving
minors, harassment, hate and graphic violence according to provider flags and
documented game thresholds. Moderation-before-reveal, quarantined media and refund
paths remain required. A new narrow privacy guard holds obvious email addresses,
phone sharing and home-address statements before provider generation.

The privacy guard is not comprehensive multilingual PII detection. Before
activation, review realistic teen prompts across launch languages for grooming,
sexual exploitation, self-harm, targeted harassment, doxxing and graphic violence;
calibrate the existing fiction-tolerant violence thresholds. Confirm child-data
processing terms with every AI/moderation/video provider. Preserve existing report,
block, appeal and notification caps. Do not interpret passing unit tests as that
review or as an age-rating approval.

## Deployment and rollback

1. Provision reviewed policies and credentials. Keep client exposure, the combined
   release and guest intake disabled. No real
   market is available until its explicit policy is inserted with a review
   reference, approval timestamp, processing permission and assurance settings.
   When replacing an approved jurisdiction version, explicitly withdraw the old
   row's processing permission if it must stop applying to existing accounts and
   pending permits. Records retain their reviewed policy reference as evidence;
   merely inserting a new version does not rewrite historical consent. Plan the
   required reassessment/support migration before withdrawing an existing policy.

2. Apply additive migrations before deploying functions that query eligibility.
   Deploy registration, eligibility, guardian callback (unavailable until CM
   adapter completion), Apple retention/revocation and changed gameplay functions.
   Enable the Auth hook and manual linking, then anonymous Auth support. Verify
   that direct anonymous signup without a permit is rejected. Keep the combined
   release and guest intake switches false.
3. Validate signed iOS/Android builds, including all device cases below.
4. Publish the reviewed legal pages and obtain required store approvals, then
   activate the coordinated build, combined server release and guest intake
   with the matching minimum client version.
5. After any teen account exists, **do not turn the server eligibility switch off**
   as an emergency rollback: that restores legacy compatibility. Set
   `guest_signup_enabled=false` to stop new guest creation while preserving
   existing guests. Stop other new intake
   by withholding policy approval/processing permission, or require an update,
   while keeping eligibility and consent-revocation enforcement active. Never
   re-enable legacy 18+ signup for accounts requiring the new flow.

Monitor only aggregate completion/failure counts and allowlisted error codes:
guest/signup creation, authorization rejection, linking completion, provider
failure, consent completion, link conflict, duplicate grants, purchase failures and
deletion/revocation retries. Never log tokens, birth dates, raw registration
bodies, guardian contacts or private consent evidence. Review the private durable
job queue with service access for operational retries.

## Acceptance and local verification

Run the Jest app suites, Deno Edge suites and TypeScript/lint checks. The local
`scripts/test-social-auth-db.py` applies pending schema and SQL fixtures inside a
single transaction, ending in **ROLLBACK**. It does not reset the database or
record migrations; Docker/local Supabase must already be available.

Signed-device matrix: new/existing email accounts, Apple Hide My Email, missing
subsequent Apple name/email, multiple Google accounts, cancellation/interruption,
reinstall, cross-device login, explicit linking and conflict, unchanged account
ID/balances, independent teens/adults, unavailable region, required consent,
withdrawal, purchases/restores, and account deletion. Confirm both `single` and
`bo3` battles remain unchanged. Test production Android signing through Play.

Native check currently known: the NitroGoogleSignin iOS simulator target builds.
Full simulator build on this machine's Xcode 27 is blocked in the existing
RevenueCat 5.67.1 `PaywallColor.swift` (duplicate `init(stringRepresentation:)`).
This dependency predates this change; resolve it before signed-build acceptance.

Implementation verification results are recorded in
`plans/2026-09-22-social-auth-implementation.md` and
`plans/2026-09-30-guest-access-implementation.md`.

References: [Supabase Auth hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking),
[Expo Google authentication](https://docs.expo.dev/guides/google-authentication/),
[Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[Apple deletion/revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).
