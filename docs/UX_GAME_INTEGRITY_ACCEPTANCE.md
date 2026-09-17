# UX and game-integrity release acceptance

The [approved plan](plans/2026-09-13-ux-game-integrity.md) and [audit evidence](audits/2026-09-13/UX_UI_AUDIT.md) define this release. This document is a release gate, not a claim that every environment has passed.

Current deployment and verification status is recorded in the [14 September deployment log](deployments/2026-09-14-ux-game-integrity.md). Its backend and customization checks supersede the historical missing-schema finding below; remaining native/store/service gates still apply.

## Automated checks

Run app tests with Jest and Edge Function tests with Deno. Remote tests remain explicitly opt-in. Use staging test accounts and provider mocks for mutation tests; never reset a shared database.

| Area | Required evidence |
|---|---|
| Drafts | Restore by account/battle/round after remount; move selection retains custom text; ordered writes cannot resurrect discarded/submitted drafts; failure keeps text; account switch cannot expose prior text; unsaved warning on storage error |
| Navigation | Profile → Wallet → Shop → Back → Back preserves Profile and scroll; Settings/Stats/editor round trips; cold profile/battle fallback; Android Back parks safely; four destinations surrounding the center Battle action; opening/closing the mode sheet keeps the selected tab |
| Accessibility | Essential choices/actions reachable in bounded sheets; dark primary ink; visible caret with keyboard; hold-to-submit screen-reader confirmation; no disabled text scaling |
| Judge | Agreeing gaps 1 and 7 resolve using mean gap 4, same rubric drives UI and damage; disagreement third-call policy; actual per-call model/seed/prompt version/fallback persisted; mock-assisted ranked series changes no competitive records |
| Combat | All stat extremes and caps, one-round KO/two wins/exhaustion, 1–0 with draws, 0–0, 1–1; remaining HP percentage not raw HP; score tiebreak; true draw; v1/single compatibility |
| Timing/exits | Human rounds 24h, bot 2h, assigned deadline preserved; zero-credit park/forfeit; simultaneous forfeit/resolve cannot overwrite terminal result; notifications retain quiet hours/caps |
| Appeals | Two- and three-round replay, incomplete replay→no contest, changed decisive round, provider unavailable/error, duplicate/concurrent submission/worker/correction; reverse points after subsequent match without overwriting later rating/RD/volatility; correct records/streaks and no repeated reward |
| Starter | Concurrent/repeated starter returns same fighter, no generation, ordinary tutorial scoring, resume/dismiss/replay; three deferred portrait renders with concurrent/retry limits; free respec once, exact current point total, immutable active snapshot |
| Purchases/media | SDK reference persists after timeout/restart, ledger confirmation, failed history distinct, Check again reads only; final-round purchase ID; signing failure/expiry retry without job/spend; captions fail independently; moderation stays closed |
| Secondary | Active query unaffected by history limit, stable 50-row pages with equal timestamps, canceled queues grouped, Stats sample labeled, rankings 0–4, independent block without report, sibling Shop controls |
| Identity | Same snapshot across workspace/wait/result/video; refresh expired signatures without replacing known fighter; avatar circles/body containment keeps face/item |
| Ownership | Every new table has RLS and minimum grants; authenticated owner can read own status; nonparticipant cannot read sensitive battle assets; clients cannot mutate outcomes/allowances/corrections; internal RPCs restricted; retries never duplicate money/grants |

## Native walkthrough

Repeat on iOS and Android with default and accessibility text sizes, at least one small phone, software keyboard, VoiceOver/TalkBack, Reduce Motion, long names, and localized store prices.

1. Sign in on a staging account. Choose Play practice, reach the first prompt without generating a portrait, dismiss/resume tutorial, and later find replay/customization.
2. Enter custom text, place the caret at the final line, change move, background/restart, and park/reopen. Confirm exact text and selection; inject storage/submission failures and verify warning/recovery.
3. Open mode, report, purchase and confirmation sheets. At maximum test text size, scroll every option and activate/cancel with screen reader. Verify focus enters and returns correctly.
4. Play a staged Bo3. Read exact deadlines/AI label, check outcome and HP against fixtures. Continue must remain reachable without scrolling past a cinematic. Finish through direct series payoff; Battle Again and Arena remain reachable.
5. Open Profile utilities, go back through two levels, and test supported cold links. Confirm tab selection and scroll state persist.
6. With zero credits, park every active phase and forfeit permitted phases. During judging, park; do not replace the resolved outcome.
7. Delay a staging purchase webhook beyond polling. Relaunch and Check again. Confirm one purchase reference, one grant, and updated balance. Inject ledger failure and media-signing failure. Recovery must not charge again.
8. Appeal staged 2–0 and 2–1 series, including no-contest reconstruction and a later rated match. Reopen during processing/retry/final. Verify corrected result card and old-cinematic labeling/share restrictions.
9. Scroll past 50 finished battles while another active turn is older. Check separate canceled attempts, all ranking populations 0–4, Report/Block independently and accessible Shop controls.
10. Compare fighter face/signature item across Profile, workspace, waiting, round/final payoff, and cinematic composition. Expire its URL and recover the same asset.

## Rollout

1. Review additive schema/RLS/internal RPC grants and deploy compatible backend to staging first. No database resets or historical rewrites.
2. Run focused and aggregate checks, database fixtures, and the native matrix. Record exact environment/build/test outputs in the implementation report.
3. Ship the compatible client while new combat and appeals remain off. Existing battles use stored rules, snapshots and deadlines.
4. Enable version 2 only after new-client matching rejection and old-battle resumption are tested.
5. Enable independent appeals only after its configured model/prompt calibration and atomic correction tests pass. A provider configuration flag alone is not evidence of calibration.
6. Compare first-prompt timing, tutorial completion, result-to-next-battle behavior, recovery failures and judge/appeal errors to the pre-release baseline. Use existing operational records and minimal first-party funnel events; never include authored prompt text or add an analytics SDK.

Rollback disables new-rule matchmaking or new appeals. It never rewrites active battles or reverses migrations. A fallback-ranked exhibition still completes the free result.

## Environment findings at implementation start

- Baseline on 13 September 2026: 102 Jest suites / 939 tests passed; app TypeScript check passed.
- Docker could not launch and no system PostgreSQL was available at the start. An isolated temporary PostgreSQL 15.18 runtime subsequently applied 101 migrations (scheduler excluded), passed five SQL fixtures and eleven concurrent scenarios. See [database evidence](audits/2026-09-13-implementation/database-verification/README.md). Real Supabase services and staging integration remain release gates.
- Android SDK/emulator binaries were not found in the standard installation paths. Android native checks remain required before release.
- An existing iOS development build and simulator are available; no real store transaction, paid model calibration or production deployment is implied by local checks.
- Final local client verification passed 130 Jest suites / 1,061 tests, TypeScript and lint (one existing warning). The asserted offline Deno suite passed 282 tests with seven ignored; remote and placeholder cases are excluded from that count.
- iOS draft restoration, large-text keyboard reachability, report actions, stable tab round trips, cold fallbacks, free practice cancellation and legacy-price filtering were checked. The remaining customization walkthrough needs staging schema support; the currently deployed backend lacks `characters.starter_asset_key`. Complete the full native matrix after that deployment.


## Visual migration 1.3.0

The collectible presentation must preserve every integrity/recovery acceptance criterion above. See [VISUAL_MIGRATION_ACCEPTANCE.md](VISUAL_MIGRATION_ACCEPTANCE.md) for all 21 screens, overlays, typography, frame geometry, native checks and distribution gate. This client release adds one licensed display-font family with system fallback; it does not change server mechanics, paid ranked assistance policy, pricing or rollout flags.
