# Teen Audience Feasibility — Draft for Legal Review

Status: **NO-GO for lowering the current 18+ gate.** This is an engineering and
product risk assessment, not legal advice. The gate must remain unchanged until
qualified counsel approves a jurisdiction-specific target age, the controls
below ship, store declarations are accepted, and the implementation concept is
revised.

## Why the current build is not teen-ready

Prompt Wars combines free-text UGC, AI-generated portraits and battle media,
competitive social interaction, push notifications, device/anti-abuse signals,
and purchases. The current signup records an 18+ affirmation, not a date of
birth, age band, country-specific digital-consent decision, or verified
parental authorization. Existing moderation/reporting/deletion controls are a
good base, but they do not form a child-privacy program.

Store ratings and privacy consent are separate decisions. Apple requires an age
rating questionnaire covering content descriptors, controls, and capabilities;
an app whose own EULA minimum is higher must override to a compatible higher
rating. Google requires accurate target-age declarations and applies Families
requirements when any target audience includes children; its guidance notes
that even 13–15 and 16–17 groups may be children in some locales.

GDPR Article 8 sets 16 as the default age for consent-based direct information
society services, permits Member States to lower it no further than 13, and
requires reasonable verification of parental authorization below the relevant
age. COPPA applies to child-directed services and services with actual knowledge
of collecting personal information from a child under 13; it includes notice,
verifiable parental consent, minimization, access/deletion, security, and
retention obligations.

Authoritative sources reviewed 4 September 2026:

- [Apple: Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)
- [Google Play: Target audience and app content](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en-GB)
- [GDPR Article 8, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02016R0679-20160504)
- [FTC: COPPA Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)

## Data and safety inventory

| Surface                | Current product behavior                                                         | Teen-readiness decision required                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-text UGC          | Battle prompts, judge explanations, battle cries, reports                        | Define age-appropriate policy, classifier thresholds, human escalation, appeals, and guardian visibility.                                                  |
| Generated media        | Portraits, Tier 0 compositions, paid video reveals                               | Validate provider terms for minors, prevent sexual/minor likeness generation, document post-generation moderation and takedown SLA.                        |
| Social graph           | Matchmaking, rivals, blocks, rankings                                            | Threat-model grooming, harassment, discoverability, contact limits, opponent diversity, and default privacy by age band.                                   |
| Push tokens            | Device token plus notification preferences                                       | Establish necessity, consent/legal basis, youth-safe copy and quiet-hour defaults, deletion, and vendor handling.                                          |
| Anti-abuse/device data | Device fingerprint, attestation, IP/device velocity signals                      | Document fields, hashing/pseudonymization, legal basis, strict retention, access, vendors, false-positive appeal, and whether parental notice is required. |
| Purchases              | RevenueCat events, subscriptions, credit packs                                   | Review minor contract capacity, guardian approval, refund rights, spend caps, restore/family-sharing behavior, and store youth monetization rules.         |
| Moderation             | Pre-prompt and post-video checks, audit events                                   | Prove coverage across locales, staff the report SLA, test evasions, and define mandatory escalation for child-safety risks.                                |
| Reporting/blocking     | Reports, blocks, triage and appeal paths                                         | Make controls prominent and age-comprehensible; define guardian/law-enforcement escalation and evidence preservation.                                      |
| Retention/deletion     | Account deletion removes auth/device data and anonymizes retained battle history | Create a field-level schedule, youth-specific deletion rules, backup/provider deletion, guardian access/deletion, and retention exceptions.                |
| Age assurance          | Boolean 18+ attestation                                                          | Select proportionate assurance by country/age band, add neutral age handling, prevent easy back-navigation changes, and minimize assurance data.           |
| Parental consent       | Not implemented                                                                  | Select a verifiable mechanism, notices, consent records, revocation, guardian access, and re-consent/versioning where legally required.                    |

## Candidate minimum-age options

| Option                           | Product impact                                                                                                                                                  | Recommendation                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Keep 18+                         | No new child-directed processing; still requires accurate store rating and adult safety operations.                                                             | **Ship now.**                                                                    |
| 16/17 only, restricted countries | Lower COPPA exposure but still involves minors and country-specific GDPR/member-state, contract, safety, and store rules.                                       | Study only after counsel provides the jurisdiction matrix and required controls. |
| 13–17                            | Requires parental-consent paths in relevant EU countries, mixed-audience design, stronger social/media protections, and likely materially different operations. | No-go for the current architecture/release plan.                                 |
| Under 13                         | Direct COPPA/Families program, verifiable parental consent and child-directed product obligations.                                                              | Out of scope; do not pursue as a configuration change.                           |

## Go/no-go gates

A future proposal may be **GO** only when all of these are complete:

1. Legal counsel signs a country-by-country minimum-age, consent/legal-basis,
   contract-capacity, store-policy, and transfer/vendor matrix.
2. Product specifies the actual teen cohort and excludes unsupported regions;
   “available to teens” is not treated as one global setting.
3. Security/privacy complete a data-flow map, DPIA/child-impact assessment where
   applicable, minimization pass, retention schedule, deletion verification,
   incident response, and processor/AI-provider review.
4. Safety approves youth-specific UGC/generated-media policy, contact defaults,
   moderation tests, reporting, guardian support, escalation, and staffing.
5. Monetization approves guardian controls, spend limits, refund/restore
   behavior, and removal of any age-inappropriate pressure patterns.
6. Neutral age assurance and any required verifiable parental consent are
   independently tested without storing excess identity data.
7. Apple/Google declarations and marketing assets accurately match the audience
   and content; legal reviews the final store submissions.
8. The approved decision is incorporated into
   `docs/prompt-wars-implementation-concept.md` before the age gate changes.

Until every gate passes, the accepted recommendation is **NO-GO: keep Prompt
Wars 18+**.
