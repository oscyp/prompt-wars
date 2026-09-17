# UX and game-integrity implementation record

Implementation of the [approved plan](plans/2026-09-13-ux-game-integrity.md), following the [13 September audit](audits/2026-09-13/UX_UI_AUDIT.md). Branch: `codex/ux-game-integrity`; starting commit: `5e0e6ce`. Changes remain uncommitted. The backend was subsequently deployed on 14 September; see the [deployment record](deployments/2026-09-14-ux-game-integrity.md) for current mobile delivery, reviewer calibration and feature-gate status. The sections below retain the original implementation evidence.

## Delivered scope

| Plan | Implementation |
|---|---|
| A — Layout and writing | Bounded scrolling sheets with fixed actions, safe areas, contrast-aware primary ink and scalable labels. One move/prompt workspace, keyboard-aware bounded editor, account/battle/round drafts with serialized save/delete, failed-submit retention and explicit unsaved/retry state. Hold-to-submit and accessible confirmation retained. |
| B — Navigation and exits | Persistent root stack, four destinations surrounding a raised center Battle action, compatible entry redirects, cold-link fallbacks, action/unseen-result badge. Parking flushes drafts without mutation. Free forfeits retain mode consequences; locked transactions prevent stale timeout/judge/leave writes from replacing a result. |
| C — Combat | Shared versioned round/series rules, approved Strength/Focus/Agility effects and caps, unchanged Stamina HP formula, v1 compatibility, recorded deciding comparisons, Glicko draw behavior and one-time server-owned respec. Truthful free archetype identity descriptions and Character consistency label. |
| D — Judging and appeals | Agreeing-run rubric averages drive the outcome and display; actual call provenance identifies fallback. Mock-assisted ranked outcomes are exhibitions. Durable independent calibrated review reconstructs played rounds, retains timeouts, handles incomplete deciding rounds as no contest, and applies original rating-point corrections once while preserving later rating/RD/volatility. Retry scheduling is separate from model health. Revised results label earlier media and block verdict sharing. |
| E — Timing and pacing | New human rounds receive 24 hours; practice retains two hours and assigned deadlines stay unchanged. Exact localized deadlines, entrance within workspace, compact round result with reachable Continue, direct terminal payoff, Arena wording, achieved quest counts and distinct season states. Existing cinematic style, reading controls and reduced-motion behavior retained. |
| F — First play | Authenticated idempotent bundled starter, ordinary resumable guided Bo3 practice, optional dismissal/replay/customization, contextual notification request and three retained initial portraits. Portrait leases, staged publication and fenced completion recover dead workers without duplicate quota/spend/refund. Account-scoped character gate and pending-request recovery prevent false empty/paid states. |
| G — Wallet and media | Truthful free/paid suggestion descriptions, localized comparable pack value, named-round video purchase, durable checkout identity, SDK account serialization and authoritative fulfillment. Failed/uncertain purchases remain recoverable without checkout repetition. Media signing/transport/caption recovery is independent of generation and charges. Unsupported subscription benefits and legacy exit-price rows removed, including when an older backend still returns a price. |
| H — Secondary and art | Independent Report/Block, separate Shop Preview/Buy/Equip, active battles separate from stable 50-row history, canceled attempts grouped, Stats sample windows, rankings with zero through four players, frozen fighter identity and account/battle/asset caches. Avatar/full-body presentations use the appropriate artwork; starter artwork continues into customization. |

Updated the concept, design language, economy descriptions, environment instructions and [release acceptance matrix](UX_GAME_INTEGRITY_ACCEPTANCE.md). First-party funnel events contain allowlisted event names, owned battle IDs and optional bounded durations; no prompt text or new analytics SDK.

## Preserved work and decisions

- Existing edits in `providers/BattleAudioProvider.tsx` and `__tests__/battleAudioProvider.test.tsx` remain byte-identical to the starting SHA256 baseline. They are user changes, not part of this implementation.
- The feature branch uses the existing checkout to retain its native build/dependencies. File ownership and review snapshots controlled concurrent work; no automatic staging or commits.
- Explicitly retained paid ranked suggestions supersede older repository prose. Payment metadata does not enter judging; paid archetypes/stat advantages were not introduced.
- Restored the intended 18+ signup check lost by the August draft-allowance trigger replacement, retaining that replacement's generated usernames, display normalization and welcome-credit behavior.
- Additive migrations preserve legacy rules/deadlines. `COMBAT_V2_ENABLED` and `APPEALS_ENABLED` default off; rollback stops new activation without rewriting active battles or reversing migrations.

## Verification

Baseline: 102 Jest suites / 939 tests and app TypeScript passed.

Final client aggregate, after the last Wallet correction: **130 Jest suites / 1,061 tests passed**, app TypeScript passed, and standard `yarn lint` passed with zero errors and one existing guarded Reanimated `require` warning. Existing asynchronous Icon/RevealSequence `act` warnings remain in older suites and are not hidden. `git diff --check` and both protected audio-file hashes passed.

The 14 September customization follow-up passed **130 Jest suites / 1,069 tests**, app TypeScript and standard lint (the same existing warning). It makes option cards and prices readable at large text sizes, uses ordinary scrolling when the expanded fighter would obstruct editing, and removes the remaining misleading archetype copy. Default-size and accessibility-extra-large simulator evidence is linked in the deployment record.

The subsequent user-requested navigation adjustment restores the raised Battle button between Battles and Rankings. It opens the mode sheet while retaining the four actual tab destinations and their state. On iOS, opening/closing from Profile returned the same runtime screen hash; default and accessibility-extra-large checks passed for the centered action and its label. Four focused navigation suites / 12 tests, TypeScript and scoped lint passed. [Default preview](audits/2026-09-14-center-battle/profile-center-battle.png), [large-text preview](audits/2026-09-14-center-battle/arena-large-text.png). No mobile upload was attempted for this adjustment.

The user then requested a version bump and explicitly approved TestFlight submission. The signed production build for **1.2.0, iOS build 9** finished successfully; its automatic TestFlight submission is waiting in the EAS queue. The fresh aggregate passes 130 suites / 1,069 tests, TypeScript and lint. The [release record](deployments/2026-09-14-release-1.2.0.md) tracks the verified archive and actual build/submission outcomes; the earlier upload-approval block was resolved before uploading.

Offline Deno: **282 passed, 0 failed, 7 ignored**. All four remote/Auth test files were explicitly excluded, as were two pre-existing placeholder files containing 15 video/webhook tests. Earlier larger runner totals included early-return cases and are not assertion coverage. Changed Edge Function entry points passed their focused Deno type/lint checks.

Database: **101 migrations applied**, excluding only the Supabase scheduler-extension migration, on a disposable PostgreSQL 15.18 instance with TCP disabled. **Five SQL fixtures and eleven concurrent scenarios passed**: three timeout/forfeit/submission orderings with observed lock waits, plus eight duplicate starter/tutorial/respec/portrait/appeal operations behind two-session barriers. Positive/negative fixture ownership and grants, dead-worker recovery, exactly-once refund/correction and later rating retention are covered. [Exact harness, limitations and results](audits/2026-09-13-implementation/database-verification/README.md).

This database used minimal auth/storage/API-role shims. It does not certify GoTrue, PostgREST, Storage signing services, Realtime, cron, deployed Edge Functions or real provider/store calls. No shared or remote database was reset or migrated.

## Native evidence

iPhone 15 Pro simulator, iOS 26.5, existing development build, Metro on localhost only. A LAN listener was rejected by automatic approval review; the approved loopback configuration was used instead.

- Default software-keyboard writing keeps the caret and Lock In reachable. A 184-character draft survived parking, app termination, relaunch and reopening with its editing mode intact.
- Accessibility-extra-large exposed a tall fixed workspace header and lost caret; the corrected scrollable context/bounded editor keeps focused text visible. Mode controls now stack and labels grow. [Final workspace](audits/2026-09-13-implementation/workspace-large-text-final.png), [end-of-text typing evidence](audits/2026-09-13-implementation/workspace-large-caret-after.png).
- Battle history names, mode, outcome and exact deadline wrap at accessibility size. [Final Battles](audits/2026-09-13-implementation/battles-large-text-final.png).
- Report subject no longer breaks inside its heading; body scrolls independently while Cancel/Submit and the separate Block action remain reachable. [Final report sheet](audits/2026-09-13-implementation/report-large-text-final.png). No report/block was submitted.
- Four tabs announce 1–4; Shop Preview/Equip are separate accessibility targets; Profile's contained fighter keeps its face visible; Arena counts achieved quests before claiming; ended seasons have distinct copy.
- On frozen client code, Profile → Wallet → Shop → Back → Back preserves the Profile scroll position (runtime screen hash `17uotdu` before and after); Stats returns to the same position. Settings also preserves its opener's position (`0rbetkq`). [Returned Profile](audits/2026-09-13-implementation/profile-return-scroll-final.png).
- Cold Wallet links show a visible Profile fallback and return there; cold prompt-entry links show a visible Arena fallback. Developer-client server selection precedes URL delivery in this build.
- The final Wallet screen omits the old battle-exit price even though the existing backend still supplies it. [Final pricing](audits/2026-09-13-implementation/wallet-pricing-final.png).
- One unsubmitted practice series was opened solely for draft verification and canceled through the free Cancel battle confirmation. Its active-turn entry disappeared; Wallet remained at 20 credits. No prompt submission, judge call, ranked result, report/block, reward claim or store purchase was committed.
- Customization correctly shows a recoverable load error against the older backend, which lacks `characters.starter_asset_key`. Its updated sheet components pass automated checks and review, but their final native walkthrough requires the additive schema deployed to staging. The error was dismissed without saving or generating artwork.

## Review and cleanup

All reported Important implementation findings were fixed and reviewed, including account-scoped route gating, purchase fulfillment handoff, portrait lease recovery, timeout/forfeit races, appeal provenance and fair retry scheduling. The last Wallet compatibility fix received an independent approval. Detailed reports and before/after review diffs are retained in `.superpowers/sdd/2026-09-13-ux-game-integrity/`.

Temporary PostgreSQL and Metro processes are stopped. The test app is stopped, the simulator is returned to its original shutdown state, and its default text size is restored. The developer-menu overlay was suppressed only through a temporary launch argument; no persistent preference was changed.

## Release gates

The code is reviewable locally; production release remains gated by the [acceptance matrix](UX_GAME_INTEGRITY_ACCEPTANCE.md). Android/small-phone, VoiceOver/TalkBack, the full reduced-motion/localized-price matrix, real StoreKit/Play delayed-webhook recovery, real Supabase services, and calibrated independent-model staging were not completed in this environment. Docker could not launch and no Android SDK/emulator was available. The temporary database supplied genuine SQL/concurrency evidence without replacing those service/native checks.

Deploy compatible schema/backend to controlled staging first, verify service/ownership and end-to-end recovery, ship the compatible client with gates off, then enable v2 matchmaking and independent appeals separately after their checks. No historical rejudging, old exit-fee refunds, new Daily Challenge, subscription repricing or automatic enqueueing was added.
