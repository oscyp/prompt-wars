# Technical evidence appendix

This appendix retains the two domain source reviews. The [main audit](./UX_UI_AUDIT.md) is the authoritative synthesis: it incorporates the native checks and prioritizes player impact. The domain reviews alone did not interact with the app or backend.

Root review cross-checked the scoring average, stat formula, series tiebreak, appeal prompt count, fallback model ID, paid-exit gate, onboarding sequence, navigation structure, and offer metadata. Proposed acceptance tests below were not executed as automated tests.

Additional native findings are documented in [session notes](./SESSION_NOTES.md) and the [screen gallery](./SCREEN_GALLERY.html):
- Prompt draft loss; keyboard focus outside the viewport.
- Report and battle-mode sheet overflow at accessibility-extra-large.
- Profile subpage Back returning to Arena and losing tab context.
- Wallet pack text/badge collisions at default size; Standard labeled Best value despite a worse unit price than larger packs. Metadata: utils/revenuecat.ts:118.
- Profile face crop; inconsistent fighter imagery across battle surfaces.
- Deep result action placement; waiting content overlapping the status region.
- Quests with claimable rewards but zero complete in the header (app/(tabs)/home.tsx:402, components/QuestRow.tsx:61).

The 68-HP example below uses the supported minimum stamina allocation (60 + 8 × 1). It is a deduction from the formula, not a replayed match.

## Mechanics and battle UX

Read-only source audit, 2026-09-13. Scope: battle lifecycle, competitive trust, timing, prompt authoring, results and video economy. Sources are the current checkout and concept; no remote records changed, no app/simulator interaction by this auditor, no production incidence or retention claims. Root auditor separately reproduced the daily-theme mismatch in the local iPhone build. No implementation changes or tests run. Numerical examples below are deductions from the checked-in formulas.

### Highest-value findings

#### 1. P1 — Character allocation teaches a stat that does nothing, and misstates another

Evidence: `/Users/patdom/sources/prompt-wars/utils/statAllocation.ts:59` says Agility affects initiative/tiebreaks and `:64` says Focus reduces variance. `/Users/patdom/sources/prompt-wars/supabase/functions/round-resolve/index.ts:83` only uses Strength and Focus in a deterministic modifier; Agility is merely parsed at `:127`. The series tiebreak in `/Users/patdom/sources/prompt-wars/supabase/functions/battle-advance/index.ts:343` uses HP then cumulative score, never Agility. The formula divides Strength delta by 20 and Focus delta by 40: a one-point Strength lead already grants +5% and gives the opponent −5%, hitting the cap; comments at `round-resolve/index.ts:80` incorrectly say 0.5%/0.25%.

Player impact: the finite 20-point allocation has a trap choice, notably the Trickster preset with 8 Agility; players cannot learn the actual system from the offered explanations. Recommendation: decide and implement meaningful, bounded roles for every stat, or remove/reallocate ineffective stats; make actual numerical effects and copy agree. Acceptance: table-driven equal/asymmetric allocations demonstrate every advertised effect, caps, ties and no wasted category; existing characters receive an equitable migration/respec if the rules change.

#### 2. P1 — Judge outages can change ranked outcomes with a word-count mock and be logged as the primary model

Evidence: `/Users/patdom/sources/prompt-wars/supabase/functions/_shared/providers.ts:195` falls back to scores built from word count and common seeded terms (`:215–227`). `FallbackJudgeProvider.getModelId()` returns the primary model at `:852`, even when `judge()` falls back at `:864`. `/Users/patdom/sources/prompt-wars/supabase/functions/round-resolve/index.ts:444` and `:494` persist that primary ID. The ranked rating gate in `/Users/patdom/sources/prompt-wars/supabase/functions/battle-advance/index.ts:215` has no degraded-judge condition.

Player impact: a provider failure changes what “better prompt” means, while outcome attribution can conceal the fallback. Recommendation: keep Tier 0 available but make degraded outcomes explicitly provisional/rating-neutral or queue valid adjudication; propagate actual per-call model, fallback flag, version and seed. Acceptance: simulated primary failure completes the UX, produces truthful audit metadata, never applies normal ranked changes from mock scores, and explains review/finality to both players. Production provider configuration/outage frequency was not inspected.

#### 3. P1 — The advertised appeal cannot process ordinary completed Bo3 battles

Evidence: `/Users/patdom/sources/prompt-wars/app/(battle)/result.tsx:310` promises independent review and sets local “submitted” at `:324`. `/Users/patdom/sources/prompt-wars/supabase/functions/resolve-appeal/index.ts:149` loads all locked prompts for the battle, then throws unless `prompts.length === 2` at `:156`. Ordinary completed Bo3 has four or six locked prompts. The processor also uses the same `createJudgeProvider()` at `:194`, with no separate appeal model selection. The result screen stores submitted state locally rather than reading persisted appeal status (`result.tsx:118`).

Player impact: the explicit trust/recovery action can remain pending rather than review the played series; reopening the result loses the visible status. Recommendation: support round-aware series appeals or temporarily withhold the promise until supported; expose durable queued/reviewed/upheld/overturned states and actual model policy. Acceptance: 2–0 and 2–1 human series process correctly, original snapshots and rounds are retained, cap use is idempotent, retry/reopen shows the same status, and ratings/results reconcile once.

#### 4. P1 — The agreeing second judge pass is discarded from live Bo3 totals

Evidence: `/Users/patdom/sources/prompt-wars/supabase/functions/_shared/judge.ts:356` computes averages from two runs but returns run-one normalized rubric values at `:365`. `/Users/patdom/sources/prompt-wars/supabase/functions/round-resolve/index.ts:377` rebuilds base totals from those values and determines the round at `:398`, ignoring the pipeline's averaged verdict. Example: with neutral moves/stats, run-one gap 1 and run-two gap 7 both favor P1; the pipeline average gap is 4 (win), but the live Bo3 round gap is 1 (draw).

Player impact: the promised multiple-pass stability does not hold, and first-pass variance controls scoring, HP and later series results. Recommendation: return and persist the actual averaged rubric/final totals used for the decision, with coherent judge notes and per-run audit data. Acceptance: the example yields the intended average-based result; agreeing, disagreeing, tie-band, modifier and legacy-single cases use one authoritative explanation/number set.

#### 5. P1 — Leaving a committed series is a credit toll, and back can become a purchase obstacle

Evidence: `/Users/patdom/sources/prompt-wars/supabase/migrations/20260828124000_fix_claim_leave_battle_records.sql:97` checks any previously locked prompt across the series, then blocks leaving when credits are insufficient at `:127`. `/Users/patdom/sources/prompt-wars/hooks/useLeaveBattle.ts:102` offers “Top up.” `/Users/patdom/sources/prompt-wars/app/(battle)/round-result.tsx:251` and `/Users/patdom/sources/prompt-wars/app/(battle)/move-select.tsx:123` treat back as abandonment; only waiting has an explicit safe return to Arena (`waiting.tsx:675`). Paid copy in `/Users/patdom/sources/prompt-wars/utils/battles.ts:185` says the opponent takes the series/streak resets even for bot/casual, while the server cancels those modes at the migration's `:155`.

Player impact: an async game penalizes leaving the screen inconsistently, and a cash-poor player cannot explicitly forfeit; copy can also misstate the stakes. Recommendation: make “Return to Arena / continue later” available throughout the live flow and make forfeiting free with the normal gameplay consequences; restrict paid convenience to optional positive value. Acceptance: zero-credit players can park or forfeit from every active screen without opening the wallet; drafts survive parking; ranked/bot/casual consequences and terminal-state dialogs accurately match the server. This is an intentional implementation requiring a product decision, not an accidental missing handler.

#### 6. P2 — The app invites async waiting but starts later-round clocks behind suppressed notifications

Evidence: `/Users/patdom/sources/prompt-wars/supabase/functions/battle-advance/index.ts:123` opens the next round with a 120-minute deadline immediately after resolution, then requests a push at `:154`. `/Users/patdom/sources/prompt-wars/supabase/functions/_shared/push.ts:67` honors a policy gate; `/Users/patdom/sources/prompt-wars/supabase/migrations/20260708121000_quiet_hours_enforcement.sql:47` suppresses non-result categories during quiet hours and `:72` enforces the two-per-day cap. `/Users/patdom/sources/prompt-wars/supabase/migrations/20260822171000_round_start_notifications.sql:25` explicitly keeps round-start under those gates.

Player impact: after following “Return to Arena,” a player can lose a fresh round while its only out-of-app warning is suppressed, including overnight. Recommendation: design an explicit async turn window/ready policy compatible with quiet hours and the notification cap; show the round schedule and exact local deadline before committing and on the round result. Do not simply bypass the user's notification preferences. Acceptance: quiet hours, cap exhaustion, denied permissions and timezone/background tests still provide the agreed fair response window; notifications and UI tell the same timing story.

#### 7. P2 — “Change move” destroys the authored prompt

Evidence: `/Users/patdom/sources/prompt-wars/app/(battle)/prompt-entry.tsx:161` holds text only in local component state. “Change” executes `router.back()` at `:966`; returning forward creates a new prompt-entry route in `/Users/patdom/sources/prompt-wars/app/(battle)/move-select.tsx:273`. No draft persistence exists in prompt-entry (the only `setCustomText` paths are typing and choosing a suggestion).

Player impact: a reversible strategic choice erases the player's most valuable input; app termination before lock-in similarly loses it. Recommendation: preserve drafts by account/battle/round, including selected move and authored/suggestion origin; switching move should carry the draft with an opportunity to revise it. Acceptance: type a custom prompt, change move, return, background/relaunch and resume—the exact draft remains; successful lock-in and explicit discard clear only that round's draft.

#### 8. P2 — HP tiebreak can award the match to a player with fewer round wins, without explaining why

Evidence: `/Users/patdom/sources/prompt-wars/supabase/functions/battle-advance/index.ts:107` sends every three-round series without two wins to `resolveAllDrawTiebreaker`; `:353` compares raw remaining HP before cumulative score. Thus a player with 68 initial HP who wins one round and draws two can lose to a 140-HP player left at 119 after taking 21 damage. All three draws with different starting stamina likewise favor the higher initial HP. `/Users/patdom/sources/prompt-wars/utils/revealBeats.ts:87` supplies an explanatory subline only for KO; `battle-advance/index.ts:251` persists no deciding-rule field.

Player impact: a “Victory 0–1” / “Defeat 1–0” or “Defeat 0–0” can look broken and makes the round-score UI a poor model of the rules. Recommendation: first decide whether a greater round-win count should win at exhaustion; apply HP only to actual tied standings, and choose intentionally between raw HP, percentage or damage taken. Persist and display the deciding rule with both relevant values. Acceptance: cover 1–0 plus draws, 0–0, 1–1, unequal starting HP, exact scores and KO; final verdict, scoreboard and explanation all agree.

#### 9. P2 — The “Today’s theme” hero launches a different random constraint

Evidence: `/Users/patdom/sources/prompt-wars/app/(tabs)/home.tsx:547` opens the general battle-mode sheet from a hero labeled “TODAY’S THEME” / “Battle now” at `:569–579`. Missing daily data is shown as “Open Arena” at `:571`. `/Users/patdom/sources/prompt-wars/constants/BattleModes.ts:11` offers only ranked/unranked/bot. `/Users/patdom/sources/prompt-wars/supabase/functions/matchmaking/index.ts:74` chooses a random theme; bot uses it at `:376`, human pairing at `:570`. Root auditor observed Open Arena on home → The calm before the storm in the actual bot match.

Player impact: the main call to action makes a thematic/daily promise it does not carry through, weakening comprehension of both theme constraints and daily play. Recommendation: provide a real dated daily-challenge path whose server-owned constraint matches the hero, or relabel the hero as general Arena entry with “theme revealed after matching.” Acceptance: the daily path uses the advertised UTC-date/theme and leaderboard rules, while general matchmaking clearly previews its reveal behavior; missing data is an intentional empty state.

#### 10. P2 — A finished cinematic can remain “Finishing up…” forever after one signing failure

Evidence: `/Users/patdom/sources/prompt-wars/app/(battle)/result.tsx:198` runs video lookup/signing only when battle ID/job ID/job status changes. It silently returns on lookup failure at `:218`, catches signing errors as “Captions are nice-to-have” at `:241`, and depends only on unchanged identifiers/status at `:249`. `/Users/patdom/sources/prompt-wars/utils/resultView.ts:246` renders succeeded-without-URL as “Finishing up…” and does not offer generation retry for an existing successful job (`:219`).

Player impact: a free or paid successful job appears permanently unfinished after a transient network/signing error; foreground refetching the same job does not rerun URL loading. Recommendation: separate playable-media loading from captions, distinguish moderation/pending/unavailable states, and support retry and signed-URL refresh without spending again. Acceptance: fail the first signing request, restore connectivity or tap retry, and play the same approved asset; no new generation/charge; the result remains usable throughout.

### Existing strengths worth preserving

- Server-owned scoring, snapshot stats, capped modifiers and explicit exclusion of monetization fields from judging: `supabase/functions/round-resolve/index.ts:299`.
- Free Tier 0 reveal explicitly does not wait for video: `app/(battle)/result.tsx:534`; results include author prompts, rubric comparison, move modifiers, damage and judge notes in `app/(battle)/round-result.tsx:482`.
- Distinct queue/opponent/judge waiting copy, live opponent deadline, bot fallback disclosure: `utils/prebattleCopy.ts:83`, `:133`, `:178`; `app/(battle)/waiting.tsx:438`.
- Deliberate irreversible lock-in, screen-reader confirmation alternative, trimmed character limits and visible length coaching: `app/(battle)/prompt-entry.tsx:698`; `utils/promptCoach.ts:57`.
- Video upgrades preview server entitlements/cost before confirmation: `app/(battle)/result.tsx:350`; readable allowance/credit copy: `utils/resultView.ts:275`.
- Realtime reconnect and foreground refresh, unique channel per hook instance, with retained single/legacy support: `hooks/useRealtimeBattle.ts:273`, `:287`, `:308`.

### Concept contradictions / product decisions to settle

- Scope still calls Bo3 Phase 2 (`docs/prompt-wars-implementation-concept.md:193`) while §7.7 says every live mode. §7.7 also says round 3 only at 1–1 (`:319`), whereas code also advances 0–0/1–0/0–1. It specifies earlier final lock as a tiebreak (`:320`), but implementation never compares per-player timestamps.
- Auto-enqueued parallel battle is marked unimplemented in §3 yet promised in §4. Current parked waiting provides Arena access, not automatic next opponent.
- Paid prompt rerolls are accepted in ranked: `app/(battle)/prompt-entry.tsx:1311`, `supabase/functions/generate-move-suggestions/index.ts:255`; server fetch does not even load mode at `:98`. Excluding paid flags from the judge does not itself address purchasable access to more candidate competitive answers. Treat as a competitive-integrity design risk: equalize in-ranked idea budgets, move paid generation to noncompetitive use, or explicitly validate and document why access cannot create an advantage. No measured paid advantage is claimed here.
- Character stats copy and implementation conflict as finding 1 details. “Archetype fit” is described to players as fighter alignment (`utils/arenaTips.ts:16`), but the judge receives no actual character/archetype and defines the field as internally consistent voice/persona (`supabase/functions/_shared/providers.ts:652`). Rename or provide safe meaningful context.
- The concept says ranked draws update rating; `battle-advance/index.ts:219` excludes draws from the rating branch. Agree on intended behavior before teaching it.
- Entitlements are round-units (`concept:326`), while the current result purchase reads as a video of “this battle” (`utils/resultView.ts:281`) and defaults to the final round. Clarify which round is purchased, shared eligibility and whether earlier rounds can be upgraded.

### Suggested sequence

1. Repair adjudication, stat truthfulness and appeal processing before expanding ranked play.
2. Remove paid exit friction, preserve drafts, and reconcile round deadlines with async usage.
3. Make the deciding rule, daily mode and video completion/recovery legible.

Recommended additional verification by root/implementation task: mocked provider failure + consistent model audit; multi-round appeal processor cases; round-timing cases with capped pushes/quiet hours; real-device draft round-trip; signing failure retry. These are proposed acceptance tests, not tests performed by this audit.


## Secondary screens

Read-only source review of Battles, Rankings, Profile, Edit character, Stats, Wallet, Shop, Settings and report/block affordances. No simulator/browser session or remote backend inspection in this subtask. Paths below are relative to `/Users/patdom/sources/prompt-wars`; runtime risks are explicitly marked. Actual code takes precedence over historical design reports. User changes in BattleAudioProvider and its test were untouched.

### Priority findings

#### 1. P1 — Subscription advertises benefits this build does not deliver

**Evidence (source-confirmed):** `app/(profile)/wallet.tsx:608–609` sells “Priority queue” and “Full video history”. Matchmaking builds rated/unrated candidates without subscriber entitlement and orders waiting battles by `created_at` (`supabase/functions/matchmaking/index.ts:435–475`, `525–543`). Repository-wide `priority_queue` references only define/expose the entitlement; there is no consumer applying it to matchmaking. Battles loads 50 rows (`app/(tabs)/battles.tsx:66`, `159`; `utils/battleLists.ts:105–112`) with no pagination or distinct full-history destination.

**Player impact:** A real-money decision is based on an unimplemented speed benefit and a history promise the UI cannot fulfill. This undermines the otherwise explicit fairness promise.

**Change:** Limit the offer to demonstrated benefits; make monthly allowance units clear. Only advertise queue/history differentiation once reachable behavior and server enforcement exist.

**Acceptance:** Every visible subscriber benefit has a demonstrable end-to-end difference on two otherwise equivalent accounts. A 51st historical video remains reachable if “full history” stays in the offer. No claim that payment improves competitive outcomes.

#### 2. P2 — Wallet can retain old balances and silently stop waiting for a purchase

**Evidence (source-confirmed lifecycle):** Wallet loads through a mount-only effect at `app/(profile)/wallet.tsx:172–174`. Its Shop link pushes another screen at `511`, but returning does not refetch. Purchase polling stops even when no balance change arrived on its last attempt (`190–200`); attempts end at 10 seconds (`utils/walletView.ts:175`). The ready screen has neither pull-to-refresh nor a refresh action (`wallet.tsx:346–349`). Separately, transaction read failures become `[]` (`utils/monetization.ts:183–185`) and the wallet calls that “No transactions yet” (`wallet.tsx:660–669`).

**Player impact:** After spending in Shop, returning to Wallet can show spending power they no longer have. A delayed webhook can leave a paying player at the old balance with the “Updating” indication gone and no recovery action. A ledger failure resembles a missing purchase history.

**Change:** Refresh authoritative balance/ledger on focus and foreground; keep a distinct pending purchase state after a polling timeout, with Check again and support context. Distinguish failed ledger reads from an empty ledger.

**Acceptance:** Wallet → Shop → spend → Back shows the updated balance. A webhook delayed beyond 10 seconds retains pending feedback, then resolves without reopening the app. Failed ledger reads show Retry, never “No transactions yet”.

#### 3. P2 — Fighter load failure turns into a false “No character yet” state

**Evidence (source-confirmed):** `app/(profile)/edit-character.tsx:305–309` catches an initial read error and ends loading without recording an error state. Null character then renders “No character yet” and “Create your character”, navigating into onboarding (`920–945`).

**Player impact:** An existing fighter appears lost because of a connection failure. The only offered next step is creating a replacement, which conflicts with the player's known progress and can lead to a server conflict.

**Change:** Model loading, failed read, confirmed empty and ready separately. A failure should preserve any previous fighter and offer a Retry in place.

**Acceptance:** A rejected first character fetch shows a retryable load error and no Create CTA; a successful empty response alone offers character creation. Retry recovers the editor without restarting onboarding.

#### 4. P2 — Blocking another player requires filing a misconduct report

**Evidence (source-confirmed navigation):** Only the result screen mounts `ReportBlockSheet` (`app/(battle)/result.tsx:1092–1099`). The sheet always calls `reportContent` and optionally applies a block (`components/ReportBlockSheet.tsx:108–117`); there is no block-only action. The block-list empty state directs players to a battle result's report option (`app/(profile)/blocked.tsx:209–210`). Rankings cards and RivalRow are inert Views (`app/(tabs)/rankings.tsx:89`, `components/profile/RivalRow.tsx:82`). Concept §22 says report/block should be available on battle/profile/shared-video surfaces (`docs/prompt-wars-implementation-concept.md:986`).

**Player impact:** A player who simply wants to avoid someone must accuse them of wrongdoing. Offensive public identity content in rankings/rivals has no local safety action, and a player must locate a completed battle to act.

**Change:** Provide a small player-actions menu with independent Report and Block actions wherever another player's identity is presented. Keep the explicit reason picker for reports; use a neutral confirmation for block alone.

**Acceptance:** Blocking a rival without reporting prevents future matching and produces no report row. Report and Block are reachable via screen reader from a ranking/rival identity and battle context. Unblock remains available in Settings/Profile.

#### 5. P2 — Report sheet has no overflow path at large text or small height

**Evidence (source-confirmed structure; clipping is a runtime risk):** `components/ReportBlockSheet.tsx:150–286` places title, subtitle, four two-line reasons, a block row and actions directly inside a non-scrollable Animated.View. The sheet has no maximum-height or top-inset handling (`293–299`); action buttons have fixed `height: 48` (`358–363`). Dynamic type is not disabled, so content can exceed the available modal height.

**Player impact:** The safety flow can place its heading/reasons or Submit/Cancel outside the visible area for players who need larger text. Unlike a cosmetic screen, this can prevent ending an unwanted interaction.

**Change:** Give the sheet an inset-aware maximum height and a scrolling body with persistent, wrapping action area. Move accessibility focus to the heading and restore it on close.

**Acceptance:** At 320×568 and large accessibility text, every reason, Block, Cancel and Submit is visible or scroll-reachable; VoiceOver/TalkBack can complete and dismiss the flow. Test with and without a blockable opponent.

#### 6. P2 — Cold links to profile-group screens can have no route back to the game

**Evidence (source-confirmed condition; cold-link behavior needs device verification):** `components/HeaderBackButton.tsx:22` returns null when `router.canGoBack()` is false. The entire profile stack relies on this button (`app/(profile)/_layout.tsx:7–23`) and sits outside the tab shell; root uses `<Slot />` with no initial-route stack anchor (`app/_layout.tsx:162`). Settings/Stats/Blocked have no explicit Arena or Profile exit.

**Player impact:** Entering a settings/stats link without navigation history can leave the player with no visible way to return to play.

**Change:** Give the shared back control an explicit fallback destination in the tab shell, labelled for that destination, or configure a root initial route that remains behind supported deep links.

**Acceptance:** Cold-open every supported profile-group link as an authenticated player; one visible, accessible action always reaches Profile/Arena. Normal stacked back behavior and edit-draft discard confirmation still work.

#### 7. P2 — Shop action hierarchy risks hiding the paid action from assistive technology

**Evidence (source-confirmed nested controls; native accessibility effect needs verification):** Each complete item card is a `TouchableOpacity` with the overriding label “Preview {name}” (`app/(profile)/shop.tsx:636–641`), containing `renderCta(item)` (`715`). That function renders further touchables for Buy/Equip/Top up (`364–388`, `432–460`). The outer accessibility label omits description, price and earn-through-play condition.

**Player impact:** Nested accessibility elements may collapse into the outer Preview button on iOS, making Buy/Equip unavailable or hiding the price/earn alternative. Even with touch, preview and commit occupy one card with two different action meanings.

**Change:** Make the card container non-actionable and expose sibling Preview and Buy/Equip controls, or open an item-detail sheet with the full description, earn condition and a single clear commit action.

**Acceptance:** On native VoiceOver/TalkBack, a player can discover the item description and price, preview it, hear the earn alternative, and reach Buy/Equip independently. Activating Preview never spends credits.

#### 8. P3 — Exactly three ranked players produce a podium and “No rankings yet” together

**Evidence (source-confirmed state logic):** `utils/rankingsView.ts:113–117` splits three ranked rows into a populated podium and empty `rest`. `app/(tabs)/rankings.tsx:324` gives `rest` to FlatList, while `335–341` renders the podium in its header; its unconditional empty component says “No rankings yet” (`344–360`).

**Player impact:** A small launch cohort sees the game contradict its own leaderboard, suggesting their battles or placement are not recorded.

**Change:** Gate the no-rankings state on the full `rankings` collection. Consider a small “Play ranked to join them” cue for an unranked viewer instead of hiding the viewer state entirely.

**Acceptance:** Fixtures with 0, 1, 2, 3 and 4 ranked players show one coherent state; the three-player case never claims the board is empty. Empty/unranked states explain a next step.

#### 9. P3 — “Best prompts” reads as an enduring journal but is a moving recent sample

**Evidence (source-confirmed limits):** Stats is labelled “Best prompts” and described in code as the prompt journal (`app/(profile)/stats.tsx:415–423`). It loads only the last 50 battles (`58`, `99`) and latest 200 locked prompts (`utils/statsData.ts:56`, `73–84`). `bestPrompts` intersects prompt rows with the loaded battles (`utils/statsInsights.ts:284–285`), so older standout prompts disappear as the player continues.

**Player impact:** A player returns to reuse or show a favorite winning prompt and finds it missing without explanation. The insight also appears to describe all-time performance when it describes a sample.

**Change:** Label the sampled scope explicitly (“Best from your last 50 battles”) or provide the persistent prompt journal the concept calls for, with a clear way to keep a favorite. Use the same scope language on move-usage insights.

**Acceptance:** With >50 battles, the label accurately states the analyzed window; saved/favorited prompts remain available if the surface is presented as a journal. No artificial paid advantage.

### Strengths to preserve

- Battles separates actionable/live/history states and uses outcome words plus icons, not color alone. It exposes actionable row labels, retry, pull-to-refresh and an explicit empty-state Start action (`app/(tabs)/battles.tsx:224–255`, `384–391`, `429–467`).
- Profile leads with fighter identity, provides a quick Edit look action, then progression/rivals; dependent reads fail by section instead of zeroing the whole profile (`app/(tabs)/profile.tsx:325–332`, `434–489`, `494–554`). It is a stronger game-home pattern than a utility menu alone.
- Shop previews on the player's own fighter with the same actual cosmetic components, labels rarity in words and clearly states cosmetics do not affect scoring (`components/CosmeticPreview.tsx:43–64`; `app/(profile)/shop.tsx:592`, `677`). Confirmation includes price, balance and the alternative earned unlock (`726–741`).
- Editor stages changes, offers free Save separately from paid redraw, names stale artwork, provides active-battle escape actions, and guards unsaved exit (`app/(profile)/edit-character.tsx:888–903`, `951–964`, `1160–1167`). The hidden expanded/compact hero is removed from the accessibility tree (`components/edit-character/CollapsingStage.tsx:130–148`).
- Settings uses a full-row switch with one meaningful accessibility node and 44pt targets (`app/(profile)/settings.tsx:74–105`). Subscription uses localized store prices, auto-renew text, legal links, restore and management entry points (`wallet.tsx:397–427`, `598`, `647`, `682–724`).

### Art direction and open questions

The inspected source largely follows the intended cinematic fighter hero / calm utility-list split. Do not apply another wholesale visual skin before validating the existing hero artwork, list density and actual small-screen layout. Secondary surfaces are more threatened by false/pending states and reachability than by missing decoration.

`docs/DESIGN_LANGUAGE.md` is stale on supported settings: it promises Dark/Light/System and in-app accessibility controls, while commit `f6a707a` deliberately removed appearance/accessibility UI and `utils/themeSettings.ts`. Current Settings provides audio, notifications, safety, legal, about and account only. Treat this as a product/documentation decision to reconcile, not an accidental missing feature to restore automatically. OS Reduce Motion remains read by `hooks/useReducedMotion.ts`.

Native verification still needed: 200%/largest accessibility text, report-sheet overflow, nested Shop control accessibility, cold-link return paths, keyboard in the editor, and layout with long fighter/item names. No claim here establishes current production store offerings, deployed entitlement behavior, real user retention or exact contrast measurements.
