# Prompt Wars Implementation Concept

> Document version: v4 (UX and game-integrity remediation, 2026-09-13).
>
> The [approved remediation plan](plans/2026-09-13-ux-game-integrity.md) defines this release. New combat rules and independent appeals are gated until compatibility, calibration, and validation pass. Existing battles retain their stored rules and assigned deadlines. The older amendment below is historical context.
>
> **Amended 2026-08-22** after an implementation audit. Sections corrected where
> the code was right and the doc had gone stale: §7.7 (Bo3 is every mode, not
> Phase 2; move-type is absolute points, not a percentage; damage/KO retuned;
> round 2-3 ranked timeout is 2h), §10.1 (one credit is one round, not one
> battle), §2 (RN version). §3's parallel-queue auto-enqueue is marked as
> unimplemented rather than silently listed as MVP scope. Where the doc and the
> code disagreed on entitlement round-units, the code's choice was kept and the
> doc changed. Changes vs. v2: shorter ranked timeout, theme-after-matchmaking decision layer, cinematic Tier 0, judge calibration + appeals, identity additions to character creation, daily meta promoted into MVP, realistic KPI targets, accessibility and compliance hardening.

## 1. Product Vision

Prompt Wars is a mobile-first competitive game where players battle through prompts. Each player builds a character, enters a 1v1 war, selects a predefined generated prompt or writes a custom prompt, and locks in their submission. When both players are ready, the backend resolves the battle and generates a short AI video that dramatizes the result.

The first version should feel simple, fast, and social: create a character, join a battle, choose a prompt, see an AI-generated outcome, earn progress, and climb rankings. The long-term opportunity is a game where prompt writing, character identity, cosmetics, ranked seasons, and shareable AI result videos create a strong replay loop.

## 2. Stack Recommendation

Use the local `/Users/patdom/sources/remedy` project as the baseline implementation style.

Recommended stack:

- React Native with Expo SDK 55
- React Native 0.83.6
- Expo Router for route groups and navigation
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Supabase migrations for database evolution
- RevenueCat via `react-native-purchases` for subscriptions and in-app purchases
- Jest and `jest-expo` for tests
- EAS for development, preview, and production builds
- yarn scripts aligned with the local Remedy project conventions

Suggested route groups:

```txt
app/
  (auth)/
  (onboarding)/
  (tabs)/
  (battle)/
  (profile)/
  _layout.tsx
```

Suggested tabs:

- Arena
- Battles
- Rankings
- Profile

Battle is a raised, labeled action in the middle of the tab bar, between Battles and Rankings. It opens the mode sheet while keeping the current destination selected. A persistent root stack preserves the tab and scroll state beneath secondary screens.

## 3. MVP Scope

The MVP should optimize for async turn-based 1v1 battles. This avoids the complexity of live socket rooms while still supporting real player-versus-player competition.

MVP features:

- Account creation and sign-in
- First-run free starter fighter and resumable guided practice, with full customization as an alternative
- Prompt template selection
- Custom prompt entry with moderation
- Structured prompts: move type (attack / defense / finisher) plus text
- Bot opponents for first battle and as a fallback when matchmaking is empty
- Async 1v1 battle creation, friend challenge by deep link, and matchmaking
- Theme revealed after matchmaking; both players write under the same constraint
- New human rounds allow 24 hours from server opening; practice allows two hours. Assigned deadlines are never changed retroactively.
- Starting another battle is always an explicit player action; no automatic parallel enqueue.
- Server-side battle resolution using LLM-as-judge with rubric, double-run, length normalization, and judge calibration
- Player appeal flow for ranked losses (capped 1/day)
- Tier 0 result reveal (always free, cinematic and silent): scored card, rubric breakdown, judge "why," 9:16 motion poster, per-move-type animation
- Tier 1 result reveal: one shared AI video (standard 8s round / 12s single, Plus 20s), with audio on explicit playback, automatically queued after a completed battle when either participant is below the 1/day automatic-video cap; project-wide cap 100/day; paid/sub upgrade remains the overflow path
- 3 free Tier 1 video reveals in the first 7 days for every new account
- Draws as a first-class outcome
- Player stats and battle history
- General Arena entry with theme revealed after matching, daily quests, win-streak meter with mercy day
- Rival auto-tagging on most-played opponent; recent best prompts with an explicit sample window
- Basic rankings (Glicko-2) and seasonal leaderboard with anti-collusion guardrails
- Newbie matchmaking bucket (under 10 ranked battles only matched to newbies or bots)
- Credits for video upgrades, subscription ("Prompt Wars+") for video allowance and cosmetics
- First-time-user offer 24-72h after install
- Push notifications: opponent submitted, result ready, video ready, daily quest, friend challenge (max 2/day, must-send only on result-ready)
- Pre-gen prompt moderation, post-gen video moderation, blurred-until-cleared preview
- Report and block flow; approved 13+ eligibility with country-specific guardian consent, staged behind the disabled combined release switch (see §22)
- Share flow: watermarked 9:16 video AND scored result-card image export

Out of scope for MVP:

- Real-time simultaneous battles
- Guilds or clans
- Large tournaments
- Creator marketplaces
- Advanced replay editing
- Web3 ownership or trading
- Pay-to-win boosts

## 4. Core Game Loop

1. Player signs up or signs in.
2. Player chooses Play practice with a free balanced starter, or Customize first. The starter needs no image-generation request.
3. Player enters matchmaking, accepts a challenge, or starts an unranked battle.
4. Once both players are matched, the **battle theme is revealed to both** with a per-side visible timer.
5. Player picks a predefined prompt or writes a custom prompt under the shared theme constraint.
6. Custom prompts pass moderation and length checks.
7. Player locks in the prompt. Unsubmitted writing is persisted locally by account, battle, and round. The player may park safely and start another battle explicitly.
8. The battle waits until the opponent locks in or the displayed round deadline expires (24 hours for new human rounds; two hours for practice).
9. Backend resolves the battle (LLM-as-judge, double-run, length-normalized, calibrated).
10. Tier 0 cinematic reveal plays silently for both players: motion poster, animation, scored card.
11. Backend automatically queues one shared Tier 1 video, with sound on explicit playback, when either participant is below the 1/day cap (global 100/day); otherwise the existing credits/sub allowance upgrade remains available.
12. Stats, rankings, rewards, and wallet transactions are updated. Player may file one appeal/day on a ranked loss.
13. Player can rematch, share (video or scored card image), or start a new battle.

The loop should be short enough that a user can complete their first battle within a few minutes, while async waiting states keep the app useful when the opponent has not submitted yet. Return to Arena is always available without forfeiting. Forfeit is a separate free action with mode-specific consequences.

## 5. Character Creation

A server-finalized fighter is required before a battle, but customization is optional before first play. Play practice creates an idempotent balanced starter with bundled artwork; Customize first retains the full creator. Contextual tutorial hints teach the ordinary Bo3 rules without forcing a win. Dismissal, resumption, and replay are supported. Deferred customization retains three initial free portrait renders, consumed server-side. Request notification permission at the first meaningful async wait.

Starter character model:

- Display name
- Archetype
- Avatar or generated portrait reference
- Short battle style description
- Primary trait
- **Battle cry**: one free-text line (max 60 chars), shown on every result reveal and shareable card
- **Signature color**: applied to UI accents, frame, and reveal card
- Cosmetic frame or title

Starter archetypes (all free, all available from day one):

- The Strategist: precise, tactical identity/build preset
- The Trickster: creative, chaotic identity/build preset
- The Titan: direct, powerful identity/build preset
- The Mystic: poetic, abstract identity/build preset
- The Engineer: structured, technical identity/build preset

Archetypes are free identity and build presets, with no additional affinity stat or scoring bonus. Allocated stats supply the documented bounded combat effects. Cosmetics, subscriptions, and shop items never gate or boost an archetype.

Progression ideas:

- Level from battle participation and wins
- Titles from achievements
- Cosmetic frames from seasons
- Avatar effects from subscriptions or shop purchases
- Prompt style badges from repeated play patterns
- **Rivals**: the opponent a player has battled most over the last 30 days is auto-tagged as their rival, with a badge in match search and reveal screens. Manual override possible.

## 6. Prompt System

Players can either select a predefined generated prompt or create their own.

Predefined prompts:

- Curated by category and difficulty
- Safe for all ranked play
- Rotated daily or seasonally
- Useful for new users who do not know what to write
- Can include tags like cinematic, funny, heroic, villainous, tactical, absurd, or dramatic

Custom prompts:

- Player-authored text with length limits
- Moderated before lock-in
- Scored for relevance, originality, clarity, and character alignment
- Stored with battle context for auditability
- Never sent directly to a client-visible provider key

Recommended prompt limits for MVP:

- Minimum: 20 characters
- Soft target: 80-400 characters
- Maximum: 800 characters
- One prompt per player per battle
- No edits after lock-in

Prompt categories for templates:

- Opening attack
- Defense reversal
- Final move
- Taunt
- Strategy
- Chaos
- Cinematic finisher

## 7. Battle Mechanics

Battles are resolved server-side. AI is used as a structured judge of prompt quality, but the resolution pipeline, scoring, tie-breaks, and rating updates are owned by the backend. The client never decides outcomes.

Decision-making layer (MVP): once both players are matched, the **battle theme is revealed to both** before either writes their prompt. Both write under the same constraint, in parallel, with a visible per-side timer. This is what turns the game from a writing exercise into a battle. **Best-of-3 rounds (see §7.7)** is the live format; legacy single battles remain readable and resolvable. Per-match wagers are outside this remediation.

### 7.1 Structured Prompt Model

A submitted prompt has two parts:

- `move_type`: one of `attack`, `defense`, `finisher`. Adds light rock-paper-scissors mechanics so the game has a real strategy layer beyond writing quality:
  - `attack` beats `finisher` setups
  - `defense` beats `attack`
  - `finisher` beats `defense`
  - same vs. same is neutral
- `text`: the player's free-text prompt, predefined or custom.

Move-type matchups apply a small scoring modifier (capped) and influence the generated result video framing. They do not override clear quality differences, but they create meaningful counter-play.

Move-type must be **legible** to be strategic. Required surfaces in MVP:

- Show opponent's last 5 move types on the prompt-entry screen.
- Show counter-pick win rate per move type vs. the opponent's archetype.
- On the result screen, explicitly state any modifier applied (e.g., "Defense countered Attack: +12% modifier").

### 7.2 Battle State Machine

```txt
created
  -> matched
    -> waiting_for_prompts
      -> resolving
        -> result_ready (text and image preview always available)
          -> generating_video (optional, gated by credits or sub)
            -> completed
      -> expired             (timeout before both prompts locked)
      -> canceled             (player or system cancel)
      -> moderation_failed    (prompt rejected at lock-in)
  -> generation_failed        (video tier failed; battle still completes with fallback reveal)
```

Key property: `result_ready` is reachable without ever generating a video. The video step is an optional upgrade, not a blocker for closing the battle, updating ratings, or showing a result.

### 7.3 LLM-as-Judge Scoring

MVP uses an LLM-as-judge approach behind an Edge Function with a fixed rubric. This is the only honest way to score free-text prompts at scale, but LLM judges drift, are sycophantic, and reward verbosity. Defense-in-depth is required.

Rubric per prompt (each 0-10):

- Clarity
- Originality
- Specificity
- Theme fit
- Character consistency (wire key `archetype_fit`)
- Dramatic potential

Procedure:

1. Server packages both prompts blindly (no usernames, no ratings, no archetype names, no theme name in natural language) into a structured judging payload. Archetype and theme are passed as opaque structured fields the judge cannot pattern-match on stylistically.
2. The judge model is asked to score both prompts on the rubric and return strict JSON.
3. **Length normalization**: per-category scores are normalized against word-count buckets so longer prompts cannot win on volume alone. Cap the marginal benefit of length above the soft target (400 chars).
4. The call is run twice with different seeds. Agreeing calls average corresponding normalized rubric values. This same aggregate drives outcome, displayed totals, and damage. Directional disagreement retains the third-call policy. Store each actual model ID, prompt version, seed, raw/normalized rubric, fallback status, and aggregation path.
5. Move-type matchup modifier is applied after rubric scoring, capped.
6. Final winner, per-category scores, normalized scores, and a short "why" explanation are stored on the battle.
7. Players see the per-category breakdown and judge explanation on the result screen. Transparency is the retention lever.
8. Drift control: a frozen judge prompt version is stored on each battle so re-evaluations and audits are reproducible.

**Calibration set**: a frozen library of ~200 prompt pairs with known correct winners. The live judge runs against this set nightly; if accuracy drops below threshold, the current judge model/prompt version is frozen and an incident is opened. New judge versions must beat the current version on the calibration set before promotion. Judge versions ship at season boundaries only, so mid-season ratings stay stable.

**Player appeal flow**: a ranked loss may be appealed once per day when an independently configured, calibrated reviewer is available. Review every played round with frozen prompts, moves, stat snapshots, and rules, using a model different from the original calls. Reconstruct the series sequentially: uphold, overturn, or no contest when an unplayed deciding round is required. On overturn/no contest, an atomic unique correction reverses the original rating-point delta once, preserving later rating changes and current deviation/volatility. Do not replay later games or grant replacement win rating. Reconcile outcome records/streaks without reclaiming credits/cosmetics or duplicating rewards. Pending, processing, retryable failure and final states survive restart. Preserve original evidence, revise result cards, and identify pre-review cinematics. Unavailable review never consumes the allowance.

**Degraded judging**: any mock-assisted ranked series still completes Tier 0, explicitly as an unrated exhibition. No ranked rating or competitive win/streak reward changes; participation remains available.

Scoring inputs explicitly excluded from MVP: player rating difference, recent streaks, paid items. Rating changes are computed _after_ scoring, never as part of it.

### 7.4 Draws

Draws are first-class. A round is drawn when the final score gap is below the existing three-point threshold. Series rules are in §7.7. Eligible ranked series draws use normal Glicko-2 draw handling; the free reveal still completes.

### 7.5 Ranked Battle Constraints

- Only moderated prompts (templates or custom).
- No paid stat modifiers.
- Rating updates use **Glicko-2** (chosen for sparse async play; rating deviation grows during inactivity).
- New human-round deadline: **24 hours** from server opening; existing assigned deadlines remain unchanged. Per-round timeout handling remains server-owned.
- Parking is free and never changes battle status; starting a new battle is explicit. Ranked human forfeits are free losses; casual/practice abandonment and unmatched queues cancel. During judging, parking remains available without racing the resolver.
- A player can send one "poke" notification per battle after 30 minutes of opponent inactivity.
- Opponent diversity: cannot face the same opponent more than N times per 24h in ranked.
- Newbie bucket: accounts with under 10 ranked battles are only matched to other newbies or bots.
- Full audit log retained.

### 7.6 Unranked And Friend Battles

- Experimental templates allowed.
- Friend challenges via deep link.
- New casual/friend rounds: **24 hours**; practice: **two hours**. Show exact localized deadlines.
- No ranking penalty.
- Still moderated. Still subject to anti-abuse caps.

### 7.7 Best-of-3 Rounds Mode

Best-of-3 (Bo3) is **the live battle format for every mode** — ranked, unranked, friend and bot — as of migration `20260802120000_enable_bo3_all_modes.sql`. It runs the theme/prompt/judge stack across up to three rounds with HP carryover through the `round-resolve` path. All scoring inputs and outputs are server-owned.

> The `battles.format` column still defaults to `'single'` and the single-format resolver (plus `expire_timed_out_battles` and `claim_forfeit_timeout_battles`) is still maintained, but **no new battle reaches it** — `create_battle` and `create_bot_battle` both force `'bo3'`. Those paths are legacy-only, for rows created before the flip.

**Character stats.** Each character has four stats — Strength, Stamina, Agility, Focus — each integer 1-10. At creation the player distributes a fixed pool of **20 points** across them (min 1, max 10 each; the historical default was 5/5/5/5, which is the same total), validated server-side in `finalize-character-creation` (`_shared/character-stats.ts`); the client can never write `stat_*` directly. After creation stats have no paid boosts. Existing players receive one free rules-v2 respec, preserving their current point total and all active battle snapshots. Archetype presets are convenience, not affinity bonuses. Stats are **snapshotted into the battle row at face-off** (`player_one_stats_snapshot`, `player_two_stats_snapshot` JSONB). All resolution code reads the snapshot — never the live `characters.stat_*` columns — so retroactive stat changes never alter past battles.

New battles use version 2 only after the rollout gate is enabled; existing battles retain version 1.

- Strength: existing damage contribution plus 0.5% scoring per point of difference.
- Stamina: `HP_max = 60 + Stamina * 8`, spanning 68–140.
- Agility: incoming damage reduction of 2% per point above the attacker, capped at 18%.
- Focus: predictable 0.25% scoring per point of difference.
- Combined Strength/Focus scoring is capped at ±5%.

**Round modifiers.** Per round, after rubric + move-type scoring:

- `stat_modifier ∈ [-0.05, +0.05]` — a **fraction** of the base rubric aggregate (hard server cap, ±5%).
- `move_type_modifier ∈ [-0.6, +0.9]` — **absolute aggregate points**, not a fraction. It was ±12%/-8% multiplicative, which on a typical base of 40 opened ~8-point gaps between equal prompts against a 3.0 draw epsilon, so the counter-pick decided close rounds rather than the writing. A favourable counter-pick against an equal prompt now yields a 1.5-point gap — inside the draw band — so it breaks ties instead of creating them.
- Combined cap: ±20% of the base aggregate, floored at 2.0 points so a low-scoring round cannot false-trip the guard. Enforced in `round-resolve`, the only writer that knows the base.
- Hard caps are enforced server-side; structured errors are raised if a caller produces values outside range (no silent clamp).

**HP and round outcome.**

- HP is initialized from Stamina at face-off and **carries across rounds**.
- Round winner: higher final normalized score. Within draw epsilon → `is_draw=true`, `round_winner_id=NULL`, no damage applied.
- Version-2 damage = `clamp(round((12 + score_gap * 2.2 + (winner_strength - 5) * 1.5) * (1 - agility_reduction)), 8, 60)`, applied to the loser after the round. Round once after reduction. Version 1 retains its recorded rules.
- KO: `hp ≤ 0` at end of round AND `score_gap ≥ 7`. KO ends the battle immediately and wins it.

> The earlier formula (`gap * (8 + strength/2)` clamped to 40) pinned to its clamp for essentially every non-draw round, since the draw epsilon is 3.0. With 100 HP at default stamina and at most two losses before a match ends, **KO was mathematically unreachable and the "lower HP loses" tiebreaker could never discriminate** — both players always held identical HP. Under the current curve two blowouts KO at default stamina, an even series does not, and stamina 10 survives what stamina 1 does not.

**Battle outcome.**

- First to 2 round wins → wins the battle.
- KO at any round → wins the battle.
- Continue to round three whenever neither side has two wins and no KO has occurred, including standings with draws.
- Version-2 exhaustion compares round wins, then remaining HP percentage, then cumulative final score, then declares a draw. Submission speed is never a deciding rule. Persist the rule and comparison values for player-facing explanations.

**Timeouts.** Each new human round receives 24 hours when opened by the server, including ranked, casual, and friend rounds. Practice retains two hours and immediate bot behavior. Existing assigned deadlines remain unchanged. Round-start pushes remain subject to quiet hours and notification caps; notification receipt never starts the clock.

> Bo3 uses per-round deadlines; legacy single battles retain their assigned battle-level deadline. Only per-round deadlines are swept. Sweeper operates on `battle_rounds.lock_in_deadline`, not the battle-level deadline. Single-sided lock at deadline → opponent forfeits that round only; battle continues unless that loss completes the match.

**Entitlements.** Allowances are denominated in round-units, and one credit buys one **round**, not one battle — a three-round cinematic Bo3 costs three. The automatic free video enqueues **one** shared cinematic per completed series (for the final round), not three. Glicko-2 rating updates remain **one match-level call** per completed Bo3 battle, never per round.

**Schema seams (Phase 2).**

- `battles.format`, `best_of`, `current_round`, `player_*_hp`, `player_*_hp_max`, `player_*_rounds_won`, `face_off_revealed_at`, `player_*_stats_snapshot`.
- `characters.stat_strength | stat_stamina | stat_agility | stat_focus`.
- `battle_prompts.round_number` (default 1).
- New table `battle_rounds` (server-owned writes; per-round status, lock timestamps, judge payload, damage, HP-after).

### 7.8 Anti-Cheat And Anti-Collusion

Prompt battles are extremely vulnerable to win-trading. Required safeguards from MVP:

- Server-side rate limits on battles created, prompts submitted, and ranked matches per hour and per day.
- Opponent diversity requirement for ranked rating gains. **Implemented 2026-08-22** (`ranked_rating_is_diverse`, gating rating in `battle-advance`). Note this defence had never actually run before then: `opponent_history` was never written to, so the check always saw zero prior battles.
- ~~Heuristic detection of suspicious win-trade patterns (same pair, alternating wins, low prompt quality).~~ — **not implemented.**
- ~~Shadow rating that lags public rating during anomaly review.~~ — **not implemented:** `profiles.shadow_rating` and `shadow_rating_enabled` exist as columns and are never read or written.
- ~~Manual review queue for top-leaderboard accounts.~~ — **not implemented.** A general report queue does exist (`moderation_queue` view + `moderation-queue` function), but nothing specifically reviews leaderboard accounts.
- No rating gain when both prompts fall below a minimum quality floor. **Implemented** (`RATING_QUALITY_FLOOR`, `_shared/judge.ts`).

## 8. AI Result Reveal Pipeline

The result reveal is the emotional payoff. AI video is the hero format, but it must not be the gate to closing a battle. Video is slow, expensive, and failure-prone, so the reveal is built as **tiers**, not a single must-succeed pipeline.

### 8.1 Tiered Reveal

Tier 0 must be the wow moment for free users. A static scorecard is utility, not theater — players judge the app on their first result, so Tier 0 is engineered to _feel_ cinematic even though it is templated and cheap.

Every completed battle produces, in order:

1. **Tier 0 - Free, instant, cinematic.** Always free, always shown, never blocked by credits. Includes:
   - 9:16 motion poster composed **client-side** from the character's locked portrait (frozen seed + art style) over a signature-color gradient, with parallax and subtle motion. No per-battle image generation on the free tier — this keeps Tier 0 instant and protects unit economics. A generated per-battle still is an optional, non-blocking later phase (Phase 2+: a cached per-character "hero still"; Phase 3: an async "Tier 0.5" still swapped in after the reveal already rendered).
   - Per-move-type canned animation overlay (3-second sting per attack/defense/finisher).
   - Scored result card: winner, per-category rubric scores, judge "why," character portraits, prompt quotes, signature-color theming, applied move-type modifier.
2. **Tier 1 - Cinematic short, automatic with paid overflow.** An AI-generated video composed from both prompts, both characters, and the recorded outcome: standard clips target 8 seconds per Bo3 round or 12 seconds for a legacy single battle; Prompt Wars+ clips target 20 seconds when the cinematic-v3 rollout is enabled. The backend automatically queues ONE shared video per completed battle when either participant has not sponsored an automatic video that UTC day, capped at 100 automatic jobs project-wide per day. Automatic jobs spend no credits. When both players have used the daily automatic slot (or the circuit is open), the existing credit/subscription upgrade path remains available. New accounts also retain **3 free Tier 1 upgrades in the first 7 days**.
3. **Tier 2 - Highlight reel (later phase).** Stitched best moments from the season; for sharing.

> **Client presentation of Tier 0 (2026-09-03).** The series result plays as a reveal sequence of up to four beats — verdict (series dots, KNOCKOUT stamp), winner (full-body render with a per-move-type sting chosen from `reveal_spec.animation_preset`), what the judge saw (both prompt excerpts, rubric bars, the judge's line), payoff (rating, credits, streak, quests) — auto-advancing, tap-to-skip, a static pager under Reduce Motion, then a summary with the shareable card. The payoff reads `battles.reward_payload`, written once per battle by `apply_post_battle_rewards` (credits granted and why, win streak after/best, quests advanced and quests carried over their target). The final round's own screen no longer shows the poster; the series reveal owns the cinematic moment.

This structure protects unit economics through atomic daily caps, makes the app usable when the provider is degraded, and still supports desire-driven paid overflow.

### 8.2 Provider Strategy

- Default video provider: xAI / X AI / Grok video generation, kept behind an `AiVideoProvider` adapter.
- The judge LLM and the image-still model can be different providers from the video model. Keep three adapters: `AiJudgeProvider`, `AiImageProvider`, `AiVideoProvider`.
- Provider API keys live only in Supabase Edge Function secrets.
- Cost guardrails: per-user daily generation cap, global circuit breaker if provider error rate or cost exceeds a threshold.

### 8.3 Video Generation Flow

1. Battle reaches `result_ready`. Tier 0 result is shown immediately.
2. At battle completion, a service-role database function atomically checks the 1-per-sponsoring-profile/day and 100-project-wide/day caps, then creates one `auto_free` `video_jobs` row with status `queued`. If capped, either player may use the paid/subscription overflow path.
3. Edge Function composes the provider prompt from both characters, both prompts, the winner, and tone hints derived from move types.
4. Edge Function submits to the video provider.
5. Job state: `queued -> submitted -> processing -> succeeded | failed`.
6. On success, the video is copied from the provider into Supabase Storage and a thumbnail is generated. Provider URLs are not used as long-term references.
7. Clients subscribe to the job via Supabase Realtime. The preview remains paused and muted; tapping Play cinematic starts fullscreen video and its generated audio together. Closing playback, leaving the screen or backgrounding the app pauses and remutes it.
8. Push notification fires when the video is ready if the user has left the screen.

### 8.4 Video Prompt Composition

Includes:

- Frozen character names, archetypes, appearance versions, visual descriptors, equipped signature items and approved artwork captured at battle start
- Battle theme
- Move types and matchup outcome
- Both complete, moderated recorded moves; structured moves retain action, intent and approach. Choreography depicts their ideas without changing the resolved outcome.
- Winner and loser framing
- Desired tone derived from archetypes and move types
- Runtime target: standard 8 seconds (Bo3 round) / 12 seconds (single); Plus 20 seconds. Policy is resolved and frozen when the job is created.
- Mobile-safe composition (vertical 9:16)
- Synchronized ambient and action sound effects; no dialogue, narration, lyrics or recognizable songs. Preserve provider audio in private base and final storage; publication remains gated by moderation.
- No real person likeness unless explicitly supported and consented
- Safety exclusions and platform policy constraints

Cinematic-v2/v3 stores a service-only immutable input per job, with stable P1/P2 reference mapping, exact frozen round moves, scene, winner/draw and policy. Signed URLs are refreshed before submission without changing the snapshot. Required fighter references must resolve; an item close-up may be omitted only when approved same-version fighter artwork already depicts it. Bot/starter and catalog references use content-addressed copies of the bundled app artwork. Missing or withdrawn assets fail the video safely with refunds; Tier 0 remains available. Legacy battles without identity capture are labeled as backfills and capture once per battle rather than pretending to recover their original appearance. Captions use the frozen clip outcome and duration. Under v3, Plus uses a 15-second reference-guided scene followed by a real 5-second generated continuation. The approved base is service-private and never published as the promised 20-second result. Durable stages prevent duplicate paid submissions, with a 300-second stage timeout and 600-second overall timeout. Failure at either stage refunds the original single funding unit. Existing v2 jobs retain their 15-second policy. The cinematic frame shows the preview and Play control without duration or round headings; cost and duration stay in the upgrade confirmation. Audio-on-play supersedes the earlier silent Tier 1 policy (2026-10-08 user request). Previously stored clips with removed audio remain silent; this change does not regenerate or rewrite historical media. Tier 0 remains silent.

### 8.5 Who Pays For The Video

Simple rule: video tier is per-battle, not per-player. One generation, both can watch with sound after tapping Play.

- The first eligible participant in deterministic player order sponsors the free automatic job, up to 1 automatic job per UTC day. The project-wide automatic circuit stops at 100 jobs/day.
- Automatic jobs spend no credits or subscription allowance.
- Either human participant's derived subscription entitlement qualifies the shared job for Plus duration, independently of who sponsors or funds it. Exhausted allowance does not shorten a Plus clip. Both participants watch the same clip; later entitlement changes never alter an existing job.
- Duration changes do not change billing units: one credit/allowance round remains one round. Preview and confirmation show expected duration and funding; a changed quote must be confirmed again before spending.
- When no automatic slot is available, either player can spend credits or subscription allowance to upgrade the battle; the other watches free.
- A player can also pre-commit to "always cinematic" in settings (auto-spend credits or use sub allowance).

The automatic daily taste anchors the hero experience while paid overflow remains a status / generosity moment.

### 8.6 Failure And Refund

- Pre-gen prompt moderation rejects unsafe prompts before any provider call. Credits are not charged.
- Post-gen video moderation runs before publishing to the result screen. Unsafe outputs are quarantined, the player is refunded, and the battle keeps its Tier 0 result.
- Provider submission failure retries with exponential backoff up to a small cap.
- Hard timeout (e.g., 5 minutes) refunds credits and keeps Tier 0 visible.
- Storage copy failure keeps the battle completed and offers a retry.
- All failures log a sanitized provider request ID for support.

## 9. Stats, Rankings, And Progression

Player stats:

- Total battles
- Wins
- Losses
- Draws
- Win rate
- Current streak
- Best streak
- Ranked rating
- Season rank
- Favorite archetype
- Prompt template usage
- Custom prompt usage
- Videos generated
- Shares initiated

Battle history:

- Opponent
- Character used
- Prompt type
- Result
- Score summary
- Video thumbnail
- Created and completed timestamps

Rankings:

- Global leaderboard
- Friends leaderboard later
- Seasonal leaderboard
- Archetype-specific leaderboard later
- Ranked tiers such as Bronze, Silver, Gold, Platinum, Diamond, Champion

Progression:

- XP for battle completion
- Bonus XP for wins and streaks
- Season rewards for rank placement
- Cosmetic unlocks
- Prompt mastery badges

## 10. Monetization

Primary MVP monetization: **credits + subscription**, layered with a **first-time-user offer** and a path to a **battle pass** in phase 4. Pricing below is directional and must be validated with live A/B tests; what matters here is the structure.

### 10.1 Credits

Credits gate video generation after the daily automatic slot is unavailable. Tier 0 (silent cinematic motion poster + scored card) and the capped automatic Tier 1 job are free.

- Onboarding grant: 3 free Tier 1 video reveals in the first 7 days so a new player experiences the hero feature without paying.
- Earned (the F2P spine, must support a daily-active free player to feel the hero feature roughly weekly):
  - Daily login streak credit reward (escalating, with a mercy day).
  - Daily quest completion (3 small tasks/day).
  - Win-streak milestones.
  - Season placement rewards.
  - **Judge a friend's battle** minigame: rate a public battle on the rubric; if your scoring agrees with the live judge within tolerance, earn a tiny credit, hard daily cap. This also produces calibration signal.
- Purchased: consumable packs.
- Refunds: automatic on provider or moderation failure.
- Cost transparency: credit cost is shown before prompt lock-in, never as a surprise after.

Indicative starting price ladder (validate live):

| Pack     | Credits | USD   | Notes            |
| -------- | ------- | ----- | ---------------- |
| Starter  | 10      | 1.99  | impulse          |
| Standard | 30      | 4.99  | store price      |
| Big      | 80      | 9.99  | anchor           |
| Whale    | 200     | 19.99 | rare buyer       |

One credit equals one **round** upgraded to video. Since every battle is Bo3, a three-round cinematic battle costs three credits; the free automatic job covers one shared cinematic per completed series.

### 10.2 Subscription

Single tier in MVP, branded **Prompt Wars+**. Indicative ~9.99 USD per month, ~59.99 USD per year. Subscriptions sell on identity and badge as much as allowance — Prompt Wars+ members display a visible badge on their character card and result reveals.

- Monthly video allowance large enough that an engaged daily player rarely runs out.
- Longer, 20-second shared cinematics when cinematic-v3 is enabled and either human has a current derived subscription entitlement at job creation. Show this benefit only while its server rollout is enabled; existing clips are not regenerated.
- Cosmetic frames, titles, avatar effects, and reveal styles.
- Priority queue, extra retention, and paid draft slots are not implemented benefits and must not be advertised. Local active-round drafts are available to every player.
- Never grants ranked stat advantage.

### 10.3 First-Time-User Offer (FTUO)

A one-time, time-boxed offer surfaced 24-72 hours after install for non-payers who completed at least one battle. Higher value than standard packs, exclusive cosmetic. This single mechanic typically lifts D7 ARPU meaningfully and should land in MVP.

### 10.4 Cosmetics And Battle Pass (Phase 4+)

- Cosmetic shop: frames, titles, avatar effects, badges and signature-color swatches. Strictly cosmetic. Reveal styles remain unavailable until a rendering surface exists.
- Shop separates preview from currently worn equipment, with category and owned filters and non-actionable collection tiles with explicit Preview. Buy/Equip/Remove are in the preview’s persistent footer and purchase confirmation remains. Two columns require width >=390 points and fontScale <=1.15; otherwise use one. Color ownership unlocks a deliberate choice in Identity; it never silently regenerates artwork.
- Astral Codex, Emberforge and Neon Circuit frames are epic cosmetics at 25 credits. Laureate is legendary at 40 credits or earned with 50 wins. Prior prices, earned paths and Founders exclusivity remain unchanged. Each new frame has a bundled portrait and circular-avatar variant.
- Cosmetics client contract 2 is required to list, purchase or equip the new frames. Missing client versions mean contract 1; legacy items remain usable. Catalog, ownership, wallet and equipment are server-owned. Purchase acknowledgment survives a failed catalog refresh, and retrying an owned purchase cannot charge again.
- Seasonal battle pass with free and premium tracks tied to play activity, not pay activity. Tracks should not require purchase to make play meaningful, only to unlock cosmetics.
- Paid challenge packs and sponsored prompt template events are optional.
- Rewarded ads only as a small free credit top-up path, with a hard daily cap, never on the result screen.

### 10.5 Purchase Layer

- RevenueCat via `react-native-purchases`, matching the local Remedy dependency.
- Server-side entitlement validation through Supabase Edge Functions before any credit grant or sub benefit is unlocked.
- Mirror RevenueCat events into Supabase via webhook for auditability and double-write safety.
- Battle integrity must never depend on purchase state.

### 10.6 Anti-Pay-To-Win Rules (Hard Constraints)

- No paid stat boosts.
- No paid scoring modifiers.
- No paid archetypes.
- No paid prompt templates that score better than free templates.
- No paid bypass of moderation.
- Subscription benefits are the implemented video allowance, badge, cosmetics and, only when its rollout is enabled, longer cinematics. Fighter/item fidelity and prompt-derived motion apply to all cinematic-v2/v3 jobs; they never influence judging or scoring. Do not promise priority generation or full-history retention.
- Paid idea rerolls remain available in ranked by explicit product decision. The current first suggestion set per battle/round/move is free; later sets cost the displayed credit price. Both use the same provider, quality policy and moderation. More suggestions do not guarantee a higher score; assistance availability is disclosed, and payment metadata is excluded from judging.

### 10.7 Conversion Principles

- First battle is free, fully featured (Tier 0), and impressive.
- Onboarding free credits guarantee at least one video reveal moment.
- Credit cost is transparent before lock-in.
- Failed generation never costs the player.
- Subscriptions feel like creative expansion, not a competitive requirement.

### Character editor contract (16 September 2026)

Edit Look uses visible Look, Fighter and Gear categories and a compact current-artwork preview. Its former collapsing stage is removed. All existing appearance traits, identity fields, art styles, owned signature colours, retained custom/legacy signature items, cooldowns and free stat respec remain. Selecting equipment stages it for free; including it in artwork requires a separate drawing. No new custom-item creation, unequip action or history retention entitlement is added.

The 20 September Gear presentation uses fifteen bundled gold/obsidian/violet item illustrations, a native equipment-chest glyph, a wide current-item banner and gold-edged image cards with explicit Preview actions. Item details reuse the same artwork. These illustrations are catalogue presentation, not new fighter renders or rarity/stat upgrades. Existing custom artwork remains intact. The category rail measures scalable labels and reveals its selected tab when horizontal scrolling is needed. See `docs/audits/2026-09-20-gear-parity/` for the visual comparison and validation record.

The 21 September consistency pass carries the same bundled item art into character creation without changing selection, grants or render costs. Fighter uses a compact archetype row with all presets in the existing bounded sheet, and Look uses illustrated style selection with scalable previews. Locked presets remain inspectable but cannot stage mutations. See `docs/audits/2026-09-21-screen-consistency/` for implemented fixes, remaining visual recommendations and the distinction between native fixture evidence and source review.

Back automatically preserves a versioned local draft scoped to authenticated account and fighter; explicit Save changes updates the server for free. The local record stores staged and baseline fields, independent written/guided choices, active description mode, category, disclosures and scroll positions, never signed media URLs. Untouched fields refresh from the server. Same-field remote changes require a comparison choice. Identity and look requests remain separate, and only successful fields are acknowledged after partial saves. Inactive written/guided work survives saving the active representation. Storage failures expose Retry and require an explicit discard before leaving without a saved draft.

Drawing is confirmed with live prices and remaining free initial-portrait allowances. Normal drawing saves applicable edits first; a failed save prevents generation. Shuffle explicitly describes replacing staged choices and clears them only after authoritative success. Unknown prices disable priced actions while free Look/Gear edits remain available. Active battle locks disable mutation handlers without hiding saved values, previews or Manage battles.

Paid drawing reserves a durable account/fighter/request key locally before dispatch and retains available job/result references. Reopened editors reconcile existing owner-readable records; Check status never calls generation. Network ambiguity remains Still processing, and result signing/loading can retry without another charge. A known terminal result whose local write failed is retried before acknowledgment; authoritative success wins over stale failure. Process termination before terminal evidence can be persisted remains safely pending for reconciliation, rather than treating missing rows as proof of no charge. Initial portrait reservation, moderation, provider refunds and avatar repair retain their existing server authority.

This update changes the client only. It introduces no schema migration, Edge Function deployment, entitlement, pricing rule, combat flag or audio-provider change. Android acceptance remains blocked pending a test environment. The scoped implementation and validation record is `docs/audits/2026-09-16-edit-look/IMPLEMENTATION.md`; version bumps and distribution are separate work.

## 11. Technical Architecture

Client responsibilities:

- Auth screens and session handling
- Character creation UI
- Prompt template browsing
- Custom prompt editor
- Battle status screens
- Result reveal and video playback
- Wallet and subscription screens
- Profile, stats, and rankings
- Push notifications for opponent submission and result readiness

Backend responsibilities:

- Battle creation and matchmaking
- Prompt validation and moderation dispatch
- Battle resolution
- AI video job creation
- Secure provider API calls
- Storage persistence
- Wallet transactions
- Purchase validation and entitlement sync
- Rankings and season aggregation
- Abuse reporting and audit logs

Supabase services:

- Auth: full anonymous guest access after eligibility, email, Apple and Google; optional linking secures the same player UUID without merging saves (combined release, see §22).
- Postgres: source of truth for gameplay state
- Realtime: battle/job status updates
- Storage: generated videos, thumbnails, avatar assets
- Edge Functions: matchmaking, resolution, moderation, xAI / aiX calls, purchase webhooks
- Row Level Security: restrict players to their own data and public leaderboard data

Suggested scripts based on Remedy:

```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "test": "jest",
  "test:ci": "jest --ci --passWithNoTests",
  "lint": "expo lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "supabase:login": "supabase login",
  "supabase:init": "supabase init",
  "supabase:link": "supabase link",
  "supabase:new-migration": "supabase migration new",
  "supabase:migrate": "supabase db push",
  "supabase:reset": "supabase db reset"
}
```

## 12. Suggested Supabase Schema

Core tables:

```txt
profiles
characters
prompt_templates
battles
battle_prompts
video_jobs
videos
wallet_transactions
purchases
subscriptions
rankings
seasons
moderation_events
reports
```

`profiles`:

- `id` references auth user
- `username`
- `display_name`
- `avatar_url`
- `rating`
- `current_season_id`
- `created_at`
- `updated_at`

`characters`:

- `id`
- `profile_id`
- `name`
- `archetype`
- `style_description`
- `avatar_asset_url`
- `cosmetic_config`
- `level`
- `is_active`

`prompt_templates`:

- `id`
- `title`
- `body`
- `category`
- `difficulty`
- `tags`
- `is_ranked_safe`
- `active_from`
- `active_until`

`battles`:

- `id`
- `mode`
- `status`
- `theme`
- `player_one_id`
- `player_two_id`
- `player_one_character_id`
- `player_two_character_id`
- `winner_id`
- `score_payload`
- `rating_delta_payload`
- `seed`
- `created_at`
- `completed_at`

`battle_prompts`:

- `id`
- `battle_id`
- `profile_id`
- `prompt_template_id`
- `custom_prompt_text`
- `prompt_type`
- `moderation_status`
- `locked_at`

`video_jobs`:

- `id`
- `battle_id`
- `provider`
- `provider_job_id`
- `status`
- `attempt_count`
- `request_payload_hash`
- `error_code`
- `created_at`
- `updated_at`

`videos`:

- `id`
- `battle_id`
- `video_job_id`
- `storage_path`
- `thumbnail_path`
- `duration_ms`
- `visibility`
- `created_at`

`wallet_transactions`:

- `id`
- `profile_id`
- `amount`
- `currency_type`
- `reason`
- `battle_id`
- `purchase_id`
- `created_at`

`entitlements` (derived view, source of truth for feature gates):

- `profile_id`
- `is_subscriber`
- `subscription_tier`
- `monthly_video_allowance_remaining`
- `cosmetic_unlocks`
- Legacy `priority_queue` fields, if present, do not represent an implemented benefit and are not advertised.
- `updated_at`

Server-side feature gates query this view, never raw RevenueCat or `subscriptions` rows.

`judge_runs`:

- `id`
- `battle_id`
- `judge_prompt_version`
- `model_id`
- `seed`
- `raw_scores`
- `normalized_scores`
- `winner`
- `is_tiebreaker`
- `is_appeal`
- `created_at`

`appeals`:

- `id`
- `battle_id`
- `profile_id`
- `status`
- `original_winner`
- `appeal_winner`
- `rating_reverted`
- `created_at`
- `resolved_at`

`rivals`:

- `profile_id`
- `rival_profile_id`
- `battles_count_30d`
- `last_battle_at`
- `is_manual_override`

## 13. Security, Safety, And Trust

Required safeguards:

- Enable RLS on all user and gameplay tables.
- Keep xAI / aiX API keys server-side only.
- Use Edge Functions or an equivalent secure backend for provider calls.
- Never trust client-submitted battle outcomes.
- Store locked prompts immutably.
- Moderate custom prompts before generation.
- Rate limit prompt submissions, battle creation, and video requests.
- Use signed URLs for private video playback.
- Provide report and block controls.
- Log moderation decisions and provider failures.
- Keep purchase validation server-side.

RLS principles:

- A player can read their own profile and public leaderboard profiles.
- A player can read battles they participate in.
- A player can insert prompts only for their own active battle slot.
- A player cannot update battle results directly.
- Only service-role Edge Functions can resolve battles, create video jobs, or grant paid credits.

## 14. Screen Plan

Onboarding:

- Welcome
- Auth
- Neutral age and country assessment; 13+ minimum with country-specific guardian consent after combined-release activation (legacy 18+ signup while disabled)
- Username
- Character archetype
- Character customization (battle cry, signature color)
- First free battle call-to-action (vs. bot, persona-disguised)

Main app:

- Arena dashboard (general battle entry, daily quests, streak meter, rival panel)
- Start battle
- Matchmaking
- Theme reveal
- Prompt picker (with opponent's last 5 move types + counter-pick win rate)
- Custom prompt editor (with voice-to-text)
- Waiting for opponent (with one-tap poke after 30 min)
- Result reveal (Tier 0 cinematic; Tier 1 upgrade CTA with cost shown before commit)
- Appeal sheet (1/day on ranked losses)
- Battle history
- Prompt journal
- Rankings (global and seasonal; no daily challenge in this release)
- Profile and stats
- Wallet and subscription (Prompt Wars+)
- Judge-a-friend minigame
- Settings (notification categories, accessibility, dyslexia font, locale)

Result reveal should prioritize the generated short video. Text explanation should support the video, not replace it unless generation fails.

## 15. MVP Roadmap

Phase 1: Concept prototype

- Create Expo app scaffold
- Implement app navigation skeleton
- Add Supabase auth
- Build character creation screens
- Seed local prompt templates

Phase 2: Playable async MVP

- Add battle tables and RLS
- Implement matchmaking or challenge flow
- Add prompt lock-in
- Resolve battles server-side
- Show result summaries without video

Phase 3: AI video integration

- Add video job pipeline
- Integrate xAI / aiX provider adapter
- Store generated videos
- Add result reveal playback
- Add retries, timeouts, refunds, and fallback result states

Phase 4: Stats, rankings, and economy

- Add rankings and seasons
- Add stats screens
- Add credit wallet
- Add purchase and subscription flows through RevenueCat
- Add server-side entitlement validation

Phase 5: Retention and polish

- Push notifications
- Sharing
- Rematches
- Cosmetic progression
- Moderation/reporting improvements
- Manual QA on iOS and Android

## 16. Acceptance Criteria For First Build

The first playable implementation is successful when:

- A new user can sign up and create a character.
- A user can start or join an async battle.
- A user can select a predefined prompt or submit a custom prompt.
- A battle waits for both prompts before resolving.
- The backend determines and stores the result.
- A video generation job is created after resolution.
- The result screen can display generated video when available and fallback content when not.
- Stats update after battle completion.
- Rankings can show at least a basic ordered list.
- Credits are consumed and refunded correctly for video generation.
- Subscription entitlement can grant monthly credits or cosmetic access.
- xAI / aiX keys are never exposed to the mobile client.

## 17. Key Risks

- AI video cost may be too high for frequent free battles.
- Provider generation latency may make result reveals feel slow.
- Moderation must be strong enough for user-generated prompts.
- Prompt quality scoring can feel unfair if not explained carefully.
- No paid stats, scoring modifiers, or archetypes. Paid additional suggestions are explicitly retained with truthful assistance disclosure; do not claim their access is competitively neutral.
- Storage and bandwidth costs can grow quickly if videos are permanent.
- App store review may scrutinize AI-generated content, subscriptions, and user safety flows.

## 18. Recommended Next Step

Start with a non-video async battle prototype. Prove the core loop first: character creation, structured prompt + move type, LLM-judged resolution with visible rubric, Tier 0 result reveal, stats, and rankings. Bot opponents from day one so the prototype is playable solo. Attach the Tier 1 video pipeline only after the gameplay state machine, judge stability, and anti-collusion guardrails are proven.

## 19. Cold Start, Bots, And Matchmaking

The starter path provides a resumable guided Bo3 practice match with immediate bot behavior. Contextual hints teach the actual game and can be dismissed or replayed later.

- Bot opponents seeded with a curated, archetype-appropriate prompt library, **separate from the human-facing template library** so users cannot memorize bot prompts.
- Each bot has a consistent persona: name, archetype, avatar, battle cry, signature color. All battle surfaces clearly identify it as an AI opponent / Practice.
- Guided practice uses the normal scoring and combat rules. Do not force a win or secretly alter scoring for onboarding.
- After the first payoff, invite customization and offer Battle Again or Arena. A new match starts only after the player chooses it; there is no automatic enqueueing.
- Matchmaking falls back to a bot if no human match is found within 60 seconds.
- Bot wins do not grant ranked rating but do grant XP and credits.
- Bots have a consistent name and an AI opponent / Practice label throughout entry, battle and result.
- Bot prompt pool is curated by the team, never from real player submissions, to avoid consent and content-rights ambiguity.

Matchmaking pairing rules:

- Initial rating band: ±50 Glicko points.
- Widen by ±25 every 15 seconds.
- Hard cap: ±400.
- Bot fallback at 60 seconds if no human in band.
- Newbies (under 10 ranked battles) only matched to other newbies or bots.
- Avoid same-opponent pairing within a 24h ranked window.
- Avoid pairing accounts on the same network or device fingerprint in ranked.
- Arena uses general matchmaking; a daily challenge and separate daily pool are outside this release.

## 20. Retention And Notifications

Async games live and die on push. This is not optional polish. iOS 17+ Focus filtering and Android adaptive notifications punish over-sending, so cap aggressively.

Core push events:

- **Battle result ready** (must-send; the only category that ignores quiet hours by default off, opt-in to override).
- Opponent submitted, your turn.
- Cinematic video ready (if Tier 1 was requested).
- Daily quest available.
- Season ends in 24h, claim rewards.
- Friend challenged you.
- Daily-challenge notifications are outside this release.
- Rival is online.
- Opponent has been idle 30 min (one-tap "poke," sender-initiated).

In-app retention surfaces (all in MVP, not deferred):

- Daily quest list (3 small tasks, refresh daily, with reward sizes balanced against §10.1 F2P spine).
- Streak meter with one mercy day per week.
- General Arena entry; the battle theme is revealed after matching.
- Best prompts and Stats insights describe their actual recent-data sample (latest 50 battles / 200 prompts); they are not a permanent saved journal.
- Rival panel: most-played opponent over 30 days, head-to-head record, quick rematch.
- Spectate feed of recent public battles (default off in MVP, on by phase 4).

Notification rules:

- Frequency cap: **max 2 per day default**, hard cap regardless of categories.
- `result_ready` is the only must-send category.
- Per-category opt-out in settings.
- No notifications for monetization-only nudges in MVP.
- Quiet hours respected by default.
- Account-farm guard: FTUO and onboarding credits gated by passing a lightweight signup-time anti-abuse signal (device fingerprint, IP velocity, attestation where supported).

## 21. Spectate Feed And Social Sharing

User-generated battles are free content; expose them. Most shares on TikTok/Reels are images, not videos, so both formats must ship.

- Public battles can opt in to a global "recent battles" feed (default off in MVP, on by phase 4).
- Players can like and share battles.
- Share export, both formats:
  - **Vertical 9:16 video** with watermark and a deep link to the app (Tier 1 battles).
  - **Scored result-card image** with character portraits, signature colors, battle cry, scores, and a deep link (every battle, Tier 0+).
- Friend invite via deep link awards both inviter and invitee a small credit grant after the invitee finishes their first battle.
- ~~All shared content carries an AI-generated content disclosure to comply with platform policies.~~ **Removed 2026-08-26** by product decision. The in-app AI badges (reveal poster, result card, portrait frame) and the AI-tagged share filename/title were deleted, and the corresponding claims in `landing/index.html`, `privacy-policy.html` and `terms-and-conditions.html` were rewritten so nothing published asserts labeling the app no longer performs. `videos.is_ai_generated` is retained as an internal record only.

> **Store-review note:** this was a deliberate trade. AI-generated UGC is a high-scrutiny category (§22 below), and an explicit disclosure was the strongest argument at submission. If review pushes back, the badges are the thing to restore first.

- Hashtag and ASO guidance: "AI battle video" trend keywords drive TikTok/Shorts as the primary acquisition funnel; share captions are pre-filled with handle + hashtag set.

## 22. Safety, Moderation, And Platform Compliance

AI-generated UGC video is a high-scrutiny category for app stores. Moderation must be defense-in-depth, and compliance posture must be explicit at submission time.

Store-readiness commitments (must be reviewable by Apple/Google):

- **Approved audience replacement, 2026-09-22:** target users aged **13+ worldwide**, with country/subdivision-specific eligibility, required age assurance, and verified guardian consent where needed. Under-13 registration is rejected. The target does not imply every region is ready or an automatic 13+ store content rating.
- **Disabled rollout:** Apple/Google native authentication and the new eligibility flow form one release. Keep it disabled until provider credentials/onboarding, versioned regional policies, enforcement checks, revised notices and truthful store declarations are ready. Existing 18+ signup and public legal pages remain only for legacy compatibility while this release is disabled; do not silently lower the live gate or publish the staged audience notices early.
- **Server authority:** missing or unapproved regional policy, required assurance that is unavailable, and absent/denied/expired/revoked consent block registration and protected capabilities. No client metadata, social-login email, redirect, or local checkbox establishes eligibility. Existing accounts retain access under the disabled release, then receive the required server eligibility assessment on activation.
- **Full guest access, 2026-09-30:** Play now creates an anonymous Supabase account only after the shared eligibility, required consent and terms flow. Guests have the same battles, rankings, progression, generation, rewards, purchases and subscriptions as linked players under normal policy/anti-abuse rules. Optional Apple/Google/verified-email linking retains the same UUID; conflicts keep saves separate. No automatic account or purchase transfer. Remind players that losing an unlinked device session can lose access to server-stored progress. Guest intake has a separate disabled-by-default switch; disabling intake must preserve existing guest access and eligibility enforcement. Do not delete accounts solely for remaining anonymous or inactive.
- **Guardian consent:** KWS is the selected provider. Parent Verification establishes adult status only; full Consent Management requires separate onboarding and a confirmed protocol. Until that integration exists, consent-required registrations remain pending with `consent_unavailable`. Do not fabricate provider approvals. Retain minimal versioned consent evidence, support revocation, and keep signup and purchase permission separate.
- **Data and publication:** use date of birth transiently for the age decision; protected records store the assessment, next birthday, regional policy and consent evidence, not a raw DOB field or identity documents. Treat those derived records as personal information. Publish the prepared legal notices in `landing/release-social-auth/` atomically with activation, following its README. [Audience release requirements](TEEN_AUDIENCE_FEASIBILITY.md) and [KWS integration status](KWS_SETUP.md) record the remaining prerequisites.
- All UGC video previews are **blurred until post-gen moderation passes**.
- UGC report SLA: under 24 hours from report to reviewer action.
- ~~AI-disclosure label on every reveal, every share, every public profile asset.~~ **Removed 2026-08-26** — see §21.

Moderation pipeline:

- Pre-gen moderation on prompts: text classifier plus blocklist; reject before any provider call.
- Per-prompt safety constraints injected into the video provider call.
- Post-gen moderation on the generated video: scene classifier and unsafe-content checks before the video is shown; preview blurred until checks pass.
- No real-person likeness unless explicitly supported and consented.
- Report and block flows on every battle, profile, and shared video.
- Human review queue for reported content with the 24h SLA above.
- Region-aware content rules where required.
- Audit log of moderation decisions, retained per platform requirements.
- Do not advertise subscriber-only full retention or free automatic pruning: no retention product is introduced by this release. Battle history is cursor-paginated independently of media loading.

Localization & judge fairness:

- Judge rubric and prompt instructions must be localized per supported locale to avoid English-bias scoring. Calibration set is mirrored per locale.
- Battles are matched within locale where pool size allows; cross-locale ranked battles use an English-normalized judge call with reduced rating swing.

## 22a. Accessibility

Product-readiness for store features and broad reach requires accessibility from MVP.

- Dynamic type support across all screens.
- Voice-over labels on the result screen and all primary CTAs.
- Captions auto-generated on every Tier 1 video.
- Color-blind-safe move-type icons (shape + color, not color alone).
- Visual migration 1.3.0 bundles Barlow Condensed Bold for names/compact headings and ExtraBold Italic for major headings/outcomes, with SIL OFL included. Prompts, forms and detailed explanations keep 16-point system text and OS scaling; unsupported scripts/font failure fall back to system text. No in-app font preference is added.
- Voice-to-text supported in the custom prompt editor for users for whom typing on mobile is the friction.

## 23. Telemetry And Analytics Events

Minimum viable event taxonomy (all events versioned, all PII scrubbed):

- `app_open`, `session_start`, `session_end`
- `signup_started`, `signup_completed`
- `onboarding_step_view`, `character_created`
- `battle_created`, `battle_matched`, `battle_bot_matched`
- `theme_revealed`
- `prompt_template_selected`, `custom_prompt_submitted`, `prompt_locked`
- `prompt_moderation_blocked`
- `battle_resolved` (with winner, scores, judge version, calibration accuracy at time of run)
- `appeal_submitted`, `appeal_resolved`
- `result_tier0_viewed`
- `video_upgrade_requested`, `video_job_started`, `video_job_succeeded`, `video_job_failed`
- `result_tier1_viewed`
- `share_initiated` (format: video | image), `share_completed`
- `daily_quest_completed` (achievement distinct from reward claim)
- `judge_minigame_played`, `judge_minigame_credit_earned`
- `rival_assigned`, `rival_rematch_started`
- `iap_paywall_view`, `iap_purchase_started`, `iap_purchase_succeeded`, `iap_purchase_failed`
- `subscription_started`, `subscription_renewed`, `subscription_cancelled`
- `ftuo_shown`, `ftuo_purchased`, `ftuo_dismissed`
- `notification_sent`, `notification_opened`, `poke_sent`
- `report_submitted`

All battle and judge events include the frozen judge prompt version so balance and fairness can be debugged historically.

## 24. KPIs And Success Targets

Directional MVP targets for a brand-new IP with no audience advantage. Set so missing them triggers an honest pivot, not reassurance. Top-decile aspirations are tracked separately.

Launch targets (must hit to continue investing as designed):

- D1 retention: **25-30 percent**
- D7 retention: **8-12 percent**
- D30 retention: **3-5 percent**
- Median battles per DAU: 3+
- Automatic Tier 1 enqueue success rate on eligible battles: above 95 percent; paid overflow upgrade rate: 10-18 percent
- Free-to-paying conversion by D14: 2-4 percent
- ARPDAU: 0.08-0.15 USD initially, scaling with battle pass
- Subscription monthly churn: under 14 percent
- Crash-free sessions: 99.5 percent
- Median time-to-first-battle from install: under 3 minutes
- Median time-to-result-reveal after both prompts locked: under 5 seconds for Tier 0, under 90 seconds for Tier 1
- Moderation false-negative rate on shared video: under 0.1 percent
- Judge calibration accuracy: above 90 percent on the frozen calibration set, checked nightly
- Appeal flip rate: under 5 percent (above this means the judge is unstable)
- Cost per resolved battle (Tier 0 only): under target threshold; circuit breaker if exceeded

Top-decile stretch (signals the game is breakout, not a benchmark to plan around):

- D1 35%+, D7 15%+, D30 6%+
- Tier 1 upgrade 25%+
- ARPDAU 0.20+ USD


### Client visual migration — 1.3.0 (September 2026)

The approved collectible-arena direction covers all 21 existing screens, startup, app-owned overlays, free result cinematics, splash and newly exported share cards. Shared native controls use obsidian surfaces, gold ornament, lavender actions and a bundled Barlow Condensed display family; detailed text stays system-readable. Profile owns the current fighter card and stats; Arena prioritizes actionable rounds and progression; battles reuse server snapshots and measured cosmetic-frame apertures. Compact portraits use avatar art; full fighter art is contained. The raised center Battle action stays in the persistent tab bar. Mockup parity uses a custom vector icon family, metallic native-text headings, four equal divided stats with deliberate accessible 2×2 layout, mirrored duel plates, visible theme illustration and a quill lock-in action. Shop uses a compact expandable wearing strip, underlined category tabs, joined All/Owned filter and a ruled fairness footer after the collection. Native system controls remain native; all data and recovery contracts are unchanged. Essential result/modal actions remain outside scrolling optional detail. Motion is finite and stops offscreen; lists/writing are steady.

Scope is client presentation only: no schema, Edge Function, matchmaking contract, combat/appeal rollout-flag or pricing/entitlement change. Retain paid ranked suggestion rerolls, free allowance and truthful assistance copy. App icon, generated-video branding and audio-provider work are unchanged. Font/splash native integration and offline cold start require native acceptance before TestFlight/Android internal distribution. See DESIGN_LANGUAGE.md and VISUAL_MIGRATION_ACCEPTANCE.md for implementation and release checks.

### Complete visual audit remediation (21 September 2026)

Metallic headings use one native glyph layout as a mask, with solid text for unavailable fonts/masking or unsupported scripts. Opaque stack headers own their safe boundary; custom headers stay above scroll content. Banners use a full-width message and a separate utility action. Results use short outcome labels and one series score; a no-contest verdict never shows the old score, winner or knockout as current. Result exports wait for the frozen fighter/avatar/frame artwork and fonts, and invalidate when the adjudication revision changes. Profile's full-size export remains independent of screen sizing.

The writing workspace has one Ideas / Write your own selector, visible allowance/live price and optional Writing tips. Creation shares illustrated art-style and archetype choices with the editor while retaining an initially unselected preset, all choices and its own progression/allowances. Welcome's two entry actions stay outside its scrolling content. Safety actions sit within the row frame, as independently focusable siblings of human navigation targets. Both Shop signature-colour links target Fighter / Signature color without replacing the draft.

These are presentation changes only. The masking native module is the only added dependency. No new backend contract, deployment, version bump or distribution is included. The findings-to-fixes and native evidence ledger is `audits/2026-09-21-visual-remediation/README.md`; unavailable native states remain open rather than being inferred from unit tests. Android checks remain blocked until a test environment is available.


### Presentation refinement: heroes, avatars and environments (21 September 2026)

Profile prioritizes fighter identity, four stats and customization/cosmetics actions by budgeting screen artwork to 180–320 points, including the battle cry inside the caption. Arena no longer repeats the fighter card. Full-size export rendering is independent of the visible hero. This presentation change does not alter builds, equipment effects or battle snapshots.

The authenticated `sign-player-avatars` read endpoint accepts profile/battle identifiers (50 combined, after deduplication), returns opaque asset IDs, expiring signed URLs and availability/retry status. Profile entries additionally expose the active fighter's public-facing identity and cosmetics for Rivals. Battle entries require participation and use the recorded opponent avatar. Both block directions, current moderation approval, avatar kind, character and profile ownership are checked before private-storage signing. No migration or client table-write permission is added. Existing `sign-battle-portraits` remains compatible. Deploy the endpoint before a later client distribution; missing endpoint/error retains list browsing and fallback art.

The client caches by account and identity context with opaque asset references, coalesces page/row requests, refreshes before expiry and revalidates on focus/foreground. Transient failures preserve known art; explicit unavailability clears it. A retry signs/loads the same permitted asset and cannot generate, repair or spend.

Visual mapping: impossible challenge → Frozen Void; weakness into strength → Ember Forge; calm before the storm → Storm Citadel; victory from defeat → Verdant Reactor; precision over power → Neon Nexus. Unknown themes select deterministically among six environments; missing themes use Neon Nexus. Astral Temple remains available through that fallback. Twelve bundled images total 2,153,283 bytes. Audio selection and generated videos are unchanged.

### Shared visual system and screen refinement (22 September 2026)

Arena shows actionable battles, quests/streaks, standings/rivals and existing secondary content/offers. Profile owns fighter artwork, stats, battle cry and editing/cosmetics actions. Four compact tab headers share an account-scoped balance reader; secondary screens share one Back/header owner. Ordinary cards use restrained double-gold GamePanel/GameBevel geometry, with stronger emphasis for selected/major outcomes. Human and bot battle rows stay full width; Safety remains a separate control inside the frame.

Diamond amounts replace routine credit abbreviations in balances, prices, rewards and the framed wallet ledger. Credits remain in spoken labels, native dialogs and explanatory copy. Unknown amounts are unavailable, never zero; delayed purchases/status checks retain existing idempotent recovery. No prices, paid ranked suggestion policy or entitlements change.

Edit Look retains all trait keys and written/guided drafts. Vibe (6), Silhouette (6), Era (5) and Expression (6) open bounded illustrated choice sheets. The 23 bundled 512-pixel JPEGs total 1,095,473 bytes and are reference examples rather than player previews. Palette gradients and larger archetype art are presentation only. Gear retains every item and Browse all without search. Routine Free suffixes are omitted; Save changes updates the server and Review & draw always reviews allowance, live cost and cooldowns. Included allowance reads “N included draws remaining.” Keyboard entry hides artwork and switches the footer to Save changes / Done; Done dismisses without saving. Old accordion draft metadata is ignored without removing values.

Battle environments extend behind system bars, with safe header controls and a scrim. Arena parking is separate from mode-appropriate Battle options. Round impact uses authoritative, perspective-correct HP/damage; unsupported legacy values are omitted. Final results order current verdict, approved cinematic/status region, framed rewards, then visible theme/round statistics and Result info; unpurchased video offers follow rewards. KO detail remains available, and reviewed/no-contest/exhibition states stay explicit. Reordering never generates or spends. Historical videos remain labelled, with current adjudication enforced for sharing.

This update contains client code and bundled assets only: no backend contract, migration, dependency upgrade, rollout-flag change, version bump or submission. Native and automated evidence is recorded in `audits/2026-09-22-shared-visual-refinement/README.md`; Android validation remains blocked.

Native layout refinement: at accessibility text sizes, editor preview/status scroll with the form so controls remain reachable. During keyboard editing, the preview and wallet shortcut hide and the footer presents Save changes / Done; Done only dismisses. These adaptations preserve input instances, drafts and category state. The implementation evidence and incomplete native acceptance matrix are recorded in `docs/audits/2026-09-22-shared-visual-refinement/README.md`.

### Battle-result presentation refinement (2026-09-23)

The result summary restores the bundled wordmark and battle-snapshotted fighter identities/equipment. Its order is verdict with authoritative final HP, compact cinematic/status, sharing/replay, rewards/progress, eligible video offer, then the visible illustrated theme and round statistics, Result info and appeal/safety. The paused contained preview opens native full-screen playback only on explicit Play; exiting/backgrounding pauses and preserves position. Captions/transcript UI and caption reads are removed only from the result route; stored media, free reveal, moderation and generation remain unchanged. Compact rewards reflect existing server records without inventing payouts or replacement ratings. The Result info sheet contains recorded progress, eligibility, quest titles and available deciding/judge/move explanations from already-loaded data. View quests dismisses it before opening Arena without claiming rewards. No-contest keeps explicitly historical Played rounds; legacy single battles omit the round list. This is a client refinement with no backend, economy, rollout or release change.

### Loading, round results and claim controls (2026-09-26)

Startup aligns its Arena glyph beside Opening your Arena while retaining scalable text and route-gate behavior. Between-round results show every breakdown card without expansion: outcome/series, viewer-oriented Round score, HP/damage, next deadline, modifiers, rubric, judge explanation and optional round reveal. Scores use at most three decimal places without trailing zeroes; unavailable scores are omitted. Continue stays pinned and terminal rounds still route to the final result. The final result's Result info sheet remains unchanged.

Cinematic waiting, slow and recovery feedback is grouped inside one shared gold panel without changing generation, moderation, playback or retries. Quest Claim uses the lavender beveled button with a signed diamond amount and the same server claim handler, busy state and failure recovery. This client presentation change includes no backend contract, economy, version or release change. Verification and native evidence are recorded in `docs/audits/2026-09-26-round-controls/README.md`.

## 25. Versioned prompt composer — 1 October 2026

This section is authoritative for `prompt_experience_version = 2`. It supersedes earlier descriptions of prompt authoring and judge criteria only for that experience. Existing nullable/version-1 single and Bo3 battles retain their original workflow and judge policy. The subsequent user decision on 1 October 2026 removes the six composer rollout flags and enables new practice/tutorial, casual/friend and ranked series, AI suggestions and explicit paid rerolls by default. It also removes automatic primary-calibration blocking of new ranked assignments. This supersedes the original staged/default-off plan; it does not certify unperformed calibration or human testing. Implementation and evidence are tracked in [the composer plan](plans/2026-10-01-prompt-composer-implementation.md) and [release runbook](plans/2026-10-01-composer-release.md).

### Experience, context and compatibility

The game remains asynchronous Bo3, with the existing deadlines, move types, stats, HP, damage, type counters, tie resolution and rating rules. The composer does not introduce card consumption, live opponent reactions, a typing timer or predicted scores. Server assignment freezes three separate fields for the whole series: `prompt_experience_version = 2`, `judge_policy_version = v2.0.0-ideas`, and `situation_catalog_version = 1`. Combat `rules_version` remains independent. Legacy assignment is experience 1, judge `v1.0.0-mvp`, and no situation catalogue.

Client contract 3 supports the new experience. Incompatible clients must update before creating, accepting, submitting to or requesting another round of a composer battle. Existing queues, invitations, retries and active series keep their stored version. Human matchmaking pairs compatible experience and combat versions. Every newly assigned series uses experience 2 in all supported modes without a composer enable flag; resuming a stored legacy assignment remains legacy.

Each new round receives an immutable `situation_snapshot = {id, catalogVersion, environmentId, text}` in the same server transaction that opens its deadline. The initial authored catalogue has three neutral 20–35-word situations for each of the five existing themes, 15 total. Each gives concrete scene facts and two or three possible affordances without prescribing the player's action. Server-seeded selection does not repeat a situation within the three-round series. Published theme, catalogue version and snapshots cannot change retrospectively.

The exact snapshot is shared by both players and reused by suggestions, the practice bot, all judge calls, appeals, resolved-move review and video composition. Bot policy is pinned independently on each series. Existing series, queues and invitations retain policy 1. New experience-2 Bo3 assignments use policy 2; legacy-experience and single-format rows retain policy 1. Policy 2 creates a private random 32-byte seed and pins its private catalogue at series creation, including human queues. Each round transaction copies one of 45 versioned scene/type tactics into an immutable private choice before accepting a human prompt. Selection never uses human text; bot fallback and retries read the copied choice. Missing policy-2 choices fail closed for recovery. Private state has RLS, no client grants or Realtime publication, and is excluded from the mobile archive. Current opponent prompts remain hidden. Optional opponent history shows at most five resolved human moves, oldest first, collapsed by default; bots and empty/unavailable history are omitted.

### Authoring and recovery — Face-off refinement, 7 October 2026

Five separate views share one existing battle route: **Face-off → Action → Intention → Approach → Your move**. A new round starts at Face-off with the full versus panel, portraits, HP, round, theme and complete Shared situation. Build move is the default for a new account; a restored draft and then the account preference take precedence. Face-off owns the Build move / Write your own choice and explicit Next. Later views use a compact battle status. Theme and the entire situation remain expanded, scrolling with the form; the keyboard hides only decorative art.

Action asks “What do you do?” and first requires an explicit Attack, Defense or Finisher choice. No type is selected initially. Only the selected type's three actions appear on this same view. Intention presents three compatible goals and a collapsed Your choices recap of the selected action. Approach presents three methods, timings or situation uses, with the action and intention in the same collapsed recap. Expanding its framed header reveals exact, untruncated text in labeled rows with a divider. Expansion is local presentation state: another view or changed parent resets it, while selecting the current step preserves it. Theme and Shared situation remain fully expanded, and Your move still shows the complete final prompt. Selection highlights without advancing. These views are selection-only: no custom fragments, editing, provenance badges, inspiration filters or All ideas controls. Explicit Next requires that view's selection. Your move shows the exact prompt/type, Back and HOLD TO LOCK IN, without Change/Edit/Undo shortcuts. The prompt is in one always-open frame with an integrated move-type header: the existing semantic-colour icon sits beside a neutral label, with a divider below instead of a separate full-width badge. Complete, consistent builder text is divided into Action, Intention and Approach with labels and separators; manual or inconsistent text stays a single exact block. The character count and submitted payload still use the canonical final text, and the review never rewrites or infers fragments. Three selected fragments join with single spaces without AI rewriting; action is 5–240, intention 5–180, approach 5–240 and the final prompt 20–800 characters. The authored fallback retains 135 actions, 405 intentions and 1,215 complete paths across 15 unchanged situations.

The independent **Face-off → Write your own → Your move** path provides the full editor, character count and explicit type selection. Both paths retain their own buffers. First manual entry copies the current move only if no manual version exists; subsequent switches restore each version. Switching mode happens at Face-off. Back from review returns to Approach or Write as appropriate, then earlier decisions; Back from Action or Write returns to Face-off, and Back from Face-off parks the draft. Android Back first dismisses an open keyboard. Compact progress shows the current step name and count with four slim segments; it never lays out all four labels as a wrapping row or acts as another navigation menu. Move types reuse the compact icon-and-label segmented control without selection checkmarks. Writing tips expands within its owning frame below a subtle divider. One full editor remains mounted and is visible/editable/accessible only in Write.

The reducer owns type, all fragments and identifiers, revision, completeness and visited branches. Previously visited identical types/actions/intentions restore their selected descendants, including purchased child hints. A new parent requires new descendant choices. Back/Next never change prose. Incomplete branches cannot send an old final text under new choices. Late hints are bound to account, battle, round, type and exact parents; applying a new bank does not choose a fragment or change the current text.

Draft **v5** remains scoped to account, battle and round, storing the active view (including Face-off), mode, visited branches and separate buffers without copying the whole suggestion tree. Older drafts with custom builder fragments open in freestyle with exact text/type preserved, archive their builder buffer and preserve an existing manual buffer for recovery. Complete old two-part drafts also open in Write; incomplete selection drafts resume at the first missing decision. Migration never infers structure from prose. Earlier drafts in Write exposes migrated archive buffers; an explicit swap preserves the displaced current text/type. Restored drafts override account preference; fresh rounds start at Face-off. Serialized saves, tombstones and scope guards prevent resurrection after accepted submit. Autosave stays silent; storage/recovery failures retain visible Retry. Missing authoritative situation blocks lock-in. Hold is bound to composer revision, text, type, view and scope.

Review alone exposes **HOLD TO LOCK IN**, retaining the existing 600-millisecond hold. Early release, text/type/stage/mode/scope change, backgrounding, accessibility-mode change or loss of the current live round cancels it. Closed battle/round, current-round advancement and the deadline directly participate in authoring and submission guards, including a fresh check at timer completion. A completed ordinary hold submits directly. Screen readers use tap plus the existing bounded exact-prompt/type confirmation. Changed snapshots, duplicate activation, stale scope and in-flight submission cannot submit again. Failed or uncertain submission retains its text and the existing server-accepted-response recovery path. Stage navigation dismisses the keyboard and focuses the current heading; one keyboard/safe-area owner retains the Android conditional-padding fix.

### Free choices and explicit paid suggestions

AI banks are primary. Cache appears immediately; no cache shows waiting plus own writing. The Action preparation indicator says “This may take a few seconds.” and reflects the real operation, without simulated progress. The current client has no Use starter ideas shortcut, including after eight seconds or on error/offline, and never automatically substitutes catalogue choices. Initial failure shows Check ideas for a free retry of bank read/recovery, with a busy state during the request. It never starts a paid reroll. The error stays visible and Back → Face-off keeps Write your own available. Paid-request recovery controls remain separate. Each type has one active three-action bank. Late initial/free AI displays automatically in the matching builder context without Use new ideas or Use updated set. Results arriving during manual writing or blocked submission stay pending until that builder is active again; a failed submit re-enables delivery. Exact-bank extensions update only compatible hints. Displaying options cannot replace selected fragments. Explicit refreshes follow the same automatic display behavior below. Per-type failure preserves other successful banks. Own writing remains free; the versioned catalogue remains available to compatibility paths and existing saved choices.

Face-off starts preparation when Build move is selected. The client first reconciles all three owned free banks and in-flight operations, then sends missing types as separate authenticated single-type `ensure_free` requests, at most three concurrently. Next and type changes do not create another generation; staying in Write does not start one. Cache and independent purchase journals remain mounted across views. Client contract 3, structureVersion 2 and compositionVersion 3 remain unchanged: each bank contains three actions × three intentions × three approaches (27 paths, 81 across types). The older bulk API remains compatible, but this client does not use it or privileged two-player prefetch. Cache/pending reads cost no attempts; three generated banks consume three shared 30/hour and 90/day units. Failure or delay of one type preserves the others.

Each decision has an explicit purchase with a confirmed live price: **3 new actions · 1 credit**, **3 new intentions · 1 credit**, or **3 new approaches · 1 credit**. Existing test-account waivers display their effective zero price. An unknown or nonstandard price blocks a new purchase. Action reroll uses `generate-move-suggestions` and returns a complete three-action bank, preserving the type. `reroll-move-step-suggestions` accepts target intent or approach, exact parents, scope, type, idempotency key and expected credits. Intent returns three new intentions with three approaches each, preserving the action; Approach returns three new approaches, preserving action and intention. Server context is authoritative, and generation cannot rewrite parents. Successful explicit refreshes automatically replace the matching choice list with the three delivered options, without an extra Use new ideas step. This also applies to recovered purchases and zero-credit test waivers. Step results are durably saved before replacing visible options. A result for another type or parent waits in its own context and appears automatically on return; it cannot update a different branch. Delivery never automatically selects a fragment. The old selected move remains until the player selects a replacement.

The new paid-step endpoint has private operation/attempt tables, service-only RPCs, RLS, shared attempt limits and separate lease/fencing/recovery. Client journals are saved before a possible debit and indexed by account/round, type, step and exact parents. A restart or lost response replays the same key. Pending/uncertain purchases remain recoverable across navigation and even after round closure; a new purchase waits for recovery. Storage failure cannot start a charge. Successful retry returns the original result and paid price even if catalogue/configuration changes; expired blocked recovery retains its operation identity instead of masquerading as a rejected new purchase. These operations do not consume the legacy six free adaptations.

`complete-move-suggestion` remains unchanged for older clients. It supports free custom-fragment adaptation with six delivered operations per round, a maximum of three attempts per context and the shared rate limits. This selection-only client never calls it. Existing free and paid banks can still be enriched idempotently with Approach via exact owned `suggestion_set_id`, preserving original text, IDs, status and price. Enrichment failure preserves that bank and offers recovery or Face-off → Write; it does not consume the adaptation quota or turn failure into a new purchase. Initial composition3 generation retains its 45-second and 4,096-output-token budget per type. Moderation retains its overall 60-second deadline, all fragments/reachable triples and legacy pairs. Prefixes are data, never system instructions.

`ensure_free` never charges, including omitted legacy operation fields. Every paid action requires a known effective price and explicit confirmation. Unknown prices block purchase only, leaving composition available. No purchase is triggered by Next, Back, selecting a type/fragment, fallback or automatic recovery with a new key.

The server atomically checks current price, binds the operation to its owner and battle/round/move, reserves the slot and debits the ledger. Replays recover the original operation and price before new-request feature/price checks. Renewable worker leases and fencing protect generation, completion, failure and refund; a stale worker cannot overwrite a newer result or refund its spend. Moderation validates each title (3–48 characters), action (5–240), intention (5–180), body and complete pair (20–800), then deduplicates classifier texts without concatenating alternatives. All three cards must pass; absent or partial classifications fail closed. Batch-capable providers classify arrays; other adapters use at most four parallel calls. The 60-second overall deadline includes fallback and worker renewal spans the complete pipeline. Audit reports unit kind/reason without analytical prose. Publication is atomic before owner submission, round closure and deadline, using current time after battle → round → suggestion serialization → operation locks, then wallet. Late delivery ends as prompt_locked_before_delivery or round_closed_before_delivery and refunds paid operations once. Previously successful replay stays successful after closure or a lost response. The sweeper follows the same lock order. Paid failure or moderation refusal refunds once; abandoned reservations are swept, including after a battle ends. No authoring source, subscription, purchase or amount is supplied to the judge.

### Judge policy and evidence

Version dispatch selects different provider instructions rather than relabelling an identical prompt. Both primary runs, any tiebreak and independent appeals use the frozen version and situation. Six existing 0–10 wire keys retain their storage shape with these v2 meanings:

| Stored key | V2 criterion |
| --- | --- |
| `clarity` | Understandable action and intention |
| `originality` | Useful originality of the idea |
| `specificity` | Concrete causal connection |
| `theme_fit` | Coherence with the shared situation |
| `archetype_fit` | Internal consistency of the proposed move |
| `dramatic_potential` | A legible consequence in the scene |

Named props or theme keywords are not mandatory. Style, verbosity and guessed authoring method confer no advantage; language errors matter only when the meaning is unclear. Automatic-victory claims are not evidence. Equivalent ideas may tie. V2 removes the old word-only normalization penalty; version 1 retains it. Move counters and stats stay in the existing combat calculation. These are requirements expressed to the model, not a claim that model fairness has already been established.

Results reuse the recorded explanation and policy-appropriate rubric labels. Resolved-move review exposes the frozen situation and both final texts on demand. Video composition uses the same frozen inputs and server result; video cannot decide a winner or block the free result. Existing pre/post-generation moderation, blur and refunds remain mandatory.

The evaluation corpus contains 240 authored candidate comparisons with explicit expected winners/draws: 160 tuning and 80 holdout cases, separated by scenario family. They are not independently human-reviewed gold. A passing evaluation requires complete human-reviewed holdout evidence from the exact actual configured model and policy with no fallback, at least 90% expected-outcome accuracy, signed verbosity advantage no greater than 1/60 separately for PL and EN, stable swapped positions and locale/identical-text comparisons, draw and KO drift no greater than 5 percentage points and median score-gap drift no greater than 20% against the paired legacy baseline. Mock output and unit tests cannot satisfy these checks.

New ranked composer assignments no longer require composer enable/season-approval flags or primary-model calibration evidence at request time. The calibration corpus, metrics, explicit paid runner and durable evidence remain available for quality evaluation; no results are fabricated to enable ranked. Independent appeal availability still requires its own eligible real-model calibration for the frozen policy, and mock fallback/rating protections remain unchanged. Remaining native acceptance, human review and the 12-person pilot are outstanding validation work, not hidden substitutes for the removed runtime gates. Completed native checks and their limits are recorded in the remediation evidence below. An already assigned series always retains its policy.

### Private measurement and operations

Round-aware telemetry records semantic milestones and active foreground/focused duration, never prompt text, fragments, names or keystrokes. It covers first change, mode/choice/edit/recovery/submit, action changes, new-set application (automatic for requested refreshes), waiting/fallback, explanation and next battle. New Approach, Next/Back and adaptation request/result events carry bounded sequence numbers in a separate ownership-protected occurrence table; existing milestone conflict keys remain unchanged. Navigation does not create measurement sessions. Inspiration selection remains only for older-client compatibility. Accepted prompts declare optional authoring_origin builder/manual/mixed/unknown, retry-stable and excluded from judging. Appeal UI still distinguishes checking, ready, unavailable and read error; read errors block submission and 409 refreshes availability.

The authorized deployment enables all composer modes and suggestion availability together. The existing `SUGGESTIONS_AI_DISABLED=true` emergency switch can stop new suggestion generation and new paid reservations; `SUGGESTIONS_PREFETCH_ENABLED=0` stops prefetch only. Exact-operation recovery, refunds and free authored drafting remain available. Removed rollout variables have no effect, and withdrawing new composer assignment requires a compatible code change rather than an obsolete secret. Do not delete snapshots, drafts, purchase operations or ledger evidence, or roll servers back to code that cannot read v2. See the release runbook for deployment checks and actual evidence status.

Implementation evidence for the 2 October remediation is tracked in [the remediation record](plans/2026-10-02-composer-remediation.md). Backend fixes precede the compatible TestFlight client; Android delivery is a test APK only. No public store publication or paid human/model calibration is included.

The earlier four-view release is recorded in [its historical delivery record](deployments/2026-10-07-composer-four-view.md). The subsequent Face-off refinement supersedes its editing and navigation behavior and adds per-step purchases. Deploy the additive paid-step migration and endpoint after tests, before any future compatible client release. Experience 2, client contract 3, situation snapshots, judge policy, bots and ranking remain unchanged. **The current task authorizes backend deployment only: no new app build, TestFlight submission, Android artifact, OTA update or store release.** Current evidence and deployment status are in [the Face-off delivery record](deployments/2026-10-07-composer-faceoff.md). Previous AI availability issues, paid model calibration, human pilot and unrelated result presentation remain separate; starting generation earlier is not evidence of fixing provider availability.
