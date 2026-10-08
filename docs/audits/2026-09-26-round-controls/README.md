# Loading, round results and Claim controls

Implemented the approved four-state refinement in the existing working tree. Validation completed 27 September 2026. [Comparison gallery](comparison.html) · [Capture provenance](captures.json) · [Automated results](verification.json).

| Area | Change | Evidence |
| --- | --- | --- |
| Startup | Optional inline GameFeedback; full-size heading wraps beside the decorative Arena icon. Stacked defaults and auth gate retained. | Both native phone sizes/default and accessibility text; busy heading and hidden-icon test. |
| Between rounds | Permanently visible score, HP/damage, deadline, modifiers, rubric and judge cards; optional reveal follows. One outcome/series frame and pinned Continue. | Real route rendered in Jest for both perspectives, bots, missing/zero totals, terminal routing and parking; native component fixtures. |
| Cinematic | Ready, pending, slow and recovery content use one restrained gold panel. Existing retry/player lifecycle unchanged. | Actual ready video; native status/error fixtures; media lifecycle and zero-generation/zero-purchase retry tests. |
| Claim | Shared lavender beveled button, diamond and signed reward; separate accessibility target, busy disabling and responsive wrapping. | Native default/large-text fixtures; busy/retry/claimed tests and ordinary purchase-format regression. |

Available authoritative round totals display at most three decimals without trailing zeroes. Missing totals are omitted rather than replaced by zero. The final result's Result info sheet and data loading remain unchanged.

## Automated verification

- **TypeScript:** `yarn tsc --noEmit` passed.
- **ESLint:** `yarn lint` passed: zero errors, one existing require-import warning at `app/_layout.tsx:29`. Explicit lint of the new fixture and touched tests passed.
- **Jest:** **198 suites / 1,613 tests passed** with `yarn test --runInBand`, including existing draft, navigation, purchase, media, tutorial, history, avatar and appeal coverage.
- **Fixture isolation:** `node scripts/visual-fixtures-check.cjs` passed. Fixtures use the development-only root, dummy loopback backend and local-only actions.
- **Fresh scoped review:** no actionable regressions against the pre-task working-tree baseline.

An initial full run hit an unrelated editor hydration timeout; its 23 tests passed independently and the complete suite subsequently passed. A new accessibility test initially searched for the deliberately hidden icon with a visible query; it now explicitly verifies that the icon is hidden. The final totals above are from the complete post-fix run. Editor production code was not changed for that timeout.

## Native evidence and remaining acceptance

The gallery contains **22 new native captures: three actual routes and nineteen component fixtures**, plus the four user references. Both **375×812** and **402×874** iPhones are represented at default (`large`) and `accessibility-large` text. Optimized JPEG pixels differ from the labelled simulator dimensions in points.

Actual captures show Arena on both phones and an existing approved, already-generated cinematic on the small phone. The real account had no claimable quest. Active practice entries were expired writing rounds, so no ready between-round state was available without playing or changing a battle. Startup is transient. Those states and media errors therefore use explicitly labelled native component fixtures, not actual game-route acceptance.

The score, Claim and recovery controls wrap at accessibility size. Round component scrolling reaches modifier/rubric/judge cards while Continue remains pinned. The fixture Continue returns to its local index; actual Continue, parking and terminal routing are covered by the route tests. No Claim, purchase or generation control was pressed during native validation. Both simulators were restored to default text size and the ordinary app.

**Unverified:** actual between-round and claimable-quest integration on device, and live VoiceOver traversal. Rare media states use fixture evidence; lifecycle/retries are covered automatically. **Android remains blocked** until an environment is available. Native acceptance is partial, not a distribution approval.

An inherited rubric limitation remains outside this refinement: RubricBars treats absent individual rubric fields as zero, and an opponent-only rubric stays hidden. The new Round score panel correctly omits missing totals. This was noted during review, not introduced by the change.

No backend, schema, dependency, version, production build, rollout flag or store submission change was made. Unrelated working-tree changes remain intact.
