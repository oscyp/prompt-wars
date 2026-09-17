# Prompt Wars — mobile game UX/UI audit

**13 September 2026 · Current checkout `5e0e6ce` · Product version 1.1.0**

## Verdict

**Keep the cinematic arena art direction. Fix interaction quality, competitive trust, and visual consistency before commissioning a new visual identity.**

Prompt Wars already has a compelling foundation: a personal fighter, a writing challenge with a clear theme, strategic move selection, and a visible competitive outcome. The dark surfaces, fighter portraits, colored move identities, and celebratory reveals fit that foundation. The strongest screens feel like a game rather than a generic AI form.

The current experience nevertheless makes the player work too hard to write, understand the outcome, and return to play. In the native walkthrough, changing a move erased a written prompt; the software keyboard left the focused text out of view; continuation controls required substantial scrolling; and Back from Profile subpages returned to Arena. Large text made the report and battle-mode sheets overflow. Several competitive rules and purchase promises also disagree with the checked-in implementation.

**Recommendation: a focused UX and rules-correction release before wider ranked promotion.** A wholesale reskin would leave the most consequential problems intact. No production incident rate, retention uplift, or numerical usability score is claimed by this audit.

Open the [visual evidence gallery](./SCREEN_GALLERY.html), or use the [technical evidence appendix](./TECHNICAL_EVIDENCE.md) for implementation references.

## What was actually checked

- **Native walkthrough:** existing development build on an iPhone 15 Pro simulator, iOS 26.5, portrait, 393 × 852 logical points. Metro loaded this checkout. Screenshots are the tool's 369 × 800 exports.
- **Gameplay:** one complete Practice vs Bot series, Furrior versus Whisper, won 2–0 by knockout. Both custom prompts, changing a move, lock-in, waiting, both round results, series reveal, summary, and the resulting cinematic surface were inspected. The run created normal bot-game history/progression. No manual purchase, paid redraw/reroll, report submission, block, or ranked match was performed.
- **Secondary screens:** Arena, mode picker, Battles, Rankings, Profile, Wallet, Shop, Settings, Stats, character editor, and the report sheet were opened. The standard text category was `large` (iOS default); `accessibility-extra-large` was used for the two modal checks, then restored. The software keyboard was shown for the writing check and restored to its previous hidden state.
- **Source:** routes, onboarding/auth gates, navigation, theme tokens, reveal composition, competitive formulas, notifications, monetization, appeals, and relevant migrations. Separate mechanics and secondary-screen reviews informed the appendix; consequential formulas were cross-checked directly.
- **Guidance:** current primary material from Apple, Android Accessibility, W3C, and Microsoft's game accessibility guidelines, linked where applied.
- **Limits:** onboarding/auth were source-reviewed without signing out the existing account. Android, physical-device performance, full VoiceOver/TalkBack operation, every localization, real purchases/refunds, provider outages, human matchmaking, notification delivery, and cold deep links were not exercised. Backend findings concern the checkout; remote deployment parity was not established. The web preview failed on an SSR `window is not defined` path, so it was not used to judge mobile visuals.

The floating gear visible in screenshots belongs to the development environment; it is not treated as game UI. Existing edits to the audio provider and its test were left untouched. This audit adds documentation and screenshots only.

### Evidence and priorities

**Observed** means reproduced in the native session. **Source-confirmed** means a concrete code path or formula supports the finding, but its remote runtime was not exercised. **Design judgment** means a recommendation to validate with players.

**P1:** address before broader ranked/paid promotion, or before shipping the affected essential interaction. **P2:** next UX iteration. **P3:** polish, scope clarity, or a narrow edge case. These are release priorities, not claims that every affected player encounters the issue.

## Priority findings

### 1. P1 — Make prompt writing the center of the battle screen

**Observed:** showing the software keyboard left the focused custom prompt offscreen. The fixed battle header and repeated series/HP information consumed much of the remaining viewport. Even the first manual upward scroll did not bring the authored text into view. Separately, a 172-character draft became an empty field after Change move → Continue → Write your own.

See [keyboard](./screens/13-software-keyboard.jpg), [after scrolling](./screens/14-keyboard-after-scroll.jpg), and [draft before](./screens/11-draft-before-change.jpg) / [after](./screens/12-draft-after-change.jpg).

**Change:** collapse the writing HUD to one compact row for round, deadline, and opponent status. Keep the theme available as a short, expandable constraint. The editor should take the remaining space above the keyboard; its caret, recent lines, and text count should remain visible. Put move choice and Ideas near the editor without repeating the full fighter presentation. Preserve drafts by account, battle, and round through move changes, navigation, backgrounding, and restart. Keep the existing accessible alternative to hold-to-submit.

**Acceptance:** a player can type and revise the last line on a small phone with the keyboard open, switch moves and resume the exact draft, and deliberately lock it in. A successful submission clears only that round's draft. Source: [prompt-entry](../../../app/(battle)/prompt-entry.tsx), [move-select](../../../app/(battle)/move-select.tsx).

### 2. P1 — Repair overflow and primary-action readability

**Observed:** at enlarged text, the report sheet's lower reasons and Cancel/Submit actions fell below the screen with no scrolling body. The same happened to Practice vs Bot in the mode sheet. At normal size, Wallet's four-column pack row split “Starter,” “Standard,” and “credits”; the badge overlapped its card. Result rewards also split short labels such as “Credits” midword. Waiting placed the score in the status-bar area.

See [report overflow](./screens/21-report-large-text.jpg), [mode overflow](./screens/32-mode-large-text.jpg), [wallet](./screens/27-wallet-offers.jpg), [result labels](./screens/17-series-summary.jpg), and [waiting](./screens/07-waiting-status-overlap.jpg).

**Measured from source tokens:** white text on the dark theme's lavender primary button, `#A78BFA`, is **2.72:1**. That misses both the 4.5:1 normal-text and 3:1 large-text contrast benchmarks. Dark ink `#0B0B0F` on the same fill is **7.22:1**. Use an explicit foreground/background token pair across Continue, Lock In, selected segments, Subscribe, and Battle Again. This is a targeted color calculation, not certification of the whole app. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

**Change:** inset-aware sheets with scrolling content and reachable actions; two-column or full-width purchase rows; flexible label/value layouts; a consistent safe-area wrapper; and reliable button ink tokens. Do not solve overflow by disabling text scaling. Aim for readable body text around 16–17 points at default size and reserve tiny labels for genuinely secondary metadata. Treat that size as a proposed design baseline, not a universal game requirement.

**Acceptance:** repeat the affected flows at default and accessibility text sizes, on a small iPhone and Android device. Every choice and action is reachable; prices, HP, and deadlines remain complete. Use at least 44-point iOS and 48-dp Android touch targets as the interaction baseline. [Apple UI design tips](https://developer.apple.com/design/tips/), [Android touch targets](https://support.google.com/accessibility/android/answer/7101858?hl=en), [Microsoft game text guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101).

### 3. P1 — Make adjudication and review match the promise of fair competition

**Source-confirmed:** the judge pipeline averages two agreeing runs for its verdict but returns run-one rubric values. Bo3 resolution rebuilds totals from those values, discarding the average. With neutral modifiers, gaps of 1 and 7 favor the same player: their average gap is 4, but the resolver uses 1 and declares a draw.

The fallback judge can also produce word-count/seed-based results after a provider outage while its wrapper reports the primary model ID. The ranked rating path has no degraded-judge exclusion. Ordinary completed Bo3 appeals load four or six prompts, while the appeal processor requires exactly two; the UI nevertheless promises an independent review and stores submitted status only locally.

**Change:** use one authoritative, persisted set of rubric totals for adjudication and explanation; preserve actual per-call judge provenance; make degraded ranked results provisional or rating-neutral while preserving the free result; and provide round-aware, durable appeal states. This requires backend work alongside UX copy. Do not remove the required graceful fallback and strand battles.

**Acceptance:** table-driven double-run/tie cases agree with the displayed result; an injected provider failure cannot silently apply a normal ranked result from the mock; 2–0 and 2–1 appeals complete and remain visibly submitted/reviewed after reopening. These are proposed tests, not tests run here. Exact references: [mechanics evidence](./TECHNICAL_EVIDENCE.md#mechanics-and-battle-ux).

### 4. P1 — Remove trap stat choices and explain how a series is won

**Source-confirmed:** Agility is described as affecting initiative/tiebreaks but has no role in the inspected combat/tiebreak paths. Focus is described as reducing variance but supplies a deterministic modifier. A one-point Strength difference already reaches the ±5% scoring cap, despite comments describing 0.5% per point.

The series exhaustion rule compares raw HP whenever three rounds finish without two wins, even when round wins are unequal. A legal 68-HP fighter can win one round and draw two, yet lose to a 140-HP fighter still at 119 HP. The presented round score would then point to the opposite winner. The final result does not persist and display this deciding rule.

**Change:** settle the rules before changing explanatory UI. Prefer round-win precedence at exhaustion, with HP/score used only for genuinely tied standings, unless a different model is intentionally taught. Give every allocated stat a real, bounded purpose or remove it; provide a fair migration/free respec if existing allocations become obsolete. Teach the player the actual effect of an allocation, not an RPG-sounding promise.

**Acceptance:** equal/unequal stats, 1–0 with draws, 0–0, 1–1, KO, and legacy single battles all produce outcomes that a player can explain from the result. Preserve the free-archetype and server-authority invariants. [Stat copy](../../../utils/statAllocation.ts), [round resolution](../../../supabase/functions/round-resolve/index.ts), [series resolution](../../../supabase/functions/battle-advance/index.ts).

### 5. P1 — Make purchase claims accurate and protect ranked fairness

**Observed + source-confirmed:** Wallet advertises Priority queue and Full video history, but the inspected matcher has no subscriber-priority consumer and the history screen stops at 50 rows without pagination. The Standard pack carries a hard-coded Best value badge. At the displayed prices, 30 credits for $4.99 costs about **$0.166/credit**, versus **$0.100/credit** for 200 at $19.99; the comparison is false on this screen. [Offer screenshot](./screens/27-wallet-offers.jpg), [pack metadata](../../../utils/revenuecat.ts).

**Change:** advertise only demonstrable benefits, derive any unit-value claim from the localized store offering, and explain whether an allowance buys rounds, battles, or videos. If Standard is an editorial recommendation, call it that only with a defensible rationale. Do not claim it is the cheapest per credit.

**Design-integrity risk:** paid idea rerolls are available in ranked play. Keeping payment fields out of judge scoring does not by itself make access to additional candidate answers competitively neutral. No measured paid advantage was established. Equalize the in-ranked idea budget, or validate and explicitly resolve this conflict with the no-pay-to-win promise before expanding ranked play.

**Acceptance:** each subscription benefit has an end-to-end demonstration; a 51st historical video is accessible if full history remains promised; badge math is correct for the shown currency; paid expression/convenience cannot buy a stronger ranked answer supply. See [secondary-screen evidence](./TECHNICAL_EVIDENCE.md#secondary-screens).

### 6. P1 — Let an async player leave the screen without paying to escape

**Source-confirmed:** after any personal prompt has been locked in the series, forfeiting can cost credits. Insufficient balance presents Top up. Back on several battle screens means abandonment, while waiting offers a safe Return to Arena. Bot/casual exit copy can describe ranked-style consequences even though those modes are canceled server-side.

Later rounds begin a two-hour deadline immediately; their push can be suppressed by quiet hours or the daily cap. This is an unfair surprise risk after the app explicitly invites players to continue later. Actual missed-notification incidence was not tested.

**Change:** offer **Return to Arena** throughout the active flow, retaining drafts and showing the exact next deadline. Put **Forfeit series** in a separate menu with accurate, mode-specific consequences and no credit requirement. Design async response windows around quiet hours, denied notifications, and capped pushes. Do not fix this by bypassing notification preferences.

**Acceptance:** a zero-credit player can park or forfeit from every active screen. Notifications are helpful, not the sole way to receive a fair turn window. This changes an intentional economy rule and must be reconciled in the concept document. [Exit implementation](../../../hooks/useLeaveBattle.ts), [leave transaction](../../../supabase/migrations/20260828124000_fix_claim_leave_battle_records.sql), [round advance](../../../supabase/functions/battle-advance/index.ts).

### 7. P2 — Preserve navigation context and clarify the bottom menu

**Observed:** Profile → Wallet → Shop → Back → Back returned to Arena. Profile → Settings → Back also returned to Arena, with Profile's previous scroll position lost. The root uses a Slot and the grouped secondary screens rely on a generic router.back; the route structure needs correction and regression checks, not just a new back icon.

The four destinations—Arena, Battles, Rankings, Profile—are sensible. The raised crossed-swords control is an action inserted into a five-slot tab bar, with no visible text label. Its accessibility label exists, so this is not an entirely unlabeled control; however, the native tree announces destination positions such as “4 of 5” around it.

**Change:** retain four visibly labeled tabs and place a clearly labeled Battle action above the bar where it supports the task. Arena can keep the most prominent Battle CTA. Preserve each tab's state when visiting Profile subpages or returning from a battle. Show a badge for actionable battles/results, with a meaningful count. Keep immersive battle screens outside the tab bar but provide a consistent safe exit. Apple recommends tabs for top-level navigation with labels and preserved section state. [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars?changes=l_1__4&language=objc).

**Acceptance:** every normal Back returns to the opener and its scroll position; cold supported links offer a clear route into the game; Android system Back has the same predictable semantics. A new player can distinguish Arena from Battles and identify how to start without guessing the icon. [Tab layout](../../../app/(tabs)/_layout.tsx), [root](../../../app/_layout.tsx), [back control](../../../components/HeaderBackButton.tsx).

### 8. P2 — Shorten the distance to the first meaningful prompt

**Source-confirmed + design judgment:** authentication is followed by welcome and an eight-step fighter flow: name, archetype, stats, item, battle cry, color, creation method, portrait. Some choices have defaults/skip paths, but the sequence still teaches extensive identity and economy before the core game. A generated portrait is required to finish; failure can prevent reaching play. Completion routes to Arena rather than a guided first battle.

**Change:** retain necessary age/account safeguards, then offer a free starter fighter and a guided Practice battle. Teach theme, one move choice, one authored action, and why it won/lost through play. Make the full creator available to players who want it immediately and invite customization after the first payoff. Defer notification permission until its value is concrete, such as the first async wait; retain a replayable tutorial/help surface. This is a proposed product change, not a claim that the current eight-step design is accidental. [Apple's game onboarding guidance](https://developer.apple.com/app-store/onboarding-for-games/).

**Acceptance:** first-time players reach a submitted prompt without waiting for custom portrait generation; can explain the theme and objective; and know customization is available. Measure time to first prompt/reveal and where people abandon before choosing a target. [Onboarding steps](../../../utils/onboardingDraft.ts), [creator](../../../app/(onboarding)/create-character.tsx).

### 9. P2 — Make every transition advance the game

**Observed:** the round result puts a tall 9:16 illustrated card before HP, rubric, explanation, and Continue. From the initial round-one result, two upward swipes were needed to reach Continue. The terminal round repeats this, then sends the player through the series reveal and into a long summary where Battle Again sits below rewards, sharing, cinematic, and captions. [Round top](./screens/08-round-result-top.jpg), [continuation](./screens/10-round-result-continue.jpg), [final actions](./screens/19-summary-actions.jpg).

**Change:** use a compact, satisfying round payoff: outcome → score/HP change → one reason → persistent Continue. Expand the full rubric/prompts on demand. On the terminal round, transition directly into the final series payoff rather than adding another continuation gate. In the final summary, keep Battle Again and Arena reachable while optional media/details scroll. Sharing should remain available without displacing the replay loop.

Keep the existing skip/replay affordances and reduced-motion support. Motion should explain selection, submission, damage, and victory; long decorative loops should not delay reading or action. Use durations as tuning parameters, then measure perceived responsiveness on devices. [Microsoft motion/distraction guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117).

**Acceptance:** the next meaningful action is visible at the default result viewport and remains reachable with large text. Players can read outcomes at their own pace, skip celebration, revisit detail, and start again without scrolling past a video. Free results continue to work independently of video generation.

### 10. P2 — Make the words describe the actual activity

**Observed:** Arena said Today's theme / Open Arena; the started practice battle used The calm before the storm. Source confirms the hero opens general matchmaking and the matcher chooses a random theme. Whisper was presented as an ordinary opponent during face-off; history later calls the opponent Practice bot. The judge explanation exposed `theme_fit` and “Player One/Player Two.” [Arena](./screens/01-arena.jpg), [face-off](./screens/03-face-off.jpg), [verdict](./screens/10-round-result-continue.jpg).

**Change:** either implement the dated daily-challenge route implied by the hero, or describe general Arena entry and say the theme arrives after matching. Keep Practice / AI opponent visible throughout practice. Translate technical judge prose into a player-facing explanation: “Your compass idea used the storm theme more specifically. Whisper's feint was less specific.” Retain exact rubric values in details. In a writing game, respectful coaching matters as much as announcing a win.

Also distinguish **completed** from **reward claimed**: after this match, two quests showed Claim while the header still said 0 of 3 complete. Rankings showed an ended season with generic “standings will appear once battles are played” copy; give ended, upcoming, and empty-active seasons appropriate explanations/actions. These narrower copy states are P3.

**Acceptance:** a player can state the mode, opponent type, theme, what improved their score, and what to do next; labels agree across entry, battle, result, history, and quests.

### 11. P2 — Make recovery and safety reachable in the secondary screens

The utility structure is mostly sound; the most consequential remaining issues are state handling:

| Surface | Evidence | Required change |
|---|---|---|
| Wallet | Source-confirmed mount-only balance load; purchase polling ends after 10 seconds; failed ledger reads become empty history | Refresh on focus/foreground; retain delayed-purchase status with Check again; distinguish failed from empty |
| Character editor / app gate | Source-confirmed read failures can look like no fighter and route toward creation | Separate loading/error/confirmed-empty states; preserve known identity and retry |
| Successful cinematic | Source-confirmed signing failure can leave Finishing up indefinitely | Retry loading the same approved asset and refresh signed URLs without another charge |
| Blocking | Source-confirmed report flow always files a report; block is only an optional addition | Independent Report and Block actions on relevant player/battle surfaces |
| Shop | Native snapshot exposed outer Preview buttons; nested Buy/Equip controls need VoiceOver/TalkBack validation | Use sibling controls or a detail sheet with price, earn alternative, and one clear commit |
| History / Stats | Source-confirmed 50-battle history limit and sampled best prompts | Add pagination or accurately label the window; saved favorites should persist if offered as a journal |

See the [technical appendix](./TECHNICAL_EVIDENCE.md) for exact paths and edge-case acceptance tests. The report-sheet overflow in finding 2 is already reproduced; cold-link return behavior and full assistive-technology interaction remain validation tasks.

### 12. P2 — Establish consistent art direction across generated content

**Observed + design judgment:** the current character is clearly recognizable in Shop and the editor, but the Profile hero crops off the top of the face. The same player appears through different imagery in face-off, waiting, round poster, and final summary. The round poster's strong purple treatment makes its character less legible. Source supports generated and fallback paths; this audit does not assume every mismatch has the same cause or that remote portrait data is absent.

Compare [Profile crop](./screens/24-profile.jpg), [Shop](./screens/28-shop.jpg), [editor](./screens/31-character-editor.jpg), [waiting](./screens/07-waiting-status-overlap.jpg), and [round poster](./screens/08-round-result-top.jpg).

**Keep:** dark neutral surfaces; restrained lavender brand accent; separate, stable move colors; player-created fighters; cinematic imagery at emotional peaks; calm utility screens; cosmetic expression separated from scoring.

**Change:** define portrait safe zones, focal-point-aware crops, shared identity assets per battle, and intentional loading/fallback states. Preserve the fighter's face and signature item. Let pixel art, anime, or painterly styles remain a player choice, but normalize framing, lighting constraints, image quality, and UI treatment. Variety can be a feature when the surrounding visual system is consistent.

Build a more distinctive Prompt Wars motif from writing becoming action—authored words, the theme constraint, a deliberate lock-in, then the resulting move. Use it in the submission/reveal sequence and brand illustrations. Reduce generic neon wisps and heavy colored washes where they compete with the fighter. Use one readable type family for functional UI, a restrained display treatment for major outcomes, and a consistent icon family. A new font alone will not resolve the current hierarchy problems.

**Acceptance:** one fighter is recognizable across every surface; faces are not accidentally cropped; fallback/loading never suggests a different character; critical text stays legible over all supported art styles. Validate the direction with target players before investing in a full asset replacement.

## Screen-by-screen assessment

| Screen / state | Coverage | Keep | Main next change |
|---|---|---|---|
| Launch and auth | Source | Central account/character gate | Retryable connection state; avoid endless loading or false new-character routing |
| Welcome | Source | One clear invitation and hero | Connect immediately to a playable first experience |
| Fighter creation, eight steps | Source | Persistent draft, optional guided expression | Fast starter path; defer stat/economy teaching; portrait failure must not stop first play |
| Arena | Native + source | Clear starting action, actionable quests | Truthful theme entry; prioritize resume/your-turn work over decorative/meta content |
| Battle mode sheet | Native, default + large text | Three understandable choices | Scrollable layout, clear practice recommendation for newcomers, mode stakes and timing |
| Human matchmaking | Source | Distinct queue status and fallback copy | Real wait/deadline information, safe cancel; validate human flow separately |
| Face-off | Native bot | Fighter-versus-fighter emotional framing | Consistent portraits and AI label; shorten routine repeat entry |
| Move selection | Native | Visible counter relationships and selection feedback | Reduce compressed/truncated HUD; explain the actual impact without jargon |
| Prompt entry / Ideas | Native + keyboard | Ideas/custom choice, deliberate lock-in | Editor visibility, durable draft, competitive-neutral idea budget |
| Waiting / judging | Native | Stage-specific status, Return to Arena | Safe area; one current status; compatible async deadline policy |
| Round result | Native, both rounds | HP, rubric, and explanation exist | Compact payoff; fixed/reachable Continue; details on demand |
| Final reveal / summary | Native | KO explanation, skip/replay, share card | Remove duplicate gates; replay action above optional media; readable reward rows |
| Video / captions | Native surface + source | Optional media; result is not blocked | Correct identity, friendly captions, signing retry, explicit allowance units |
| Battles | Native | Outcomes use text and symbols; live/history grouping | Full/paginated history; reduce canceled-queue clutter; consistent bot naming |
| Rankings | Native empty/ended + source | Dedicated competitive destination | State-specific season copy; player actions; correct three-player empty logic |
| Profile | Native | Strong fighter identity and useful progression | Safe portrait crop; preserve tab state; easier persistent access to settings |
| Character editor | Native landing + source | Full portrait, visible costs, free vs paid distinction | Keep portrait changes recoverable; loading/error handling; test keyboard and large text separately |
| Stats | Native top + source | Clear record and move usage | Label data window; meaningful journal/favorites; interpret sample sizes |
| Wallet / subscription | Native + source | Visible balance, real store prices, restore/legal paths | Truthful offer, responsive pack layout, balance and purchase recovery |
| Cosmetic Shop | Native + source | Preview on your fighter, earn alternatives | Independent accessible controls; refresh balance on return |
| Settings | Native top + source | Coherent audio/notification groups | Predictable Back; reconcile docs and actual supported preferences |
| Report / Blocked | Report native at both sizes; Blocked source | Reasons and safety intent are present | Reachable modal actions; block without accusing; context menus on player surfaces |

## Recommended navigation and battle flow

The intended information architecture can stay small:

```text
Arena        Battles        Rankings        Profile
Play/resume  Your turns     Season/position  Fighter/progress
Quests       Waiting       Player actions   Edit / Stats / Shop
             Results                        Wallet / Settings / Safety

Battle = a labeled action, opening the mode picker.
Each tab retains its selected destination and scroll position.
```

The current played route is:

```text
Arena → Mode → Matchmaking → Face-off → Move → Prompt → Wait
  → tall Round Result → Continue → Move → Prompt → Wait
  → tall Round Result → See series reveal → Reveal → Breakdown
  → rewards / sharing / video / captions → Battle Again or Arena
```

The proposed route preserves strategy while removing unnecessary gates:

```text
Arena / Battle action → Mode + stakes → Match + compact face-off
  → Move + Prompt workspace → Lock In → Wait / safely return to Arena
  → compact Round Result with Continue and expandable evidence
  → next workspace, or final Series Result
  → Battle Again / Arena, with optional details, share, and cinematic
```

Back from an editor reverses the edit step without deleting the draft. Return to Arena parks an active game. Forfeit is a separate explicit action. Push/deep links open the relevant round or result with a route back into the game. These meanings should remain consistent on iOS and Android.

## Delivery order and validation

1. **Restore trust and essential usability.** Correct scoring/appeal/stat mismatches; fix keyboard/drafts, modal overflow, button contrast, and purchase claims. Decide paid exits and ranked idea access. Verify both single and Bo3 paths.
2. **Repair the play loop.** Preserve tab state, simplify round/final results, keep next actions visible, clarify mode/theme/deadlines, and add safe park/resume everywhere.
3. **Improve first-session learning.** Prototype the starter-fighter/tutorial path against the current creation-first flow. Resolve concept conflicts before implementation.
4. **Apply the art pass.** Standardize portrait crops/identity, visual hierarchy, type, iconography, and motion after the screen structure is stable.
5. **Harden secondary recovery.** Delayed purchases, empty/error states, signed media retries, history/journal scope, player safety actions, and accessibility focus.

These are work packages, not effort estimates; engineering sizing should follow the decisions. The most consequential source mismatches need targeted backend tests. No Jest/Deno suite was run because this audit does not implement a fix or claim that existing tests pass.

### Player validation plan

Recruit a small formative group of new players and a separate group of repeat players; include people who use large text and assistive technology. Have them: start without instructions, explain a move choice, author a prompt, change their mind, leave/resume, interpret a win/draw/loss, find a previous prompt, return from Settings, distinguish video allowance from credits, and block someone without reporting misconduct. Do not prompt them toward the expected answer.

Record task completion, wrong turns, lost input, help needed, comprehension of why a result occurred, and self-reported effort. Measure time to first submitted prompt/reveal, keyboard-related abandonments, draft recovery, result-to-next-battle conversion, purchase-pending recovery, and rating/appeal support contacts. Establish a baseline before choosing improvement targets; a single successful audit match provides no retention estimate.

Use device acceptance checks for small screens, large text, long names/localized prices, screen readers, reduced motion, offline/reconnect, background during judging, expired media URLs, denied notifications, quiet hours, and all Bo3 draw/tiebreak branches. Respect notification preferences, retain moderation before media reveal, and keep Tier 0 independent of paid video throughout.

## Product documentation decisions

The concept and design-language documents should be reconciled with the shipped intent. Current conflicts include Bo3 phase/scope and draw behavior, final tiebreak precedence, paid idea rerolls, paid exits, daily-theme entry, video allowance units, auto-enqueued battles, and advertised subscription benefits. The appearance/accessibility settings described in the design language were deliberately removed in earlier work; do not restore them automatically as a presumed regression. Retain working OS reduced-motion behavior and decide any additional controls deliberately.

The goal is a game whose controls, words, visual identity, and competitive rules all tell the same story. That is the highest-value design improvement available here.
