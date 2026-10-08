# Social authentication and 13+ eligibility implementation record

The user-approved specification is Apple and Google native login, identity linking,
country-specific 13+ eligibility and guardian consent, and Apple token revocation
on deletion, delivered together behind a disabled release switch. No guest mode.

The no-guest decision above is historical and was superseded by the approved
[full guest access implementation](2026-09-30-guest-access-implementation.md).

## Execution decisions

- Work on the existing `codex/visual-audit-remediation-20260921` checkout. It contains
  substantial unpublished user work required by the current screens; preserve it.
  Do not commit unrelated changes or reset the database.
- Native providers, Apple revocation, and the guardian-provider adapter are
  independent workstreams with exclusive file ownership. Registration, database
  enforcement, screen integration and the final verification are integrated here.
- No jurisdiction is implicitly approved. Production country policies, KWS
  onboarding, native OAuth credentials and store approvals are external release
  prerequisites, not fabricated test fixtures.
- Existing signup continues while the combined release switch is disabled. New
  clients only expose the new registration flow with the matching build flag.
  New eligibility checks must be fail-closed once enabled.

## Progress

- [x] Registration policy model, authorizations, transactional signup and RLS.
- [x] Registration/eligibility services and consent-event validation seam.
- [ ] Live KWS Consent Management transport and hosted consent flow (blocked on the reviewed onboarding contract; default adapter refuses approval).
- [x] Native providers, sign-in buttons and identity linking.
- [x] Registration UI, route gating, capability checks and recovery.
- [x] Apple authorization retention and deletion revocation.
- [x] Documentation, web deletion request, staged legal pages and native configuration scaffolding.
- [ ] Actual OAuth identifiers/signing fingerprints, approved policies, release activation and signed-device acceptance (external prerequisites).
- [x] Automated verification and implementation review.

## Verification evidence

Baseline Jest: 175 suites / 1,405 tests passed before implementation.

Final verification after integration:

- Full Jest suite: 186 suites / 1,491 tests passed.
- App TypeScript check and scoped ESLint pass. App/component lint has no errors
  and one pre-existing `require()` import warning in `app/_layout.tsx`.
- Full Deno suite: 423 passed, 18 steps, 7 opt-in integrations ignored.
- All 19 new/changed Edge entrypoints typecheck.
- Local SQL suites pass, including policy/country fallback, underage and direct
  signup bypasses, provider identity binding, expired/replayed authorizations,
  private-data access, consent duplication/revocation, credits, optional purchase
  restrictions, legacy adults, own block-list access and Apple deletion leases.
- Both new migrations also pass a repeated-application check. All SQL checks run
  inside a transaction ending in ROLLBACK, with no database reset or persistent
  migration/data changes. Docker was started for the existing local stack.
- New Google native iOS target builds. Full app build is blocked in existing
  RevenueCat 5.67.1 under Xcode 27 (`PaywallColor.swift:57`, duplicate synthesized
  initializer). RevenueCat source/version predates this change.
- Deletion-page links verified; future legal pages remain visibly staged and
  excluded from the documented landing deployment.

Review found and fixed privileged RPC/view bypasses, nullable SQL evidence
checks, obsolete country-policy fallback, incorrect reward scope, and malformed
boundary payloads. Final mobile review also found delayed Auth SDK responses
could overwrite a newer account/recovery session; session mutations now use
isolated credential exchanges and serialized, account-bound commits, covered
with deferred-response regression tests. Recovery password updates and sign-out
also reject stale operations. Final whitespace/diff checks pass.

Device/store acceptance, provider configuration and policy approvals are distinct
from these local checks. Do not enable or describe this release as worldwide.
