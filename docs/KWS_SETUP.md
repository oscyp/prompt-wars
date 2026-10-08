# KWS guardian consent integration

Reviewed against Epic's public documentation on 2026-09-22.

## Current release gate

The KWS adapter intentionally reports `ready: false` and throws `consent_unavailable` when asked to start or check guardian consent. Registration must remain pending when consent is required. There is no mock approval, environment flag that enables approval, fabricated API endpoint, or production consent webhook in this adapter.

KWS **Parent Verification (PV)** verifies that an adult is present. KWS **Consent Management (CM)** is a separate service that combines verification with parental consent. The [PV service flow documentation](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-flow) explicitly says PV does not obtain consent or address direct notice requirements and directs developers to their Technical Account Manager for CM. The [KWS overview](https://dev.epicgames.com/docs/kids-web-services/kws-overview) describes the services separately.

Consequently, even a genuine, signed `parent-verified` event must never grant consent, make a registration eligible, create an account, or lift account restrictions. A guardian clicking a client redirect also cannot approve registration.

## Confirmed public contracts

The [PV API integration documentation](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-integration) documents:

- OAuth client credentials: `POST https://auth.kidswebservices.com/auth/realms/kws/protocol/openid-connect/token`, HTTP Basic with the KWS client ID and API key, form body `grant_type=client_credentials&scope=verification`.
- A `send-email` API operation receiving the guardian's `email`, child's `location`, guardian's `language`, `userContext: "parent"`, and optional `externalPayload` of at most 250 characters.
- Environment-specific organization/client IDs, API key, service API host, webhook secret, and verification-response secret available in the Developer Portal.

The [PV API reference](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-api-reference) points to the authenticated organization-specific API specification. Its exact operation URL and responses were not available in the public documentation reviewed. No guessed `send-email`, status, or CM endpoint is implemented. The reference requires a nonempty `User-Agent` on API requests and documents a limit of ten requests per hour per unique email address.

The [webhook documentation](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/set-up/pv-service-configure-webhook) does publish the PV authentication contract:

```text
POST <configured webhook URL>
x-kws-signature: t=<epoch seconds>,v1=<hex HMAC>[,v1=<hex HMAC>]
signature input = <timestamp>.<exact UTF-8 POST body>
algorithm = HMAC-SHA256 using the KWS webhook secret
```

The signed event has `name: "parent-verified"`, an ISO timestamp in `time`, `orgId`, `productId` (nullable for organization configuration), and `payload` containing `parentEmail`, `externalPayload`, and `status: { verified: true, transactionId }`. During secret rotation, multiple `v1` signatures may be present; a valid signature for a configured current or previous secret authenticates the event. The raw body must be verified without parsing and reserializing it first. KWS retries webhook failures with exponential backoff.

The [verification response documentation](https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/set-up/pv-service-configure-verification-response) describes a separate signature over the returned `status` and `externalPayload` strings. It is not the webhook signature protocol. No redirect handler is implemented here and redirect parameters never establish consent.

## Implemented adapter boundary

`supabase/functions/_shared/guardian-consent.ts` exposes the application interfaces for hosted consent initiation, authoritative status lookup, and verified CM consent evidence. These TypeScript interfaces are **our application contract**, not claims about KWS's undisclosed CM wire format. The default factory returns the unavailable KWS provider until the real CM integration is implemented and tested.

The separate `verifyKwsParentVerificationWebhook` helper implements only the documented PV webhook contract. It takes the exact body, `x-kws-signature` value, explicit organization/product configuration and webhook secrets, with an optional injected clock. It has no network requests, environment reads, logging, or database writes. Missing configuration, forged signatures, malformed events, or a mismatched organization/product fail closed.

The helper requires our pseudonymous correlation format in `externalPayload`:

```json
{ "registrationId": "<registration UUID>", "policyVersion": "<policy version>" }
```

Neither DOB, identity documents, child email, authentication tokens, nor provider credentials belong in that payload. The normalized result is explicitly `kind: "parent_verification"`, `adultVerified: true`, `consentGranted: false`. It includes only the binding, guardian email for comparison to the pending request, provider transaction reference, event time, and deduplication key. Never log the raw body or normalized event because it contains the guardian email.

Our replay policy rejects signatures older than five minutes or more than thirty seconds in the future. These windows are application policy, not provider guarantees. The stable `replayKey` identifies the organization, product, and verification transaction across re-signed retries. Any future caller must claim this key durably and atomically with its state transition; the stateless helper does not prevent an identical fresh request from being delivered twice. It must also compare the returned guardian email, registration ID, and policy version to the pending record and reject expired, superseded, or already-consumed requests. This helper is insufficient to implement a CM callback.

## Prerequisites for enabling guardian consent

1. Obtain KWS CM access and the actual organization/product integration specification from KWS. Confirm hosted direct notice and explicit consent, authoritative status retrieval, callback authentication, consent scope/version binding, declines, expiry, revocation, retries, and deduplication semantics. PV credentials alone are insufficient.
2. Complete the KWS organization/product setup, required agreements, test environment, approved parent notice and policy versions, and production review. See [Get Started](https://dev.epicgames.com/docs/kids-web-services/kws-get-started) and [Go Live](https://dev.epicgames.com/docs/kids-web-services/kws-go-live).
3. Implement the confirmed CM transport behind `GuardianConsentProvider` and use its authenticated response to produce `VerifiedGuardianConsentEvidence`. Never construct that evidence from PV output, user metadata, browser state, or unsigned callbacks. Add real provider fixtures and end-to-end test-environment verification before changing readiness.
4. Configure environment-specific provider credentials only as Supabase Edge Function secrets. This implementation defines no production CM environment variables because their required protocol is not yet confirmed. Inject PV webhook secrets and organization/product IDs into the helper if an independently approved verification-only consumer is added.
5. Keep durable consent decisions minimal and auditable: provider reference, pseudonymous registration binding, policy version, verified result and timestamps. Store no raw identity evidence or provider access tokens. Handle revocation and idempotent callback retries before permitting child accounts to rely on this integration.

No KWS account was created, agreement accepted, credential accessed, guardian email sent, or live provider request made while implementing this boundary.

## Verification

```bash
rtk proxy deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/guardian_consent_test.ts
```

The dedicated tests cover default unavailability, signed adult verification without consent, exact-body tampering, forged signatures, secret rotation, timestamp bounds, stable replay keys, organization/product binding, malformed signatures/events/correlation, and discarding purported consent/identity data from a PV event. These are local contract tests, not evidence of an onboarded or live CM integration.
