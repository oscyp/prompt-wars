# Remaining screens — UX/UI audit (2026-09-03, third pass)

_Companion to `BATTLE_FLOW_UX_AUDIT.md` and `APP_SHELL_UX_AUDIT.md`. Those passes fixed
defects; this one is the designer-level pass the edit-character, result and profile screens
already had. Scope: Arena (home), Battles, Rankings, Stats, Wallet, Cosmetic shop,
matchmaking and waiting rooms. Method: code survey against `DESIGN_LANGUAGE.md`, the concept
doc (§ MVP scope: daily theme, quests, streak meter, rival panel, prompt journal, rankings) and
the July design review, then an implementation pass._

Severity: **P1** wrong or blocking · **P2** materially hurts play or trust · **P3** craft.

## Verdict

The tabs are correct now and still under-tell the game. Three patterns repeat:

- **Every other player is a grey silhouette.** Rankings, Battles and the Arena's battle rows
  all draw the neutral illustration for every opponent because `characters` is owner-only,
  while the reveal payload on finished battles and a tiny extension to the public cosmetics
  view carry the archetype and signature colour the rows need.
- **Numbers without stories.** Stats shows a lifetime record and a rating; nothing about how
  the player fights (moves), how the rating moved, or which prompts were their best — the
  concept's prompt journal has a table and no writer, and its inputs are all client-readable.
- **Waits with nothing to look at.** Matchmaking is a spinner over a backdrop; the waiting room
  lists a checklist but shows neither fighter.

## Findings and disposition

### Arena (home)

| #   | Finding                                                                                                                         | Sev | Disposition                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Four ways to start a battle on one screen: hero CTA, a full-width "Start Battle", the empty-state CTA and the raised tab button | P2  | Fixed: the bottom "Start Battle" and "Cosmetic Shop" buttons are gone; hero, empty state and the raised button remain                           |
| A2  | Section order buries the most actionable thing (battles where it is your turn) under streak and quests                          | P2  | Fixed: hero → Active battles → Daily quests → Streak → Your standing                                                                            |
| A3  | No rankings teaser or standing on the hub (concept: "home dashboard … rankings teaser")                                         | P2  | Fixed: "Your standing" card (season rank or Unranked, rating or Unrated) → Rankings                                                             |
| A4  | Active-battle rows: neutral art for every opponent; no round or series context on Bo3 rows                                      | P2  | Fixed: archetype art in the opponent's colour from the reveal payload or the public view (bots keep the neutral art); "Round 2 of 3 · 1–0" line |
| A5  | Quest rows: description-or-title text, a bare "1/3", no progress shape; three separate a11y elements per quest                  | P3  | Fixed: title + description, thin progress bar, one grouped label with the claim button separate                                                 |
| A6  | Daily theme has no "shared global leaderboard" or theme pool behind it (concept)                                                | P3  | **Deferred** — backend feature; the hero stays a themed entry into the normal modes                                                             |

### Battles

| #   | Finding                                                                                    | Sev | Disposition                                                                                                 |
| --- | ------------------------------------------------------------------------------------------ | --- | ----------------------------------------------------------------------------------------------------------- |
| B1  | One undifferentiated list of 50 battles, live and finished                                 | P2  | Fixed: sections — Your turn · In progress · Finished                                                        |
| B2  | Every opponent is the neutral illustration although finished rows carry the reveal payload | P2  | Fixed: opponent's archetype art in their colour and fighter name from the payload; public view for the rest |
| B3  | Finished Bo3 rows show only the outcome word; no series score, no knockout                 | P3  | Fixed: "2–0" and a KO tag                                                                                   |
| B4  | Raw `toLocaleDateString()` dates; a full-screen spinner while loading                      | P3  | Fixed: short dates, skeleton rows                                                                           |

### Rankings

| #   | Finding                                                                                              | Sev | Disposition                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Every ranked player is the neutral illustration; the leaderboard is an identity surface (concept §9) | P2  | Fixed: `public_player_cosmetics` gains `archetype` and `signature_color` (migration `20260903120000`, **live** 2026-09-03; the privilege audit's column allowlist for the view was widened to match); rows use them and fall back to the old columns on older deployments |
| R2  | Podium places are a glyph in a row; the review asked for a top-3 header                              | P3  | Fixed: podium header for the top three                                                                                                                                                                                                                                    |
| R3  | "Ends 9/15/2026" raw date                                                                            | P3  | Fixed: "ends in 12 days"                                                                                                                                                                                                                                                  |
| R4  | Full-screen spinner while loading                                                                    | P3  | Fixed: skeleton                                                                                                                                                                                                                                                           |

### Stats

| #   | Finding                                                                                                                      | Sev | Disposition                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Rating shows a dash for null but never "Unrated"; no trend although every rated battle carries the player's delta            | P2  | Fixed: `ratingView` + a sparkline of the last rated battles derived from `rating_delta_payload`                                                                                                             |
| S2  | Nothing about how the player fights: move usage and win rate per move are derivable from their own prompts                   | P2  | Fixed: "Your moves" card                                                                                                                                                                                    |
| S3  | The prompt journal (concept MVP) has a table nothing writes; the inputs — own prompts and round scores — are client-readable | P2  | Fixed client-side: "Best prompts" (top three by the player's round score) with excerpt, theme, KO tag and a link to the result; template-only prompts and battles outside the 50-battle history are skipped |
| S4  | "Recent Battles" duplicates the Battles tab                                                                                  | P3  | Fixed: last five with mode and date, then "See all in Battles"                                                                                                                                              |

### Wallet

| #   | Finding                                                              | Sev | Disposition                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Nothing says what a credit buys; packs are priced against an unknown | P2  | Fixed: "What credits buy" from the live price table read directly (`fetchCreditPrices`; the character-scoped pricing helper needs a character the wallet does not have); video priced at purchase |
| W2  | Transactions tied to a battle are not tappable                       | P3  | Fixed: rows with a battle open its result                                                                                                                                                         |

### Cosmetic shop

| #   | Finding                                                                    | Sev | Disposition                                 |
| --- | -------------------------------------------------------------------------- | --- | ------------------------------------------- |
| SH1 | Rarity is the raw enum ("common")                                          | P3  | Fixed: labelled                             |
| SH2 | Locked earned items say "Unlocks at 25 wins" without the player's progress | P3  | Fixed: "18 of 25 wins" from the profile row |

### Matchmaking and waiting

| #   | Finding                                                                                               | Sev | Disposition                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------- |
| M1  | A spinner over a backdrop: no fighter, no tips, nothing staged (concept §4: waits must stay engaging) | P2  | Fixed: the player's own fighter entering the arena, mode badge, rotating tips (static under Reduce Motion) |
| M2  | No way to cancel a search except the header chevron, which leaves the queue entry behind              | P2  | **Deferred** — needs a cancel action in `matchmaking`; the client must not invent one                      |
| WA1 | The waiting room shows neither fighter                                                                | P2  | Fixed: the versus strip both battle screens already use                                                    |
| WA2 | No "poke" after 30 minutes of opponent inactivity (concept)                                           | P3  | **Deferred** — server feature (push + rate limit)                                                          |

## What was built (shared)

- `utils/publicPlayers.ts` (`fetchPublicPlayers`, chunked, legacy-column retry), `utils/opponentIdentity.ts`
  (`opponentIdentityFor`: payload → public view → nulls), `components/{PodiumHeader,ListSkeleton,QuestRow}.tsx`;
  `utils/battleLists.ts` gains `groupBattlesForList`, `seriesScoreFor`, `roundProgressFor`; `utils/rankingsView.ts`
  gains `recordLabel`, `splitPodium`, `standingLabel`.
- `utils/statsInsights.ts` (`ratingTrend`, `moveUsage`, `bestPrompts`, `recentBattlesView`), `utils/statsData.ts`,
  `utils/creditUses.ts`, `components/{Sparkline,MoveUsageChips}.tsx`; `utils/walletView.ts` gains `rarityLabel`,
  `lockedProgressHint`.
- `utils/arenaTips.ts` (12 rule-true tips), `components/{ArenaTips,FighterEntrance}.tsx`; the waiting room reuses
  `VersusStrip` + `useBattleCharacters` like move-select.
- Nothing here calls a new server endpoint; the only backend change is the view migration under R1.

## Deferred (needs backend or product decisions)

1. Daily-theme matchmaking pool and theme leaderboard (A6).
2. Cancel matchmaking from the client (M2).
3. One-tap poke after 30 minutes (WA2).
4. A server-written prompt journal, if the client derivation (S3) proves too slow for long histories.
5. On-device pass over every screen above.
