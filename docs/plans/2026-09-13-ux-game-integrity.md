# Prompt Wars UX/UI and Game Integrity Improvement Plan

Approved for implementation on 13 September 2026. Source: the user's complete A–H remediation plan, following `docs/audits/2026-09-13/UX_UI_AUDIT.md` and its technical appendix.

## Global constraints

Keep cinematic arena art and four stats. Keep paid ranked idea rerolls with explicit pricing and no score guarantee. Payment data never feeds judging; archetypes remain free. Parking and permitted forfeits are free. Human rounds receive 24 hours; practice keeps two hours. Starter fighter plus guided practice is primary onboarding, customization optional. Inconclusive appeals become no contest and reverse original rating-point contributions once.

Preserve server authority, anti-abuse, RLS, derived entitlements, authenticated function helpers, both single/Bo3 formats, free Tier 0 completion independent of videos, pre/post moderation, automatic failure refunds, and all existing audio-provider edits. Additive migrations only. No database reset, bulk historical rejudging, old-exit-fee refunds, daily challenge, subscription repricing, new analytics SDK, prompt text telemetry, automatic next-battle enqueue, wholesale art regeneration, or new fonts.

## A. Layout and battle writing

Shared safe screen/action footer/bounded scrolling sheet with reachable actions and accessibility focus. Apply to mode/report/purchase overlays. Dark ink on lavender; normal/large text contrast 4.5/3; flexible label/value rows and full-width credit packs; preserve Dynamic Type, minimum 44pt iOS/48dp Android targets.

One move/prompt workspace. Switching move retains editor. Collapse fighter HUD with keyboard; one keyboard inset owner and visible caret. Versioned local draft scoped to account/battle/round includes text/move/edit mode/selected suggestion. Serialize writes, flush before navigation/background. Preserve failed submissions. Clear only authoritative success, explicit discard, or confirmed uneditable round. Display storage failure. Retain hold and screen-reader confirmation; distinguish loading/unavailable/ready.

## B. Navigation and exits

Persistent root Stack, tabs and secondary stacks. Four tabs Arena/Battles/Rankings/Profile; labeled Battle action above bar. Preserve tab navigation/scroll state; legacy routes redirect; cold Profile fallback Profile, battle fallback Arena. Badge actionable rounds/unseen results only.

Return to Arena saves draft and never mutates battle. Separate free Forfeit series: ranked human loss, casual/practice cancel, unmatched cancel. Remove fee/top-up branches. During resolution park safely; no race overwriting completed outcome; forfeit available again if another round opens.

## C. Shared versioned combat

New v2 battles; existing recorded v1 unchanged. Shared server module normal and appeals. Strength scoring .005 per difference plus existing damage; Stamina max HP 60+8*s (68–140); Agility incoming damage reduction .02*max(defender-attacker,0), max .18; Focus scoring .0025 per difference; combined Strength/Focus cap ±.05. Existing base damage then evasion, round once, bound 8–60; preserve move modifiers, draw threshold, KO conditions.

20-point start, stats 1–10. Existing players one free v2 respec preserving current total; active snapshots immutable. Series KO or two wins; exhaustion round wins then remaining HP percentage then cumulative final score then draw. Play round three when needed including draws. Normal eligible Glicko-2 draws. Persist deciding rule/comparison values. Truthful stat/archetype copy, no unimplemented bonuses or speed tiebreak. Display Character consistency with wire key archetype_fit.

## D. Judging and appeals

Average corresponding normalized rubrics from agreeing runs; same aggregate drives outcome/display/damage. Existing third-run disagreement policy with aggregation path. Per-call actual model ID/prompt version/seed/score/fallback, not wrapper ID. Any mock-assisted ranked series becomes unrated exhibition, no competitive rating/win/streak rewards, participation retained.

Durable idempotent appeals, one/day. Independently configured calibrated model different from all original models. Review each played round with frozen prompts/moves/stats/rules. Sequential reconstruction; upheld/overturned winner or no contest if an unplayed deciding round is needed. Atomically reverse original rating-point deltas once in unique appeal/player correction ledger, preserve later changes and current RD/volatility, no replacement winner rating. Reconcile outcome records/streaks, preserve credits/cosmetics, no duplicate win rewards.

Persist pending/processing/retryable failure/upheld/overturned/no contest across restart. Keep original resolution and adjudication revision. Refresh cards, label older cinematic as preceding revised result and prevent sharing as current verdict. Independent reviewer unavailable/unconfigured disables submission without consuming allowance.

## E. Timing and pacing

New human ranked/casual/friend rounds 24h from server opening; practice 2h with instant bot. Preserve assigned deadlines/quiet hours/caps. Exact localized deadline on workspace/wait/round result/action rows. Face-off entrance integrated into workspace without mandatory Continue. Compact outcome/score/HP/reason round result with sticky Continue, expandable details. Terminal round routes directly final payoff; Battle Again/Arena sticky while optional media scrolls. Preserve skip/replay/reduced motion/captions/reading pace.

Enter the Arena hero, theme after match, no daily promises. Consistent AI opponent/Practice label. Concise explanation from authoritative score/modifier values, raw judge text in details. Achieved quest count independent of claims. Distinct upcoming/ended/empty active season.

## F. Starter and tutorial

Retain auth/age/anti-abuse. Play practice primary, Customize first alternative. Authenticated idempotent server-finalized starter with balanced stats/free archetype/bundled art/safe identity, no generation. One resumable guided Bo3 practice, contextual theme/move/write/lock/result hints, dismiss/replay, ordinary scoring. Preserve three free initial portrait renders when deferred; server consumption prevents repeated grants. Invite customize after first payoff. Notification permission at first async wait. Distinct unresolved/error/confirmed-empty character states, Retry, never route existing player to creation due to error.

## G. Wallet, assistance, media

Current free idea allowance and paid ranked rerolls; show free allowance/next set cost/no score guarantee; same provider/quality/moderation. Remove unsupported Priority queue/Full video history. Best value from comparable localized unit prices or omit. Purchase cinematic for named round (final default) passing round ID. Wallet refresh focus/foreground/purchase/shop return. Persist purchase reference pending after polling timeout: Still processing/Check again, never repurchase. Ledger failure distinct from empty.

Separate generation and playable asset state; signing retry foreground/connectivity/manual without job/spend. Caption failure independent, moderation/refunds unchanged.

## H. Secondary and art

Independent Report/Block on opponent/rankings/rivals/supported shared video using existing API. Shop nonactionable container with separate Preview/Buy/Equip/earn alternatives. Active list separate, stable 50-row finished cursor pages, canceled/unmatched separately. Stats/Best prompts label actual sample window. Leaderboard 0–4 correct. Snapshot per-battle fighter identity/art references and reuse all screens/video; cache account/battle/asset, refresh URLs not identity. Avatar circular, contained body preserving face/item. Keep styles/dark/move palette; consistent type/icons/scrims/spacing and restrained words-to-action motion.

## Contracts and rollout

Optional legacy-compatible battle rules version/resolution metadata/identity snapshots/adjudication revision; judge per-call provenance/aggregate/damage; durable appeal/correction records; authenticated starter/tutorial/respec with ownership and limits; local-only drafts; history items/nextCursor while retaining sampled Stats helper; media expiry/purchase reference. Matchmaking client-contract version: unsupported update-required for new v2 matches, old battles accessible. Update concept/design/economy/ENV/acceptance.

Deploy additive backward-compatible backend, stage fixtures/focused Jest+Deno/lint/type checks; ship client with rules off; enable v2 after compatibility checks; appeals only after independent model calibration/correction checks. Compare first prompt/tutorial/next battle/recovery/adjudication funnel against baseline using minimal first-party events without UGC. Rollback gates new matches/appeals, not active rules or migrations.

## Verification

Jest: drafts restore/discard/failed submit, navigation round trips/cold links, tutorial resumption, pending purchase/media retry, quests, pagination, rankings 0–4. Deno: aggregation/disagreement/fallback provenance, all stat caps, series KO/exhaustion/draw, deadlines, free forfeit races, starter/respec idempotency, Bo3 2/3 round appeals. Replace placeholder appeal tests with real shared logic and DB effects; concurrency/duplicate correction after later matches, incomplete series, provider failure, legacy single; positive/negative RLS and no duplicate charges/grants/refunds/corrections.

Native iOS and Android, small phone, default/accessibility text, keyboard, VoiceOver/TalkBack, reduced motion, long identity/localized prices. Acceptance: no lost supported drafts, visible caret/modal actions, Back preserves opener/tab, next play action above optional media, coherent score/HP/review, zero-credit exits, paid/media retry without recharge, consistent fighter.
