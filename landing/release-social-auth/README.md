# Staged social-authentication and 13+ legal release

These HTML files are review drafts, **not effective public policies**. They are
marked `noindex, nofollow` and visibly identify their draft status. Exclude this
directory from normal landing deployments; `noindex` is not access control.

The user approved a 13+ worldwide product target with country-specific parental
consent on 22 September 2026. The combined release remains disabled. Current
`landing/privacy-policy.html` and `landing/terms-and-conditions.html` must keep
their adult-only audience until activation. The general
`landing/account-deletion.html` resource and its footer/privacy links can ship
independently without changing the audience.

## Draft contents

- `privacy-policy.html`: neutral age/region assessment, protected derived age
  records, Apple/Google identity information, required KWS guardian consent,
  and guardian access/deletion/withdrawal requests.
- `terms-and-conditions.html`: minimum age 13, country-specific eligibility and
  guardian authorization, explicit identity linking, separate purchase
  permission, and content-rating distinction.

The drafts describe the target experience. KWS Consent Management remains an
external prerequisite, not an implemented service; see
[`docs/KWS_SETUP.md`](../../docs/KWS_SETUP.md). These pages cannot be made
effective simply by copying them to the public root.

## Coordinated activation

1. Complete the evidence in
   [`docs/TEEN_AUDIENCE_FEASIBILITY.md`](../../docs/TEEN_AUDIENCE_FEASIBILITY.md):
   versioned regional rules, functioning required consent/assurance, youth
   safety and purchases, verified provider and deletion behavior, native
   credentials/builds, and accurate store declarations. Verify the server hook,
   grants/RLS, old-client restrictions, direct API attempts, pending consent,
   revocation and recovery. Missing regions remain unavailable.
2. Compare every draft statement to the final implementation and provider
   contracts. Finalize the direct notice shown to guardians, consent scope,
   policy versions, support operations and retention handling. Set an actual
   effective date and matching policy identifiers. Remove the draft banner and
   draft title only from the final publication copies; choose the intended
   production indexing metadata. Shared assets use root-relative paths so the
   HTML works after promotion.
3. Prepare one static-site deployment containing the final privacy/terms at the
   existing public URLs, the account-deletion page, and updated landing/footer
   and structured-data audience copy. The 13+ product minimum does not establish
   a 13+ content rating. Use verified Apple/Google ratings or describe account
   eligibility without a rating claim. Do not expose this draft directory.
4. Coordinate publication and server/client activation as one release. Keep
   new registration unavailable during the cutover if the website, backend,
   store settings and mobile release cannot switch together. Publish the static
   artifact atomically, verify the public policy/deletion URLs and effective
   versions, then enable the matching server release configuration and eligible
   client rollout. Never allow new teen registrations while the visible policy
   still says that no minor may register.
5. Verify one eligible adult, one independently eligible teen, one
   consent-required pending registration, a completed real guardian-consent
   flow, denied/revoked consent, unsupported region, under-13 rejection and
   account deletion. Record the real provider/environment and store status;
   local fake responses do not satisfy these acceptance steps.
6. If the cutover cannot complete, stop new registration and the affected
   capabilities. Preserve existing consent records and the notices applicable
   to accounts already created. Do not silently relabel teen accounts as adults
   or reinstate an unchecked legacy signup path for them.

No publication, provider onboarding, store change or release activation is
performed by preparing these files.

## Local preview

Serve `landing/` as the web root and open
`/release-social-auth/privacy-policy.html` or
`/release-social-auth/terms-and-conditions.html`. Their shared assets resolve
from the root. The account-deletion page is at `/account-deletion.html` and
requires no login to read or initiate an email request.
