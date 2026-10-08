# Teen audience — approved policy and staged release

The user approved the **13+ worldwide target with country-specific parental
consent** on 22 September 2026. This supersedes the previous blanket “NO-GO”
recommendation in this document. Engineering is authorized to implement the
combined social-authentication and eligibility release. No further product
approval to begin that work is required.

**The combined release remains disabled.** Its public adult-only release and
existing 18+ signup remain available during that compatibility period. This is
an activation boundary, not a reversal of the approved audience decision.
Worldwide is the target coverage: a country or subdivision without an approved,
versioned policy or a functioning required consent/assurance path stays
unavailable. No jurisdiction is implicitly approved by a fallback policy.

## Approved behavior

- Use a neutral date-of-birth and country/subdivision step, with a hard minimum
  age of 13. Do not prompt an underage user to change their answer to qualify.
- Determine eligibility on the server from the applicable regional policy.
  Independent digital-consent age, local contract capacity, assurance and
  purchase permission are separate decisions; “13+” is not universal consent.
- Require verified guardian consent below the applicable threshold. Pending,
  declined, expired or revoked consent cannot unlock gameplay, purchases or
  create an eligible account. Client metadata and login-provider claims are not
  consent evidence.
- Use KWS as the selected guardian service. KWS Parent Verification establishes
  adult status only. The adapter remains unavailable for full consent until the
  actual Consent Management protocol and product onboarding are in place; see
  [KWS_SETUP.md](KWS_SETUP.md). A signed `parent-verified` event never approves a
  registration.
- Offer full guest access after the same eligibility and consent checks, alongside
  email and supported native Apple/Google authentication. Optional identity
  linking upgrades the same account and preserves progress and purchases. Guest
  status alone never limits gameplay or rewards. Existing saves remain separate
  on identity conflicts; never automatically merge or transfer accounts.
- Keep purchase permission separate from play permission. Teen purchases stay
  disabled unless the applicable approved policy permits them. Paid items never
  affect judging or ranked outcomes.
- Minimize age data: use the submitted DOB to assess eligibility and retain the
  assessment, next birthday, regional policy reference and necessary consent
  evidence. The derived age/birthday records remain personal information. Do
  not persist a raw DOB field, identity documents or provider access tokens in
  public profile data.

## Store ratings are a separate release decision

The product minimum is 13; **no 13+ store content rating has been established by
this decision**. Apple determines ratings from the content questionnaire and
regional rules. Google Play target-audience declarations and content ratings
must describe actual content and controls; its guidance notes that 13–15 and
16–17 can include children in some locales. Do not replace “Rated 18+” with
“Rated 13+” in marketing without verified store results.

GDPR Article 8 distinguishes the age of independent consent from parental
authorization below the applicable national threshold. COPPA addresses covered
collection from children under 13. These sources do not constitute a complete
worldwide jurisdiction matrix; record each applicable regional rule before
activating that region.

Sources checked on 22 September 2026:

- [Apple: Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)
- [Google Play: Target audience and app content](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en-GB)
- [GDPR Article 8, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [FTC: COPPA Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)
- [Google Play: Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

## Data and safety inventory

| Surface                | Existing adult-release behavior                                                                             | Activation verification required                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-text UGC          | Battle prompts, judge explanations, battle cries, reports                                                   | Define age-appropriate policy, classifier thresholds, human escalation, appeals, and guardian visibility.                                                  |
| Generated media        | Portraits, Tier 0 compositions, paid video reveals                                                          | Validate provider terms for minors, prevent sexual/minor likeness generation, document post-generation moderation and takedown SLA.                        |
| Social graph           | Matchmaking, rivals, blocks, rankings                                                                       | Threat-model grooming, harassment, discoverability, contact limits, opponent diversity, and default privacy by age band.                                   |
| Push tokens            | Device token plus notification preferences                                                                  | Establish necessity, consent/legal basis, youth-safe copy and quiet-hour defaults, deletion, and vendor handling.                                          |
| Anti-abuse/device data | Device fingerprint, attestation, IP/device velocity signals                                                 | Document fields, hashing/pseudonymization, legal basis, strict retention, access, vendors, false-positive appeal, and whether parental notice is required. |
| Purchases              | RevenueCat events, subscriptions, credit packs                                                              | Review minor contract capacity, guardian approval, refund rights, spend caps, restore/family-sharing behavior, and store youth monetization rules.         |
| Moderation             | Pre-prompt and post-video checks, audit events                                                              | Prove coverage across locales, staff the report SLA, test evasions, and define mandatory escalation for child-safety risks.                                |
| Reporting/blocking     | Reports, blocks, triage and appeal paths                                                                    | Make controls prominent and age-comprehensible; define guardian/law-enforcement escalation and evidence preservation.                                      |
| Retention/deletion     | Account deletion removes auth/push data and scrubs profile labels; shared prompts, history and media remain | Create a field-level schedule, youth-specific deletion rules, backup/provider deletion, guardian access/deletion, and retention exceptions.                |
| Age assurance          | Legacy Boolean 18+ attestation while the release switch is disabled                                         | Select proportionate assurance by country/age band, add neutral age handling, prevent easy back-navigation changes, and minimize assurance data.           |
| Parental consent       | KWS adapter fails closed pending actual Consent Management integration                                      | Select a verifiable mechanism, notices, consent records, revocation, guardian access, and re-consent/versioning where legally required.                    |

## Activation prerequisites

These are release requirements, not a request to reapprove the product decision.
Unresolved prerequisites remain visible and fail closed.

1. Populate reviewed, versioned country/subdivision policies with source and
   approval records for eligibility, consent, assurance, processing and purchase
   permission. Do not ship invented ages, blanket fallback approval or test
   fixtures as production policies.
2. Complete KWS Consent Management onboarding and implement the real hosted
   notice/consent, authenticated authoritative decision, decline, expiry,
   revocation and replay handling. PV credentials alone do not satisfy this.
3. Configure Apple/Google identities, native builds, provider token validation,
   nonce/replay protection, explicit account linking and Apple authorization
   revocation on account deletion. Verify provider cancellation and recovery.
4. Verify server signup hooks, database grants/RLS and capability checks with
   both allowed and rejected requests, old clients and direct API calls. Test
   consent expiry/revocation, retries, account deletion and transition of
   existing adult accounts. Maintain access to support and deletion while
   eligibility is restricted.
5. Review the data/safety inventory above against the shipped teen experience:
   provider terms, youth moderation, contact/discoverability, anti-abuse,
   notifications, purchase controls, guardian requests and data retention.
   Record applicable privacy assessments and required safeguards; do not mark
   these done because the age screen exists.
6. Align Apple/Google target-audience, privacy and content declarations with the
   implemented experience. Confirm accepted ratings and permitted distribution
   before changing marketing claims.
7. Publish the revised policy and terms, parent direct notice, support/deletion
   instructions and accurate landing copy in the coordinated activation
   described in [the staged legal release guide](../landing/release-social-auth/README.md).
   Keep active public legal pages adult-only until then. Publish the general
   account-deletion resource independently; it does not change the audience.

## Retention and deletion verification still required

The current `delete_my_account` implementation removes push tokens and
notification preferences; clears rival links; replaces profile and character
labels; clears the profile avatar reference; and marks the profile deleted.
The deletion service then removes sign-in credentials. It retains battle
prompts/history, result data, generated-media references, wallet transactions,
purchases and internal identifiers. It does **not** prove complete anonymization
of text a player may have included in a prompt, erase every media object, or
schedule a fixed expiry for retained shared records.

The public [account-deletion page](../landing/account-deletion.html) describes
these limits and offers email requests without reinstalling the app. Before
teen activation, verify the new registration/consent data cleanup, Apple
revocation retries, a field-level retention schedule, provider/backup handling
and support handling of personal information in retained content. Do not
promise automatic full media erasure or a deletion deadline not implemented or
operationally supported.
