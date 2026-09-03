# Battle flow — UX/UI audit (2026-09-02)

_Scope: every screen from the Battle button to the series result — `BattleModeSheet`,
`matchmaking`, `face-off`, `move-select`, `prompt-entry`, `waiting`, `round-result`,
`result` — and the components they share. Method: full code survey of the eight screens and
fourteen components against `docs/DESIGN_LANGUAGE.md`, the concept doc (§4, §7, §8.1) and
mobile-game conventions, followed by an implementation pass. Backend was not changed._

## Verdict

The bones are right. The move-select / prompt-entry split gives the strategic choice and the
writing their own screens; the hold-to-lock ceremony is a real moment; leaving is a confirmed,
priced exit; the Tier 0 poster is the best surface in the app; every animation except two
respects Reduce Motion. What lets the flow down is everything around those bones:

- **The player is told things from the server's point of view.** Bo3 series scores were never
  flipped to the viewer, so player two read a 2–1 lead as "1–2 Victory". Move types appeared as
  raw enum values. Error dialogs quoted function prose such as
  `Round not accepting prompts (status=resolving)`.
- **Three screens were wrong, not just rough.** Re-entering the face-off in Bo3 rounds 2–3
  hardcoded `round=1`; matchmaking failed for anyone with a retired character because the
  lookup omitted `is_active`; human opponents on the face-off rendered as "Player 2" in default
  purple although the signing payload already carried their name, colour and cosmetics.
- **Contrast failed on the game's own colour language.** White text on the dark palette's
  move colours measured 2.4–2.6:1, and `finisher` was byte-identical to `primary` in every
  palette, so a selected Finisher button looked like any primary CTA.
- **Screen readers heard nothing happen.** No live region or announcement anywhere in the
  flow: match found, opponent locked in, judge scoring, button enabled and the outcome itself
  were all silent. Checklist ticks were `View`s with no checked state.
- **The payoff screen withheld the payoff.** No rating change, credits or streak on the result;
  single-format battles showed no scores at all; neither prompt was ever shown; the fallback
  judge line was "Battle was scored by AI judge"; the Bo3 round cards rendered black text on the
  dark card with light-theme hex values.
- **Paid and refunded states were invisible.** The suggestion paywall and rate limit were
  unreachable because the client matched error _prose_ for a code that lives in `error.code`;
  a failed cinematic video showed "Generation failed" with no refund copy and no retry although
  the server refunds and permits a retry.

## Findings and disposition

Severity: **P1** wrong or blocking · **P2** materially hurts play or trust · **P3** craft.

### Matchmaking, face-off, waiting

| #   | Finding                                                                                                                                                | Sev | Disposition                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `face-off` advances with hardcoded `round=1`; Bo3 rounds 2–3 re-enter round 1 and lock-in fails with a developer string                                | P1  | Fixed: uses `current_round`                                                                                                                                                                   |
| M2  | `matchmaking` character lookup lacks `is_active`; players with a retired character are locked out                                                      | P1  | Fixed                                                                                                                                                                                         |
| M3  | `face-off` shows human opponents as "Player 2 / fighter / purple"; the fix already existed in `useBattleCharacters` and was never adopted              | P1  | Fixed: migrated onto the hook                                                                                                                                                                 |
| M4  | Android hardware back leaves the face-off with no dialog and no server call                                                                            | P1  | Fixed: exit guard                                                                                                                                                                             |
| M5  | Bo3 `waiting` has no `canceled` branch; a cancelled series parks forever                                                                               | P1  | Fixed                                                                                                                                                                                         |
| M6  | `waiting` shows one hero state for queueing, waiting and judging; bot battles show an unticked "Opponent's prompt" forever                             | P2  | Fixed: three states, bot row reads ready                                                                                                                                                      |
| M7  | Lock-in deadline never shown while waiting                                                                                                             | P2  | Fixed: countdown line                                                                                                                                                                         |
| M8  | Developer strings: "Realtime updates connecting…", "Asking the judge to retry…", frozen "(43s remaining)", raw server errors in matchmaking            | P2  | Fixed                                                                                                                                                                                         |
| M9  | Four names per mode (`unranked`, "Casual Battle", "UNRANKED MODE", "Practice without…")                                                                | P2  | Fixed: `modeLabel()`                                                                                                                                                                          |
| M10 | No haptic or announcement on match found / result ready; `hapticImpact` skipped under Reduce Motion; 2 s Continue gate not skipped under Reduce Motion | P2  | Fixed                                                                                                                                                                                         |
| M11 | Face-off never labels which side is the player; stat abbreviations `STM/FOC` unexpanded even for screen readers                                        | P2  | Fixed: YOU/OPPONENT captions, full-word a11y                                                                                                                                                  |
| M12 | Matchmaking has no error state or retry; 1 s navigation timeout survives unmount                                                                       | P2  | Fixed                                                                                                                                                                                         |
| M13 | "You'll be notified…" shown without a permission check                                                                                                 | P3  | Fixed: permission-aware                                                                                                                                                                       |
| M14 | Ranked queue silently converts to a bot after 60 s; `converted_from_queue` is returned and unread                                                      | P2  | Fixed on the matchmaking screen ("No one was free — you're facing a practice bot instead."); the waiting-screen conversion still lands without notice (needs a server flag on the battle row) |
| M15 | Abandoned `status='created'` battles are never reaped server-side                                                                                      | P2  | **Deferred** — backend job                                                                                                                                                                    |
| M16 | Countdowns use the device clock against server timestamps with no offset                                                                               | P3  | **Deferred** — needs a server-time endpoint                                                                                                                                                   |

### Move-select and prompt-entry

| #   | Finding                                                                                                                                                                         | Sev | Disposition                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------- |
| A1  | Suggestion paywall / rate limit unreachable: client matched message text for a code sent in `error.code`; every 402 became "unavailable" with a retry that re-ran the paid call | P1  | Fixed: classified by status and code; "Top up" routes to the wallet        |
| A2  | Re-locking after a lock silently discards the rewrite (server returns the existing prompt id as success)                                                                        | P1  | Fixed: locked state replaces the editor                                    |
| A3  | Neither arena screen reacts to the battle changing underneath it (round resolved, expired, opponent forfeited, socket dropped)                                                  | P1  | Fixed: redirect effect, time's-up banner, reconnecting line                |
| A4  | Bo3 series score not oriented to the viewer on four screens                                                                                                                     | P1  | Fixed: `SeriesScoreIndicator viewer`                                       |
| A5  | White on move colours fails AA everywhere in the forced-dark group; `finisher === primary`                                                                                      | P1  | Fixed: `inkFor()` ink selection; finisher recoloured in all three palettes |
| A6  | "New ideas" price hardcoded in three strings while the server reads a price row                                                                                                 | P2  | Fixed: `fetchEditPrice` + `formatCredits`                                  |
| A7  | Blocking rule is 20 characters, coaching is 15 words, counter uses untrimmed length                                                                                             | P2  | Fixed: `promptCoach`                                                       |
| A8  | Tapping an idea overwrites typed text without warning; edited card still looks selected                                                                                         | P2  | Fixed: confirm on replace                                                  |
| A9  | Touch targets 30–36 pt: segments, move chip, "Use and edit" (nested touchable), retry buttons, header chips                                                                     | P2  | Fixed: ≥44 pt, nested touchable removed, header chips 44 pt                |
| A10 | Hold gesture not Reduce-Motion gated; no haptic on start; hint shifts the footer; irreversibility stated only to screen readers                                                 | P2  | Fixed                                                                      |
| A11 | Submit failures shown as `Alert('Error', <server prose>)`                                                                                                                       | P2  | Fixed: `describeSubmitError`                                               |
| A12 | Lock-in countdown is the smallest text on the screen (10 pt)                                                                                                                    | P3  | Fixed: 12 pt                                                               |
| A13 | Move-type strategy hint absent from buttons                                                                                                                                     | P3  | Fixed: `accessibilityHint` from `MOVE_META`                                |

### Round result and result

| #   | Finding                                                                                                                                              | Sev | Disposition                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | Series score in the result headline never flipped to the viewer                                                                                      | P1  | Fixed: `seriesHeadline`                                                                                                 |
| R2  | `RoundMiniCard` text has no colour (black on `#1A1A1A`) and uses light-theme hexes; outcome derived from scores instead of `round_winner_id`         | P1  | Fixed                                                                                                                   |
| R3  | "Opponent Recap" stripe coloured by viewer identity, not the opponent's move                                                                         | P1  | Fixed: opponent's move colour + icon                                                                                    |
| R4  | Result screen has no safe area under a transparent header and no visible way out on replace paths                                                    | P1  | Fixed: safe area, "Back to Arena", "Battle Again" replaces                                                              |
| R5  | Fetch failure leaves a bare spinner forever                                                                                                          | P2  | Fixed: error state with Retry                                                                                           |
| R6  | No round outcome banner; no series score on the round screen; raw lowercase move names                                                               | P2  | Fixed                                                                                                                   |
| R7  | No rating delta, credits or streak on the payoff screen although the battle row carries `rating_delta_payload`                                       | P2  | Fixed for rating delta and the quality-floor gate; credits/streak **deferred** (needs a reward summary from the server) |
| R8  | Video: `'pending'` checked, `'submitted'` not; failed video shows no refund copy and no retry; upsell dialog says "Tier 1", "for 1 credits"          | P2  | Fixed: predicate, refund copy, retry via CTA, `ConfirmSheet` with price rows                                            |
| R9  | Moderation-pending video state is unreachable and the promised blur does not exist                                                                   | P2  | **Deferred** — needs `videos.moderation_status` on the client                                                           |
| R10 | Appeal button has no submitted state                                                                                                                 | P3  | Fixed                                                                                                                   |
| R11 | Outcome not announced; icon unlabelled                                                                                                               | P2  | Fixed: header role + announcement                                                                                       |
| R12 | Rubric bars: opponent marker nearly invisible, no `accessibilityValue`, no legend                                                                    | P3  | Fixed                                                                                                                   |
| R13 | Neither prompt is ever shown on any result surface                                                                                                   | P2  | **Deferred** — `prompt_excerpt` is in the payload; needs a design for the side-by-side card                             |
| R14 | `RenderRevealSheet` (edit screen) reintroduced an AI-generated pill that commit 042c59a deliberately removed; `DESIGN_LANGUAGE.md` still mandated it | P2  | Fixed: pill removed, doc corrected                                                                                      |

### Shared

| #   | Finding                                                                                                                                                                                                                            | Sev | Disposition                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `HPBar` read `AccessibilityInfo` directly and ignored the in-app Reduce Motion toggle                                                                                                                                              | P3  | Fixed: `useReducedMotion`                                                                                                                                                          |
| S2  | `HeaderBackButton` / `HeaderLeaveButton` 36 pt visible target, raw `‹` glyph                                                                                                                                                       | P3  | Fixed: 44 pt, Ionicons                                                                                                                                                             |
| S3  | `hasOpponent()` duplicated verbatim in two screens                                                                                                                                                                                 | P3  | Fixed: `utils/battles.ts`                                                                                                                                                          |
| S4  | Two different `BattleMode` types (3-value and 5-value) under one name                                                                                                                                                              | P3  | **Deferred** — rename in a type-only pass                                                                                                                                          |
| S5  | `BattleModeSheet` scrim is a full-screen labelled button with no real close control; no haptic on the game's verb                                                                                                                  | P3  | Fixed                                                                                                                                                                              |
| S6  | White label text on `primary` fills measures about 2.8:1 in the dark theme (`#A78BFA`). Every primary button in the app shares this; the arena pass replaced the hardcoded white with the `Ink` token but did not change the ratio | P2  | **Deferred** — needs a design-system decision: an `onPrimary` token (dark ink on the light lavender) or a darker fill for buttons in the dark theme, applied app-wide in one sweep |
| S7  | The face-off now seats the viewer on the left so "YOU / OPPONENT" captions are truthful for player two; round and series results already orient HP and scores the same way                                                         | —   | Consistent; noted for the device pass                                                                                                                                              |

## What was built

- `utils/battleCopy.ts` — one source of player-facing words for the flow: `modeLabel`,
  `moveLabel`, `describeSubmitError`, `roundOutcomeFor` / `roundOutcomeCopy`,
  `seriesHeadline`, `ratingDeltaLabel`. Pinned by `__tests__/battleCopy.test.ts`.
- `utils/contrast.ts` — `inkFor(fill)` picks near-black or white by WCAG contrast; tested
  against every move colour in both palettes at ≥ 4.5:1.
- `constants/Colors.ts`, `hooks/useThemedColors.ts` — `finisher` is pink in all three palettes
  so it can never be mistaken for `primary`. `constants/DesignTokens.ts` gains `Ink`.
- `components/SeriesScoreIndicator.tsx` — `viewer` prop; both numbers labelled You / Opponent.
- `utils/battles.ts` — `submitPrompt` returns `status` and `code`; `generateMoveSuggestions`
  classifies by status/code; `hasOpponent` shared.
- `utils/editCooldowns.ts` — `fetchEditPrice(kind)` for surfaces that need one price.
- `utils/promptCoach.ts` — length coaching in the units the rule actually uses.
- Screen changes as listed in the tables above.

## Deferred (needs backend or design work)

1. Reap or bot-convert `status='created'` battles abandoned before matching (M15).
2. A server-time offset for countdowns (M16).
3. Surface `converted_from_queue` on the battle row so the waiting screen can announce a
   ranked-to-bot conversion (M14).
4. ~~A per-battle reward summary (credits granted, streak after) for the result screen (R7).~~ **Shipped 2026-09-03**: `battles.reward_payload` is written by `apply_post_battle_rewards` (migration `20260903110000`, live) with credits, streak after/best, quests advanced and quests carried over their target, keyed by profile id; the result reveal's payoff beat reads it.
5. Client access to `videos.moderation_status` so the pending-moderation state is real (R9).
6. ~~Side-by-side prompts on the result, using `players[].prompt_excerpt` (R13).~~ **In the reveal (2026-09-03)**: the judge beat shows both prompt excerpts with the rubric bars and the judge's line.
7. Unify the two `BattleMode` types (S4).
8. On-device pass: SE-class phone, Dynamic Type XXL, VoiceOver through one full Bo3.
